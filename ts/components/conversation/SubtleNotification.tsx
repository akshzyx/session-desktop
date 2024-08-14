import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { useIsIncomingRequest, useIsOutgoingRequest } from '../../hooks/useParamSelector';
import {
  getSelectedHasMessages,
  hasSelectedConversationIncomingMessages,
} from '../../state/selectors/conversations';
import {
  getSelectedCanWrite,
  useSelectedConversationKey,
  useSelectedHasDisabledBlindedMsgRequests,
  useSelectedIsNoteToSelf,
  useSelectedIsPrivate,
  useSelectedNicknameOrProfileNameOrShortenedPubkey,
} from '../../state/selectors/selectedConversation';
import { I18n } from '../basic/I18n';
import { SessionUtilContact } from '../../session/utils/libsession/libsession_utils_contacts';
import { SessionHtmlRenderer } from '../basic/SessionHTMLRenderer';

const Container = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  padding: var(--margins-lg);
  background-color: var(--background-secondary-color);
`;

const TextInner = styled.div`
  color: var(--text-secondary-color);
  text-align: center;
  max-width: 390px;
`;

/**
 * This component is used to display a warning when the user is sending a message request.
 *
 */
export const ConversationOutgoingRequestExplanation = () => {
  const selectedConversation = useSelectedConversationKey();
  const isOutgoingMessageRequest = useIsOutgoingRequest(selectedConversation);
  const hasIncomingMessages = useSelector(hasSelectedConversationIncomingMessages);

  const showMsgRequestUI = selectedConversation && isOutgoingMessageRequest;

  const selectedIsPrivate = useSelectedIsPrivate();

  if (!showMsgRequestUI || hasIncomingMessages || !selectedIsPrivate) {
    return null;
  }
  const contactFromLibsession = SessionUtilContact.getContactCached(selectedConversation);
  // Note: we want to display this description when the conversation is private (or blinded) AND
  // - the conversation is brand new (and not saved yet in libsession: transient conversation),
  // - the conversation exists in libsession but we are not approved yet.
  // This works because a blinded conversation is not saved in libsession currently, and will only be once approved_me is true
  if (!contactFromLibsession || !contactFromLibsession.approvedMe) {
    return (
      <Container data-testid={'empty-conversation-control-message'} style={{ padding: 0 }}>
        <TextInner>{window.i18n('messageRequestPendingDescription')}</TextInner>
      </Container>
    );
  }
  return null;
};

/**
 * This component is used to display a warning when the user is responding to a message request.
 *
 */
export const ConversationIncomingRequestExplanation = () => {
  const selectedConversation = useSelectedConversationKey();
  const isIncomingMessageRequest = useIsIncomingRequest(selectedConversation);

  const showMsgRequestUI = selectedConversation && isIncomingMessageRequest;
  const hasIncomingMessages = useSelector(hasSelectedConversationIncomingMessages);

  if (!showMsgRequestUI || !hasIncomingMessages) {
    return null;
  }

  return (
    <Container>
      <TextInner>{window.i18n('messageRequestsAcceptDescription')}</TextInner>
    </Container>
  );
};

/**
 * This component is used to display a warning when the user is looking at an empty conversation.
 */
export const NoMessageInConversation = () => {
  const selectedConversation = useSelectedConversationKey();

  const hasMessages = useSelector(getSelectedHasMessages);

  const isMe = useSelectedIsNoteToSelf();
  const canWrite = useSelector(getSelectedCanWrite);
  const privateBlindedAndBlockingMsgReqs = useSelectedHasDisabledBlindedMsgRequests();
  const name = useSelectedNicknameOrProfileNameOrShortenedPubkey();

  const messageText = useMemo(() => {
    if (isMe) {
      return <I18n token="noteToSelfEmpty" />;
    }

    if (canWrite) {
      return <I18n token="groupNoMessages" args={{ group_name: name }} />;
    }

    if (privateBlindedAndBlockingMsgReqs) {
      return <I18n token="messageRequestsTurnedOff" args={{ name }} />;
    }

    return <I18n token="conversationsEmpty" args={{ conversation_name: name }} />;
  }, [isMe, canWrite, privateBlindedAndBlockingMsgReqs, name]);

  if (!selectedConversation || hasMessages) {
    return null;
  }

  return (
    <Container data-testid="empty-conversation-notification">
      <TextInner>
        <SessionHtmlRenderer html={messageText} />
      </TextInner>
    </Container>
  );
};
