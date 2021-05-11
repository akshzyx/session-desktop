import semver from 'semver';
import _ from 'lodash';

import {
  getSnodePoolFromSnodes,
  getSnodesFromSeedUrl,
  requestSnodesForPubkey,
} from './serviceNodeAPI';

import * as Data from '../../../ts/data/data';

export type SnodeEdKey = string;
import { allowOnlyOneAtATime } from '../utils/Promise';
import pRetry from 'p-retry';

/**
 * If we get less than this snode in a swarm, we fetch new snodes for this pubkey
 */
const minSwarmSnodeCount = 3;

/**
 * If we get less than minSnodePoolCount we consider that we need to fetch the new snode pool from a seed node
 * and not from those snodes.
 */
const minSnodePoolCount = 12;

/**
 * If we do a request to fetch nodes from snodes and they don't return at least
 * the same `requiredSnodesForAgreement` snodes we consider that this is not a valid return.
 *
 * Too many nodes are not shared for this call to be trustworthy
 */
export const requiredSnodesForAgreement = 24;

export interface Snode {
  ip: string;
  port: number;
  pubkey_x25519: string;
  pubkey_ed25519: SnodeEdKey;
  version: string;
}

// This should be renamed to `allNodes` or something
let randomSnodePool: Array<Snode> = [];

// We only store nodes' identifiers here,
const nodesForPubkey: Map<string, Array<SnodeEdKey>> = new Map();

export type SeedNode = {
  url: string;
  ip_url: string;
};

// just get the filtered list
async function tryGetSnodeListFromLokidSeednode(seedNodes: Array<SeedNode>): Promise<Array<Snode>> {
  const { log } = window;

  if (!seedNodes.length) {
    log.info('loki_snode_api::tryGetSnodeListFromLokidSeednode - seedNodes are empty');
    return [];
  }

  const seedNode = _.sample(seedNodes);
  if (!seedNode) {
    log.warn(
      'loki_snode_api::tryGetSnodeListFromLokidSeednode - Could not select random snodes from',
      seedNodes
    );
    return [];
  }
  let snodes = [];
  try {
    const tryUrl = new URL(seedNode.url);

    snodes = await getSnodesFromSeedUrl(tryUrl);
    // throw before clearing the lock, so the retries can kick in
    if (snodes.length === 0) {
      log.warn(
        `loki_snode_api::tryGetSnodeListFromLokidSeednode - ${seedNode.url} did not return any snodes, falling back to IP`,
        seedNode.ip_url
      );
      // fall back on ip_url
      const tryIpUrl = new URL(seedNode.ip_url);
      snodes = await getSnodesFromSeedUrl(tryIpUrl);
      if (snodes.length === 0) {
        log.warn(
          `loki_snode_api::tryGetSnodeListFromLokidSeednode - ${seedNode.ip_url} did not return any snodes`
        );
        // does this error message need to be exactly this?
        throw new window.textsecure.SeedNodeError('Failed to contact seed node');
      }
    }
    if (snodes.length) {
      log.info(
        `loki_snode_api::tryGetSnodeListFromLokidSeednode - ${seedNode.url} returned ${snodes.length} snodes`
      );
    }
    return snodes;
  } catch (e) {
    log.warn(
      'LokiSnodeAPI::tryGetSnodeListFromLokidSeednode - error',
      e.code,
      e.message,
      'on',
      seedNode
    );
    if (snodes.length === 0) {
      throw new window.textsecure.SeedNodeError('Failed to contact seed node');
    }
  }
  return [];
}

export function markNodeUnreachable(snode: Snode): void {
  const { log } = window;
  _.remove(randomSnodePool, x => x.pubkey_ed25519 === snode.pubkey_ed25519);

  for (const [pubkey, nodes] of nodesForPubkey) {
    const edkeys = _.filter(nodes, edkey => edkey !== snode.pubkey_ed25519);

    void internalUpdateSnodesFor(pubkey, edkeys);
  }

  log.warn(
    `Marking ${snode.ip}:${snode.port} as unreachable, ${randomSnodePool.length} snodes remaining in randomPool`
  );
}

export async function getRandomSnodeAddress(): Promise<Snode> {
  // resolve random snode
  if (randomSnodePool.length === 0) {
    // TODO: ensure that we only call this once at a time
    // Should not this be saved to the database?
    await refreshRandomPool();

    if (randomSnodePool.length === 0) {
      throw new window.textsecure.SeedNodeError('Invalid seed node response');
    }
  }

  // We know the pool can't be empty at this point
  return _.sample(randomSnodePool) as Snode;
}

/**
 * This function force the snode poll to be refreshed from a random seed node again.
 * This should be called once in a day or so for when the app it kept on.
 */
export async function forceRefreshRandomSnodePool(): Promise<Array<Snode>> {
  await refreshRandomPool();

  return randomSnodePool;
}

export async function getRandomSnodePool(): Promise<Array<Snode>> {
  if (randomSnodePool.length === 0) {
    await refreshRandomPool();
  }
  return randomSnodePool;
}

// not cacheable because we write to this.randomSnodePool elsewhere
export function getNodesMinVersion(minVersion: string): Array<Snode> {
  return randomSnodePool.filter((node: any) => node.version && semver.gt(node.version, minVersion));
}

async function getSnodeListFromLokidSeednode(
  seedNodes: Array<SeedNode>,
  retries = 0
): Promise<Array<Snode>> {
  const SEED_NODE_RETRIES = 3;

  const { log } = window;

  if (!seedNodes.length) {
    log.info('loki_snode_api::getSnodeListFromLokidSeednode - seedNodes are empty');
    return [];
  }
  let snodes: Array<Snode> = [];
  try {
    snodes = await tryGetSnodeListFromLokidSeednode(seedNodes);
  } catch (e) {
    log.warn('loki_snode_api::getSnodeListFromLokidSeednode - error', e.code, e.message);
    // handle retries in case of temporary hiccups
    if (retries < SEED_NODE_RETRIES) {
      setTimeout(() => {
        log.info(
          'loki_snode_api::getSnodeListFromLokidSeednode - Retrying initialising random snode pool, try #',
          retries,
          'seed nodes total',
          seedNodes.length
        );
        void getSnodeListFromLokidSeednode(seedNodes, retries + 1);
      }, retries * retries * 5000);
    } else {
      log.error('loki_snode_api::getSnodeListFromLokidSeednode - failing');
      throw new window.textsecure.SeedNodeError('Failed to contact seed node');
    }
  }
  return snodes;
}

/**
 * Fetch all snodes from a seed nodes if we don't have enough snodes to make the request ourself
 * @param seedNodes the seednodes to use to fetch snodes details
 */
async function refreshRandomPoolDetail(seedNodes: Array<SeedNode>): Promise<void> {
  const { log } = window;

  let snodes = [];
  try {
    snodes = await getSnodeListFromLokidSeednode(seedNodes);
    // make sure order of the list is random, so we get version in a non-deterministic way
    snodes = _.shuffle(snodes);
    // commit changes to be live
    // we'll update the version (in case they upgrade) every cycle
    randomSnodePool = snodes.map((snode: any) => ({
      ip: snode.public_ip,
      port: snode.storage_port,
      pubkey_x25519: snode.pubkey_x25519,
      pubkey_ed25519: snode.pubkey_ed25519,
      version: '',
    }));
    log.info(
      'LokiSnodeAPI::refreshRandomPool - Refreshed random snode pool with',
      randomSnodePool.length,
      'snodes'
    );
  } catch (e) {
    log.warn('LokiSnodeAPI::refreshRandomPool - error', e.code, e.message);
    /*
        log.error(
          'LokiSnodeAPI:::refreshRandomPoolPromise -  Giving up trying to contact seed node'
        );
        */
    if (snodes.length === 0) {
      throw new window.textsecure.SeedNodeError('Failed to contact seed node');
    }
  }
}
/**
 * This function runs only once at a time, and fetches the snode pool from a random seed node,
 *  or if we have enough snodes, fetches the snode pool from one of the snode.
 */
export async function refreshRandomPool(): Promise<void> {
  const { log } = window;

  if (!window.seedNodeList || !window.seedNodeList.length) {
    log.error('LokiSnodeAPI:::refreshRandomPool - seedNodeList has not been loaded yet');
    return;
  }
  // tslint:disable-next-line:no-parameter-reassignment
  const seedNodes = window.seedNodeList;

  return allowOnlyOneAtATime('refreshRandomPool', async () => {
    // we don't have nodes to fetch the pool from them, so call the seed node instead.
    if (randomSnodePool.length < minSnodePoolCount) {
      await refreshRandomPoolDetail(seedNodes);
      return;
    }
    try {
      // let this request try 3 (2+1) times. If all those requests end up without having a consensus,
      // fetch the snode pool from one of the seed nodes (see the catch).
      await pRetry(
        async () => {
          const commonNodes = await getSnodePoolFromSnodes();
          if (!commonNodes || commonNodes.length < requiredSnodesForAgreement) {
            // throwing makes trigger a retry if we have some left.
            throw new Error('Not enough common nodes.');
          }
          window.log.info('updating snode list with snode pool length:', commonNodes.length);
          randomSnodePool = commonNodes;
        },
        {
          retries: 2,
          factor: 1,
          minTimeout: 1000,
        }
      );
    } catch (e) {
      window.log.warn(
        'Failed to fetch snode pool from snodes. Fetching from seed node instead:',
        e
      );
      // fallback to a seed node fetch of the snode pool
      await refreshRandomPoolDetail(seedNodes);
    }
  });
}

export async function updateSnodesFor(pubkey: string, snodes: Array<Snode>): Promise<void> {
  const edkeys = snodes.map((sn: Snode) => sn.pubkey_ed25519);
  await internalUpdateSnodesFor(pubkey, edkeys);
}

async function internalUpdateSnodesFor(pubkey: string, edkeys: Array<string>) {
  // update our in-memory cache
  nodesForPubkey.set(pubkey, edkeys);
  // write this change to the db
  await Data.updateSwarmNodesForPubkey(pubkey, edkeys);
}

export async function getSwarm(pubkey: string): Promise<Array<Snode>> {
  const maybeNodes = nodesForPubkey.get(pubkey);
  let nodes: Array<string>;

  // NOTE: important that maybeNodes is not [] here
  if (maybeNodes === undefined) {
    // First time access, no cache yet, let's try the database.
    nodes = await Data.getSwarmNodesForPubkey(pubkey);
    nodesForPubkey.set(pubkey, nodes);
  } else {
    nodes = maybeNodes;
  }

  // See how many are actually still reachable
  const goodNodes = randomSnodePool.filter((n: Snode) => nodes.indexOf(n.pubkey_ed25519) !== -1);

  if (goodNodes.length < minSwarmSnodeCount) {
    // Request new node list from the network
    const freshNodes = _.shuffle(await requestSnodesForPubkey(pubkey));

    const edkeys = freshNodes.map((n: Snode) => n.pubkey_ed25519);
    await internalUpdateSnodesFor(pubkey, edkeys);

    return freshNodes;
  } else {
    return goodNodes;
  }
}
