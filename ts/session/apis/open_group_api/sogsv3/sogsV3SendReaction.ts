import { AbortSignal } from 'abort-controller';
import { Data } from '../../../../data/data';
import { Action, OpenGroupReactionResponse, Reaction } from '../../../../types/Reaction';
import { getEmojiDataFromNative } from '../../../../util/emoji';
import { OnionSending } from '../../../onions/onionSend';
import { OpenGroupPollingUtils } from '../opengroupV2/OpenGroupPollingUtils';
import { batchGlobalIsSuccess, parseBatchGlobalStatusCode } from './sogsV3BatchPoll';

export const hasReactionSupport = async (serverId: number): Promise<boolean> => {
  const found = await Data.getMessageByServerId(serverId);
  if (!found) {
    window.log.warn(`Open Group Message ${serverId} not found in db`);
    return false;
  }

  const conversationModel = found?.getConversation();
  if (!conversationModel) {
    window.log.warn(`Conversation for ${serverId} not found in db`);
    return false;
  }

  if (!conversationModel.hasReactions()) {
    window.log.warn("This open group doesn't have reaction support. Server Message ID", serverId);
    return false;
  }

  return true;
};

export const sendSogsReactionOnionV4 = async (
  serverUrl: string,
  room: string,
  abortSignal: AbortSignal,
  reaction: Reaction,
  blinded: boolean
): Promise<boolean> => {
  const allValidRoomInfos = OpenGroupPollingUtils.getAllValidRoomInfos(serverUrl, new Set([room]));
  if (!allValidRoomInfos?.length) {
    window?.log?.info('getSendReactionRequest: no valid roominfos got.');
    throw new Error(`Could not find sogs pubkey of url:${serverUrl}`);
  }

  const canReact = await hasReactionSupport(reaction.id);
  if (!canReact) {
    return false;
  }

  // for an invalid reaction we use https://emojipedia.org/frame-with-an-x/ as a replacement since it cannot rendered as an emoji
  const emoji = getEmojiDataFromNative(reaction.emoji) ? reaction.emoji : '🖾';
  const endpoint = `/room/${room}/reaction/${reaction.id}/${emoji}`;
  const method = reaction.action === Action.REACT ? 'PUT' : 'DELETE';
  const serverPubkey = allValidRoomInfos[0].serverPublicKey;

  // reaction endpoint requires an empty dict {}
  const stringifiedBody = null;
  const result = await OnionSending.sendJsonViaOnionV4ToSogs({
    serverUrl,
    endpoint,
    serverPubkey,
    method,
    abortSignal,
    blinded,
    stringifiedBody,
    headers: null,
    throwErrors: true,
  });

  if (!batchGlobalIsSuccess(result)) {
    window?.log?.warn('sendSogsReactionWithOnionV4 Got unknown status code; res:', result);
    throw new Error(
      `sendSogsReactionOnionV4: invalid status code: ${parseBatchGlobalStatusCode(result)}`
    );
  }

  if (!result) {
    throw new Error('Could not putReaction, res is invalid');
  }

  const rawMessage = result.body as OpenGroupReactionResponse;
  if (!rawMessage) {
    throw new Error('putReaction parsing failed');
  }

  window.log.info(
    `You ${reaction.action === Action.REACT ? 'added' : 'removed'} a`,
    reaction.emoji,
    `reaction on ${serverUrl}/${room}`
  );
  const success = Boolean(reaction.action === Action.REACT ? rawMessage.added : rawMessage.removed);
  return success;
};
