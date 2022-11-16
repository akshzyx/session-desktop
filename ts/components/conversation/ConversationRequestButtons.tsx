import React from 'react';
import styled from 'styled-components';
import { useIsRequest } from '../../hooks/useParamSelector';
import {
  approveConvoAndSendResponse,
  declineConversationWithConfirm,
} from '../../interactions/conversationInteractions';
import { getConversationController } from '../../session/conversations';
import {
  useSelectedConversationKey,
  useSelectedHasIncomingMessages,
} from '../../state/selectors/selectedConversation';
import { SessionButton, SessionButtonColor } from '../basic/SessionButton';

const handleDeclineConversationRequest = (convoId: string) => {
  declineConversationWithConfirm(convoId, true);
};

const handleAcceptConversationRequest = async (convoId: string) => {
  const convo = getConversationController().get(convoId);
  await convo.setDidApproveMe(true);
  await convo.addOutgoingApprovalMessage(Date.now());
  await approveConvoAndSendResponse(convoId, true);
};

const ConversationRequestBanner = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--margins-lg);
  gap: var(--margins-lg);
`;

const ConversationBannerRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: var(--margins-lg);
  justify-content: center;

  .session-button {
    padding: 0 36px;
  }
`;

export const ConversationMessageRequestButtons = () => {
  const selectedConversationKey = useSelectedConversationKey();

  const hasIncomingMessages = useSelectedHasIncomingMessages();
  const isIncomingMessageRequest = useIsRequest(selectedConversationKey);

  if (!selectedConversationKey || !hasIncomingMessages) {
    return null;
  }

  if (!isIncomingMessageRequest) {
    return null;
  }

  return (
    <ConversationRequestBanner>
      <ConversationBannerRow>
        <SessionButton
          onClick={async () => {
            await handleAcceptConversationRequest(selectedConversationKey);
          }}
          text={window.i18n('accept')}
          dataTestId="accept-message-request"
        />
        <SessionButton
          buttonColor={SessionButtonColor.Danger}
          text={window.i18n('decline')}
          onClick={() => {
            handleDeclineConversationRequest(selectedConversationKey);
          }}
          dataTestId="decline-message-request"
        />
      </ConversationBannerRow>
    </ConversationRequestBanner>
  );
};
