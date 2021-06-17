import React from 'react';
import styled, { DefaultTheme } from 'styled-components';
import { MessageDeliveryStatus } from '../../../models/messageType';
import { SessionIcon, SessionIconSize, SessionIconType } from '../../session/icon';
import { OpacityMetadataComponent } from './MessageMetadata';

const MessageStatusSendingContainer = styled(props => <OpacityMetadataComponent {...props} />)`
  display: inline-block;
  margin-bottom: 2px;
  margin-inline-start: 5px;
`;

const MessageStatusSending = (props: { theme: DefaultTheme; iconColor: string }) => {
  return (
    <MessageStatusSendingContainer>
      <SessionIcon
        rotateDuration={2}
        iconColor={props.iconColor}
        theme={props.theme}
        iconType={SessionIconType.Sending}
        iconSize={SessionIconSize.Tiny}
      />
    </MessageStatusSendingContainer>
  );
};

const MessageStatusSent = (props: { theme: DefaultTheme; iconColor: string }) => {
  return (
    <MessageStatusSendingContainer>
      <SessionIcon
        iconColor={props.iconColor}
        theme={props.theme}
        iconType={SessionIconType.CircleCheck}
        iconSize={SessionIconSize.Tiny}
      />
    </MessageStatusSendingContainer>
  );
};

const MessageStatusRead = (props: { theme: DefaultTheme; iconColor: string }) => {
  return (
    <MessageStatusSendingContainer>
      <SessionIcon
        iconColor={props.iconColor}
        theme={props.theme}
        iconType={SessionIconType.DoubleCheckCircleFilled}
        iconSize={SessionIconSize.Tiny}
      />
    </MessageStatusSendingContainer>
  );
};

const MessageStatusError = (props: { theme: DefaultTheme }) => {
  return (
    <MessageStatusSendingContainer>
      <SessionIcon
        iconColor={props.theme.colors.destructive}
        theme={props.theme}
        iconType={SessionIconType.Error}
        iconSize={SessionIconSize.Tiny}
      />
    </MessageStatusSendingContainer>
  );
};

export const OutgoingMessageStatus = (props: {
  status?: MessageDeliveryStatus;
  theme: DefaultTheme;
  iconColor: string;
  isInMessageView?: boolean;
}) => {
  switch (props.status) {
    case 'sending':
      return <MessageStatusSending {...props} />;
    case 'sent':
      return <MessageStatusSent {...props} />;
    case 'read':
      return <MessageStatusRead {...props} />;
    case 'error':
      if (props.isInMessageView) {
        return null;
      }
      return <MessageStatusError {...props} />;
    default:
      return null;
  }
};
