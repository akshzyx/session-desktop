import semver from 'semver';
import _ from 'lodash';

import { getSnodePoolFromSnodes, getSnodesFromSeedUrl, requestSnodesForPubkey } from './SNodeAPI';

import * as Data from '../../../ts/data/data';

import { allowOnlyOneAtATime } from '../utils/Promise';
import pRetry from 'p-retry';
import { ed25519Str } from '../onions/onionPath';

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

// This should be renamed to `allNodes` or something
let randomSnodePool: Array<Data.Snode> = [];

// We only store nodes' identifiers here,
const swarmCache: Map<string, Array<string>> = new Map();

export type SeedNode = {
  url: string;
  ip_url: string;
};

// just get the filtered list
async function tryGetSnodeListFromLokidSeednode(
  seedNodes: Array<SeedNode>
): Promise<Array<Data.Snode>> {
  window?.log?.info('tryGetSnodeListFromLokidSeednode starting...');

  if (!seedNodes.length) {
    window?.log?.info('loki_snode_api::tryGetSnodeListFromLokidSeednode - seedNodes are empty');
    return [];
  }

  const seedNode = _.sample(seedNodes);
  if (!seedNode) {
    window?.log?.warn(
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
      window?.log?.warn(
        `loki_snode_api::tryGetSnodeListFromLokidSeednode - ${seedNode.url} did not return any snodes, falling back to IP`,
        seedNode.ip_url
      );
      // fall back on ip_url
      const tryIpUrl = new URL(seedNode.ip_url);
      snodes = await getSnodesFromSeedUrl(tryIpUrl);
      if (snodes.length === 0) {
        window?.log?.warn(
          `loki_snode_api::tryGetSnodeListFromLokidSeednode - ${seedNode.ip_url} did not return any snodes`
        );
        // does this error message need to be exactly this?
        throw new window.textsecure.SeedNodeError('Failed to contact seed node');
      }
    } else {
      window?.log?.info(
        `loki_snode_api::tryGetSnodeListFromLokidSeednode - ${seedNode.url} returned ${snodes.length} snodes`
      );
    }
    return snodes;
  } catch (e) {
    window?.log?.warn(
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

/**
 * Drop a snode from the snode pool. This does not update the swarm containing this snode.
 * Use `dropSnodeFromSwarmIfNeeded` for that
 * @param snodeEd25519 the snode ed25519 to drop from the snode pool
 */
export async function dropSnodeFromSnodePool(snodeEd25519: string) {
  const exists = _.some(randomSnodePool, x => x.pubkey_ed25519 === snodeEd25519);
  if (exists) {
    _.remove(randomSnodePool, x => x.pubkey_ed25519 === snodeEd25519);
    await Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));

    window?.log?.warn(
      `Marking ${ed25519Str(snodeEd25519)} as unreachable, ${
        randomSnodePool.length
      } snodes remaining in randomPool`
    );
  }
}

/**
 *
 * @param excluding can be used to exclude some nodes from the random list. Useful to rebuild a path excluding existing node already in a path
 */
export async function getRandomSnode(excludingEd25519Snode?: Array<string>): Promise<Data.Snode> {
  // resolve random snode
  if (randomSnodePool.length === 0) {
    // Should not this be saved to the database?
    await refreshRandomPool();

    if (randomSnodePool.length === 0) {
      throw new window.textsecure.SeedNodeError('Invalid seed node response');
    }
  }
  // We know the pool can't be empty at this point
  if (!excludingEd25519Snode) {
    return _.sample(randomSnodePool) as Data.Snode;
  }

  // we have to double check even after removing the nodes to exclude we still have some nodes in the list
  const snodePoolExcluding = randomSnodePool.filter(
    e => !excludingEd25519Snode.includes(e.pubkey_ed25519)
  );
  if (!snodePoolExcluding || !snodePoolExcluding.length) {
    if (window?.textsecure) {
      throw new window.textsecure.SeedNodeError(
        'Not enough snodes with excluding length',
        excludingEd25519Snode.length
      );
    }
    // used for tests
    throw new Error('SeedNodeError');
  }
  return _.sample(snodePoolExcluding) as Data.Snode;
}

/**
 * This function force the snode poll to be refreshed from a random seed node again.
 * This should be called once in a day or so for when the app it kept on.
 */
export async function forceRefreshRandomSnodePool(): Promise<Array<Data.Snode>> {
  await refreshRandomPool(true);

  return randomSnodePool;
}

export async function getRandomSnodePool(): Promise<Array<Data.Snode>> {
  if (randomSnodePool.length === 0) {
    await refreshRandomPool();
  }
  return randomSnodePool;
}

async function getSnodeListFromLokidSeednode(
  seedNodes: Array<SeedNode>,
  retries = 0
): Promise<Array<Data.Snode>> {
  const SEED_NODE_RETRIES = 3;
  window?.log?.info('getSnodeListFromLokidSeednode starting...');
  if (!seedNodes.length) {
    window?.log?.info('loki_snode_api::getSnodeListFromLokidSeednode - seedNodes are empty');
    return [];
  }
  let snodes: Array<Data.Snode> = [];
  try {
    snodes = await tryGetSnodeListFromLokidSeednode(seedNodes);
  } catch (e) {
    window?.log?.warn('loki_snode_api::getSnodeListFromLokidSeednode - error', e.code, e.message);
    // handle retries in case of temporary hiccups
    if (retries < SEED_NODE_RETRIES) {
      setTimeout(async () => {
        window?.log?.info(
          'loki_snode_api::getSnodeListFromLokidSeednode - Retrying initialising random snode pool, try #',
          retries,
          'seed nodes total',
          seedNodes.length
        );
        try {
          await getSnodeListFromLokidSeednode(seedNodes, retries + 1);
        } catch (e) {
          window?.log?.warn('getSnodeListFromLokidSeednode failed retr y #', retries, e);
        }
      }, retries * retries * 5000);
    } else {
      window?.log?.error('loki_snode_api::getSnodeListFromLokidSeednode - failing');
      throw new window.textsecure.SeedNodeError('Failed to contact seed node');
    }
  }
  return snodes;
}

/**
 * Fetch all snodes from a seed nodes if we don't have enough snodes to make the request ourself.
 * Exported only for tests. This is not to be used by the app directly
 * @param seedNodes the seednodes to use to fetch snodes details
 */
export async function refreshRandomPoolDetail(
  seedNodes: Array<SeedNode>
): Promise<Array<Data.Snode>> {
  let snodes = [];
  try {
    window?.log?.info(`refreshRandomPoolDetail with seedNodes.length ${seedNodes.length}`);

    snodes = await getSnodeListFromLokidSeednode(seedNodes);
    // make sure order of the list is random, so we get version in a non-deterministic way
    snodes = _.shuffle(snodes);
    // commit changes to be live
    // we'll update the version (in case they upgrade) every cycle
    const fetchSnodePool = snodes.map((snode: any) => ({
      ip: snode.public_ip,
      port: snode.storage_port,
      pubkey_x25519: snode.pubkey_x25519,
      pubkey_ed25519: snode.pubkey_ed25519,
      version: '',
    }));
    window?.log?.info(
      'LokiSnodeAPI::refreshRandomPool - Refreshed random snode pool with',
      snodes.length,
      'snodes'
    );
    return fetchSnodePool;
  } catch (e) {
    window?.log?.warn('LokiSnodeAPI::refreshRandomPool - error', e.code, e.message);
    /*
        log.error(
          'LokiSnodeAPI:::refreshRandomPoolPromise -  Giving up trying to contact seed node'
        );
        */
    if (snodes.length === 0) {
      throw new window.textsecure.SeedNodeError('Failed to contact seed node');
    }
    return [];
  }
}
/**
 * This function runs only once at a time, and fetches the snode pool from a random seed node,
 *  or if we have enough snodes, fetches the snode pool from one of the snode.
 */
export async function refreshRandomPool(forceRefresh = false): Promise<void> {
  const seedNodes = window.getSeedNodeList();

  if (!seedNodes || !seedNodes.length) {
    window?.log?.error(
      'LokiSnodeAPI:::refreshRandomPool - getSeedNodeList has not been loaded yet'
    );

    return;
  }
  window?.log?.info("right before allowOnlyOneAtATime 'refreshRandomPool'");

  return allowOnlyOneAtATime('refreshRandomPool', async () => {
    window?.log?.info("running allowOnlyOneAtATime 'refreshRandomPool'");

    // if we have forceRefresh set, we want to request snodes from snodes or from the seed server.
    if (randomSnodePool.length === 0 && !forceRefresh) {
      const fetchedFromDb = await Data.getSnodePoolFromDb();
      // write to memory only if it is valid.
      // if the size is not enough. we will contact a seed node.
      if (fetchedFromDb?.length) {
        window?.log?.info(`refreshRandomPool: fetched from db ${fetchedFromDb.length} snodes.`);
        randomSnodePool = fetchedFromDb;
        if (randomSnodePool.length < minSnodePoolCount) {
          window?.log?.warn('refreshRandomPool: not enough snodes in db, going to fetch from seed');
        } else {
          return;
        }
      } else {
        window?.log?.warn('refreshRandomPool: did not find snodes in db.');
      }
    }

    // we don't have nodes to fetch the pool from them, so call the seed node instead.
    if (randomSnodePool.length < minSnodePoolCount) {
      window?.log?.info(
        `refreshRandomPool: NOT enough snodes to fetch from them, so falling back to seedNodes ${seedNodes?.length}`
      );

      randomSnodePool = await exports.refreshRandomPoolDetail(seedNodes);
      await Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));
      return;
    }
    try {
      window?.log?.info(
        `refreshRandomPool: enough snodes to fetch from them, so we try using them ${randomSnodePool.length}`
      );

      // let this request try 3 (3+1) times. If all those requests end up without having a consensus,
      // fetch the snode pool from one of the seed nodes (see the catch).
      await pRetry(
        async () => {
          const commonNodes = await getSnodePoolFromSnodes();

          if (!commonNodes || commonNodes.length < requiredSnodesForAgreement) {
            // throwing makes trigger a retry if we have some left.
            window?.log?.info(`refreshRandomPool: Not enough common nodes ${commonNodes?.length}`);
            throw new Error('Not enough common nodes.');
          }
          window?.log?.info('updating snode list with snode pool length:', commonNodes.length);
          randomSnodePool = commonNodes;
          await Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));
        },
        {
          retries: 3,
          factor: 1,
          minTimeout: 1000,
          onFailedAttempt: e => {
            window?.log?.warn(
              `getSnodePoolFromSnodes attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`
            );
          },
        }
      );
    } catch (e) {
      window?.log?.warn(
        'Failed to fetch snode pool from snodes. Fetching from seed node instead:',
        e
      );

      // fallback to a seed node fetch of the snode pool
      randomSnodePool = await exports.refreshRandomPoolDetail(seedNodes);
      await Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));
    }
  });
}

/**
 * Drop a snode from the list of swarm for that specific publicKey
 * @param pubkey the associatedWith publicKey
 * @param snodeToDropEd25519 the snode pubkey to drop
 */
export async function dropSnodeFromSwarmIfNeeded(
  pubkey: string,
  snodeToDropEd25519: string
): Promise<void> {
  // this call either used the cache or fetch the swarm from the db
  const existingSwarm = await getSwarmFromCacheOrDb(pubkey);

  if (!existingSwarm.includes(snodeToDropEd25519)) {
    return;
  }

  const updatedSwarm = existingSwarm.filter(ed25519 => ed25519 !== snodeToDropEd25519);
  await internalUpdateSwarmFor(pubkey, updatedSwarm);
}

export async function updateSwarmFor(pubkey: string, snodes: Array<Data.Snode>): Promise<void> {
  const edkeys = snodes.map((sn: Data.Snode) => sn.pubkey_ed25519);
  await internalUpdateSwarmFor(pubkey, edkeys);
}

async function internalUpdateSwarmFor(pubkey: string, edkeys: Array<string>) {
  // update our in-memory cache
  swarmCache.set(pubkey, edkeys);
  // write this change to the db
  await Data.updateSwarmNodesForPubkey(pubkey, edkeys);
}

export async function getSwarmFromCacheOrDb(pubkey: string): Promise<Array<string>> {
  // NOTE: important that maybeNodes is not [] here
  const existingCache = swarmCache.get(pubkey);
  if (existingCache === undefined) {
    // First time access, no cache yet, let's try the database.
    const nodes = await Data.getSwarmNodesForPubkey(pubkey);
    // if no db entry, this returns []
    swarmCache.set(pubkey, nodes);
    return nodes;
  }
  // cache already set, use it
  return existingCache;
}

/**
 * This call fetch from cache or db the swarm and extract only the one currently reachable.
 * If not enough snodes valid are in the swarm, if fetches new snodes for this pubkey from the network.
 */
export async function getSwarmFor(pubkey: string): Promise<Array<Data.Snode>> {
  const nodes = await getSwarmFromCacheOrDb(pubkey);

  // See how many are actually still reachable
  // the nodes still reachable are the one still present in the snode pool
  const goodNodes = randomSnodePool.filter(
    (n: Data.Snode) => nodes.indexOf(n.pubkey_ed25519) !== -1
  );

  if (goodNodes.length >= minSwarmSnodeCount) {
    return goodNodes;
  }

  // Request new node list from the network
  const freshNodes = _.shuffle(await requestSnodesForPubkey(pubkey));

  const edkeys = freshNodes.map((n: Data.Snode) => n.pubkey_ed25519);
  await internalUpdateSwarmFor(pubkey, edkeys);

  return freshNodes;
}
