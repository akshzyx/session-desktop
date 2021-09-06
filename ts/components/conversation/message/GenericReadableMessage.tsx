import classNames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { contextMenu } from 'react-contexify';
import { useDispatch, useSelector } from 'react-redux';
// tslint:disable-next-line: no-submodule-imports
import useInterval from 'react-use/lib/useInterval';
import _ from 'lodash';
import { removeMessage } from '../../../data/data';
import { MessageRenderingProps, QuoteClickOptions } from '../../../models/messageType';
import { getConversationController } from '../../../session/conversations';
import { messageExpired } from '../../../state/ducks/conversations';
import {
  getGenericReadableMessageSelectorProps,
  getIsMessageSelected,
  getQuotedMessageToAnimate,
  isMessageSelectionMode,
} from '../../../state/selectors/conversations';
import { getIncrement } from '../../../util/timer';
import { ExpireTimer } from '../ExpireTimer';
import { ReadableMessage } from '../ReadableMessage';
import { MessageAvatar } from './MessageAvatar';
import { MessageContentWithStatuses } from './MessageContentWithStatus';

export type GenericReadableMessageSelectorProps = Pick<
  MessageRenderingProps,
  | 'direction'
  | 'conversationType'
  | 'receivedAt'
  | 'isUnread'
  | 'expirationLength'
  | 'expirationTimestamp'
  | 'isKickedFromGroup'
  | 'isExpired'
  | 'convoId'
>;

type ExpiringProps = {
  isExpired?: boolean;
  expirationTimestamp?: number | null;
  expirationLength?: number | null;
  convoId?: string;
  messageId: string;
};
const EXPIRATION_CHECK_MINIMUM = 2000;

function useIsExpired(props: ExpiringProps) {
  const {
    convoId,
    messageId,
    expirationLength,
    expirationTimestamp,
    isExpired: isExpiredProps,
  } = props;

  const dispatch = useDispatch();

  const [isExpired] = useState(isExpiredProps);
  async function checkExpired() {
    const now = Date.now();

    if (!expirationTimestamp || !expirationLength) {
      return;
    }

    if (isExpired || now >= expirationTimestamp) {
      await removeMessage(messageId);
      if (convoId) {
        dispatch(
          messageExpired({
            conversationKey: convoId,
            messageId,
          })
        );
        const convo = getConversationController().get(convoId);
        convo?.updateLastMessage();
      }
    }
  }

  const increment = getIncrement(expirationLength || EXPIRATION_CHECK_MINIMUM);
  const checkFrequency = Math.max(EXPIRATION_CHECK_MINIMUM, increment);

  useEffect(() => {
    void checkExpired();
  }, []); // check on mount
  useInterval(checkExpired, checkFrequency); // check every 2sec or sooner if needed

  return { isExpired };
}

type Props = {
  messageId: string;
  onQuoteClick: (quote: QuoteClickOptions) => void;
  ctxMenuID: string;
  isDetailView?: boolean;
};

export const GenericReadableMessage = (props: Props) => {
  const msgProps = useSelector(state =>
    getGenericReadableMessageSelectorProps(state as any, props.messageId)
  );

  const expiringProps: ExpiringProps = {
    convoId: msgProps?.convoId,
    expirationLength: msgProps?.expirationLength,
    messageId: props.messageId,
    expirationTimestamp: msgProps?.expirationTimestamp,
    isExpired: msgProps?.isExpired,
  };
  const { isExpired } = useIsExpired(expiringProps);

  const quotedMessageToAnimate = useSelector(getQuotedMessageToAnimate);
  const isMessageSelected = useSelector(state =>
    getIsMessageSelected(state as any, props.messageId)
  );
  const multiSelectMode = useSelector(isMessageSelectionMode);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const enableContextMenu = !multiSelectMode && !msgProps?.isKickedFromGroup;

      if (enableContextMenu) {
        contextMenu.hideAll();
        contextMenu.show({
          id: props.ctxMenuID,
          event: e,
        });
      }
    },
    [props.ctxMenuID, multiSelectMode, msgProps?.isKickedFromGroup]
  );

  const { messageId, isDetailView } = props;

  if (!msgProps) {
    return null;
  }
  const {
    direction,
    conversationType,
    receivedAt,
    isUnread,
    expirationLength,
    expirationTimestamp,
  } = msgProps;

  if (isExpired) {
    return null;
  }

  const selected = isMessageSelected || false;
  const isGroup = conversationType === 'group';
  const isQuotedMessageToAnimate = quotedMessageToAnimate === messageId;
  const isIncoming = direction === 'incoming';

  return (
    <ReadableMessage
      messageId={messageId}
      className={classNames(
        'session-message-wrapper',
        selected && 'message-selected',
        isGroup && 'public-chat-message-wrapper',
        isQuotedMessageToAnimate && 'flash-green-once',
        isIncoming ? 'session-message-wrapper-incoming' : 'session-message-wrapper-outgoing'
      )}
      onContextMenu={handleContextMenu}
      receivedAt={receivedAt}
      isUnread={isUnread}
      key={`readable-message-${messageId}`}
    >
      <MessageAvatar messageId={messageId} />
      <ExpireTimer
        isCorrectSide={!isIncoming}
        expirationLength={expirationLength}
        expirationTimestamp={expirationTimestamp}
      />
      <MessageContentWithStatuses
        ctxMenuID={props.ctxMenuID}
        messageId={messageId}
        onQuoteClick={props.onQuoteClick}
        isDetailView={isDetailView}
      />
      <ExpireTimer
        isCorrectSide={isIncoming}
        expirationLength={expirationLength}
        expirationTimestamp={expirationTimestamp}
      />
    </ReadableMessage>
  );
};
