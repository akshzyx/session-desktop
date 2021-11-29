import React from 'react';
import { useSelector } from 'react-redux';
// tslint:disable-next-line: no-submodule-imports
import useKey from 'react-use/lib/useKey';
import { PropsForDataExtractionNotification, QuoteClickOptions } from '../../../models/messageType';
import {
  PropsForCallNotification,
  PropsForExpirationTimer,
  PropsForGroupInvitation,
  PropsForGroupUpdate,
} from '../../../state/ducks/conversations';
import { getSortedMessagesTypesOfSelectedConversation } from '../../../state/selectors/conversations';
import { CallNotification } from '../../conversation/notification-bubble/CallNotification';
import { DataExtractionNotification } from '../../conversation/DataExtractionNotification';
import { GroupInvitation } from '../../conversation/GroupInvitation';
import { GroupNotification } from '../../conversation/GroupNotification';
import { Message } from '../../conversation/Message';
import { MessageDateBreak } from '../../conversation/message/DateBreak';
import { TimerNotification } from '../../conversation/TimerNotification';
import { SessionLastSeenIndicator } from './SessionLastSeenIndicator';

export const SessionMessagesList = (props: {
  scrollToQuoteMessage: (options: QuoteClickOptions) => Promise<void>;
  onPageUpPressed: () => void;
  onPageDownPressed: () => void;
  onHomePressed: () => void;
  onEndPressed: () => void;
}) => {
  const messagesProps = useSelector(getSortedMessagesTypesOfSelectedConversation);

  useKey('PageUp', () => {
    props.onPageUpPressed();
  });

  useKey('PageDown', () => {
    props.onPageDownPressed();
  });

  useKey('Home', () => {
    props.onHomePressed();
  });

  useKey('End', () => {
    props.onEndPressed();
  });

  return (
    <>
      {messagesProps.map(messageProps => {
        const messageId = messageProps.message.props.messageId;
        const unreadIndicator = messageProps.showUnreadIndicator ? (
          <SessionLastSeenIndicator key={`unread-indicator-${messageId}`} />
        ) : null;

        const dateBreak =
          messageProps.showDateBreak !== undefined ? (
            <MessageDateBreak
              key={`date-break-${messageId}`}
              timestamp={messageProps.showDateBreak}
              messageId={messageId}
            />
          ) : null;
        if (messageProps.message?.messageType === 'group-notification') {
          const msgProps = messageProps.message.props as PropsForGroupUpdate;
          return [<GroupNotification key={messageId} {...msgProps} />, dateBreak, unreadIndicator];
        }

        if (messageProps.message?.messageType === 'group-invitation') {
          const msgProps = messageProps.message.props as PropsForGroupInvitation;
          return [<GroupInvitation key={messageId} {...msgProps} />, dateBreak, unreadIndicator];
        }

        if (messageProps.message?.messageType === 'data-extraction') {
          const msgProps = messageProps.message.props as PropsForDataExtractionNotification;

          return [
            <DataExtractionNotification key={messageId} {...msgProps} />,
            dateBreak,
            unreadIndicator,
          ];
        }

        if (messageProps.message?.messageType === 'timer-notification') {
          const msgProps = messageProps.message.props as PropsForExpirationTimer;

          return [<TimerNotification key={messageId} {...msgProps} />, dateBreak, unreadIndicator];
        }

        if (messageProps.message?.messageType === 'call-notification') {
          const msgProps = messageProps.message.props as PropsForCallNotification;

          return [<CallNotification key={messageId} {...msgProps} />, dateBreak, unreadIndicator];
        }

        if (!messageProps) {
          return null;
        }

        return [
          <Message
            messageId={messageId}
            onQuoteClick={props.scrollToQuoteMessage}
            key={messageId}
          />,
          dateBreak,
          unreadIndicator,
        ];
      })}
    </>
  );
};
