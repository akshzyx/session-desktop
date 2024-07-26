import React from 'react';
import { useConversationUsername } from '../../../../hooks/useParamSelector';
import { PropsForMessageRequestResponse } from '../../../../models/messageType';
import { UserUtils } from '../../../../session/utils';
import { Flex } from '../../../basic/Flex';
import { SpacerSM, Text } from '../../../basic/Text';
import { ReadableMessage } from './ReadableMessage';

// Note this should not respond to the disappearing message conversation setting so we use the ReadableMessage
export const MessageRequestResponse = (props: PropsForMessageRequestResponse) => {
  const { messageId, isUnread, receivedAt, conversationId } = props;

  const profileName = useConversationUsername(conversationId);
  const isFromSync = props.source === UserUtils.getOurPubKeyStrFromCache();

  let msgText = '';
  if (isFromSync) {
    msgText = window.i18n('messageRequestYouHaveAccepted', {
      // TODO - check if we can have a better fallback
      name: profileName ?? '',
    });
  } else {
    msgText = window.i18n('messageRequestsAccepted');
  }

  return (
    <ReadableMessage
      messageId={messageId}
      receivedAt={receivedAt}
      isUnread={isUnread}
      dataTestId="message-request-response-message"
      key={`readable-message-${messageId}`}
    >
      <Flex
        container={true}
        flexDirection="row"
        alignItems="center"
        justifyContent="center"
        margin={'var(--margins-sm)'}
        id={`msg-${messageId}`}
      >
        <SpacerSM />
        <Text text={msgText} subtle={true} ellipsisOverflow={true} />
      </Flex>
    </ReadableMessage>
  );
};
