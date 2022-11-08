import { isEmpty } from 'lodash';
import { Snode } from '../../../data/data';
import { updateIsOnline } from '../../../state/ducks/onion';
import { getSodiumRenderer } from '../../crypto';
import { UserUtils, StringUtils } from '../../utils';
import { fromHexToArray, fromUInt8ArrayToBase64 } from '../../utils/String';
import { doSnodeBatchRequest } from './batchRequest';
import { GetNetworkTime } from './getNetworkTime';
import { RetrievePubkeySubRequestType, RetrieveSubRequestType } from './SnodeRequestTypes';

async function getRetrieveSignatureParams(params: {
  pubkey: string;
  lastHash: string;
  namespace: number;
}): Promise<{
  timestamp: number;
  signature: string;
  pubkey_ed25519: string;
  namespace: number;
} | null> {
  const ourPubkey = UserUtils.getOurPubKeyFromCache();
  const ourEd25519Key = await UserUtils.getUserED25519KeyPair();

  if (isEmpty(params?.pubkey) || ourPubkey.key !== params.pubkey || !ourEd25519Key) {
    return null;
  }
  const namespace = params.namespace || 0;
  const edKeyPrivBytes = fromHexToArray(ourEd25519Key?.privKey);

  const signatureTimestamp = GetNetworkTime.getNowWithNetworkOffset();

  const verificationData = StringUtils.encode(`retrieve${namespace}${signatureTimestamp}`, 'utf8');
  const message = new Uint8Array(verificationData);

  const sodium = await getSodiumRenderer();
  try {
    const signature = sodium.crypto_sign_detached(message, edKeyPrivBytes);
    const signatureBase64 = fromUInt8ArrayToBase64(signature);

    return {
      timestamp: signatureTimestamp,
      signature: signatureBase64,
      pubkey_ed25519: ourEd25519Key.pubKey,
      namespace,
    };
  } catch (e) {
    window.log.warn('getSignatureParams failed with: ', e.message);
    return null;
  }
}

async function buildRetrieveRequest(
  lastHashes: Array<string>,
  pubkey: string,
  namespaces: Array<number>
): Promise<Array<RetrieveSubRequestType>> {
  const retrieveRequestsParams = await Promise.all(
    namespaces.map(async (namespace, index) => {
      const retrieveParam = {
        pubkey,
        lastHash: lastHashes.at(index) || '',
        namespace,
      };
      const signatureBuilt = await getRetrieveSignatureParams(retrieveParam);
      const signatureParams = signatureBuilt || {};
      const retrieve: RetrievePubkeySubRequestType = {
        method: 'retrieve',
        params: { ...signatureParams, ...retrieveParam },
      };
      return retrieve;
    })
  );

  return retrieveRequestsParams;
}

/** */
async function retrieveNextMessages(
  targetNode: Snode,
  lastHashes: Array<string>,
  associatedWith: string,
  namespaces: Array<number>
): Promise<Array<any>> {
  if (namespaces.length !== lastHashes.length) {
    throw new Error('namespaces and lasthashes does not match');
  }

  const retrieveRequestsParams = await buildRetrieveRequest(lastHashes, associatedWith, namespaces);
  // let exceptions bubble up
  // no retry for this one as this a call we do every few seconds while polling for messages

  const results = await doSnodeBatchRequest(retrieveRequestsParams, targetNode, 4000);

  if (!results || !results.length) {
    window?.log?.warn(
      `_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`
    );
    throw new Error(
      `_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`
    );
  }

  if (results.length !== namespaces.length) {
    throw new Error(
      `We asked for updates about ${namespaces.length} messages but got results of length ${results.length}`
    );
  }

  if (namespaces.length > 1) {
    throw new Error('multiple namespace polling todo');
  }
  const firstResult = results[0];

  if (firstResult.code !== 200) {
    window?.log?.warn(`retrieveNextMessages result is not 200 but ${firstResult.code}`);
    throw new Error(
      `_retrieveNextMessages - retrieve result is not 200 with ${targetNode.ip}:${targetNode.port} but ${firstResult.code}`
    );
  }

  try {
    const json = firstResult.body;
    if (!window.inboxStore?.getState().onionPaths.isOnline) {
      window.inboxStore?.dispatch(updateIsOnline(true));
    }

    GetNetworkTime.handleTimestampOffsetFromNetwork('retrieve', json.t);

    return json.messages || [];
  } catch (e) {
    window?.log?.warn('exception while parsing json of nextMessage:', e);
    if (!window.inboxStore?.getState().onionPaths.isOnline) {
      window.inboxStore?.dispatch(updateIsOnline(true));
    }
    throw new Error(
      `_retrieveNextMessages - exception while parsing json of nextMessage ${targetNode.ip}:${targetNode.port}: ${e?.message}`
    );
  }
}

export const SnodeAPIRetrieve = { retrieveNextMessages };
