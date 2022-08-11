import { isEmpty } from 'lodash';
import { Data } from '../data/data';
import { MessageModel } from '../models/message';
import { SignalService } from '../protobuf';
import { getUsBlindedInThatServer } from '../session/apis/open_group_api/sogsv3/knownBlindedkeys';
import { UserUtils } from '../session/utils';

import { OpenGroupReactionList, ReactionList, RecentReactions } from '../types/Reaction';
import { getRecentReactions, saveRecentReations } from '../util/storage';

const rateCountLimit = 20;
const rateTimeLimit = 60 * 1000;
const latestReactionTimestamps: Array<number> = [];

/**
 * Retrieves the original message of a reaction
 */
const getMessageByReaction = async (
  reaction: SignalService.DataMessage.IReaction,
  isOpenGroup: boolean
): Promise<MessageModel | null> => {
  let originalMessage = null;
  const originalMessageId = Number(reaction.id);
  const originalMessageAuthor = reaction.author;

  if (isOpenGroup) {
    originalMessage = await Data.getMessageByServerId(originalMessageId);
  } else {
    const collection = await Data.getMessagesBySentAt(originalMessageId);
    originalMessage = collection.find((item: MessageModel) => {
      const messageTimestamp = item.get('sent_at');
      const author = item.get('source');
      return Boolean(
        messageTimestamp &&
          messageTimestamp === originalMessageId &&
          author &&
          author === originalMessageAuthor
      );
    });
  }

  if (!originalMessage) {
    window?.log?.warn(`Cannot find the original reacted message ${originalMessageId}.`);
    return null;
  }

  return originalMessage;
};

/**
 * Sends a Reaction Data Message, don't use for OpenGroups
 */
export const sendMessageReaction = async (messageId: string, emoji: string) => {
  const timestamp = Date.now();
  latestReactionTimestamps.push(timestamp);

  if (latestReactionTimestamps.length > rateCountLimit) {
    const firstTimestamp = latestReactionTimestamps[0];
    if (timestamp - firstTimestamp < rateTimeLimit) {
      latestReactionTimestamps.pop();
      return;
    } else {
      latestReactionTimestamps.shift();
    }
  }

  const found = await Data.getMessageById(messageId);

  if (found) {
    const conversationModel = found?.getConversation();
    if (!conversationModel) {
      window.log.warn(`Conversation for ${messageId} not found in db`);
      return;
    }

    const isOpenGroup = Boolean(found?.get('isPublic'));
    const id = (isOpenGroup && found.get('serverId')) || Number(found.get('sent_at'));
    const me =
      (isOpenGroup && getUsBlindedInThatServer(conversationModel)) ||
      UserUtils.getOurPubKeyStrFromCache();
    const author = found.get('source');
    let action = 0;

    const reacts = found.get('reacts');
    if (
      reacts &&
      Object.keys(reacts).includes(emoji) &&
      Object.keys(reacts[emoji].senders).includes(me)
    ) {
      window.log.info('found matching reaction removing it');
      action = 1;
    } else {
      const reactions = getRecentReactions();
      if (reactions) {
        await updateRecentReactions(reactions, emoji);
      }
    }

    const reaction = {
      id,
      author,
      emoji,
      action,
    };

    await conversationModel.sendReaction(messageId, reaction);

    window.log.info(
      `You ${action === 0 ? 'added' : 'removed'} a`,
      emoji,
      'reaction for message',
      id
    );
    return reaction;
  } else {
    window.log.warn(`Message ${messageId} not found in db`);
    return;
  }
};

/**
 * Handle reactions on the client by updating the state of the source message
 */
export const handleMessageReaction = async (
  reaction: SignalService.DataMessage.IReaction,
  sender: string,
  isOpenGroup: boolean,
  messageId?: string
) => {
  if (!reaction.emoji) {
    window?.log?.warn(`There is no emoji for the reaction ${messageId}.`);
    return;
  }

  const originalMessage = await getMessageByReaction(reaction, isOpenGroup);
  if (!originalMessage) {
    return;
  }

  const reacts: ReactionList = originalMessage.get('reacts') ?? {};
  reacts[reaction.emoji] = reacts[reaction.emoji] || { count: null, senders: {} };
  const details = reacts[reaction.emoji] ?? {};
  const senders = Object.keys(details.senders);

  window.log.info(
    `${sender} ${reaction.action === 0 ? 'added' : 'removed'} a ${reaction.emoji} reaction`
  );

  switch (reaction.action) {
    case SignalService.DataMessage.Reaction.Action.REACT:
      if (senders.includes(sender) && details.senders[sender] !== '') {
        window?.log?.info(
          'Received duplicate message reaction. Dropping it. id:',
          details.senders[sender]
        );
        return;
      }
      details.senders[sender] = messageId ?? '';
      break;
    case SignalService.DataMessage.Reaction.Action.REMOVE:
    default:
      if (senders.length > 0) {
        if (senders.indexOf(sender) >= 0) {
          // tslint:disable-next-line: no-dynamic-delete
          delete details.senders[sender];
        }
      }
  }

  const count = Object.keys(details.senders).length;
  if (count > 0) {
    reacts[reaction.emoji].count = count;
    reacts[reaction.emoji].senders = details.senders;
  } else {
    // tslint:disable-next-line: no-dynamic-delete
    delete reacts[reaction.emoji];
  }

  originalMessage.set({
    reacts: !isEmpty(reacts) ? reacts : undefined,
  });

  await originalMessage.commit();
  return originalMessage;
};

/**
 * Handle all updates to messages reactions from the SOGS API
 */
export const handleOpenGroupMessageReactions = async (
  reactions: OpenGroupReactionList,
  serverId: number
) => {
  if (isEmpty(reactions)) {
    window?.log?.warn('The reactions state is empty');
    return;
  }

  const originalMessage = await Data.getMessageByServerId(serverId);
  if (!originalMessage) {
    return;
  }

  const reacts: ReactionList = {};
  Object.keys(reactions).forEach(key => {
    const emoji = decodeURI(key);
    const senders: Record<string, string> = {};
    reactions[key].reactors.forEach(reactor => {
      senders[reactor] = String(serverId);
    });
    reacts[emoji] = { count: reactions[key].count, senders };
  });

  originalMessage.set({
    reacts: !isEmpty(reacts) ? reacts : undefined,
  });

  await originalMessage.commit();
  return originalMessage;
};

export const updateRecentReactions = async (reactions: Array<string>, newReaction: string) => {
  window?.log?.info('updating recent reactions with', newReaction);
  const recentReactions = new RecentReactions(reactions);
  const foundIndex = recentReactions.items.indexOf(newReaction);
  if (foundIndex >= 0) {
    if (foundIndex === 0) {
      return;
    }
    recentReactions.swap(foundIndex);
  } else {
    recentReactions.push(newReaction);
  }
  await saveRecentReations(recentReactions.items);
};
