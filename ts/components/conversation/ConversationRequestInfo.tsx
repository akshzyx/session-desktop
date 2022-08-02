import React from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { useIsRequest } from '../../hooks/useParamSelector';
import {
  getSelectedConversation,
  hasSelectedConversationIncomingMessages,
} from '../../state/selectors/conversations';

export const ConversationRequestinfo = () => {
  const selectedConversation = useSelector(getSelectedConversation);
  const isIncomingMessageRequest = useIsRequest(selectedConversation?.id);

  const showMsgRequestUI = selectedConversation && isIncomingMessageRequest;
  const hasIncomingMessages = useSelector(hasSelectedConversationIncomingMessages);

  if (!showMsgRequestUI || !hasIncomingMessages) {
    return null;
  }

  return (
    <ConversationRequestTextBottom>
      <ConversationRequestTextInner>
        {window.i18n('respondingToRequestWarning')}
      </ConversationRequestTextInner>
    </ConversationRequestTextBottom>
  );
};

const ConversationRequestTextBottom = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  padding: var(--margins-lg);
`;

const ConversationRequestTextInner = styled.div`
  color: var(--color-text-subtle);
  text-align: center;
  max-width: 390px;
`;
