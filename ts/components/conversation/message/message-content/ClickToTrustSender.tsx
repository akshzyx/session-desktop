import styled from 'styled-components';
import { Data } from '../../../../data/data';
import { getConversationController } from '../../../../session/conversations';
import { AttachmentDownloads } from '../../../../session/utils';
import { updateConfirmModal } from '../../../../state/ducks/modalDialog';
import { useMessageAttachments } from '../../../../state/selectors';
import { isAudio } from '../../../../types/MIME';
import { isImageTypeSupported, isVideoTypeSupported } from '../../../../util/GoogleChrome';
import { SessionButtonColor } from '../../../basic/SessionButton';
import { SessionIcon } from '../../../icon';

const StyledTrustSenderUI = styled.div`
  padding-inline: var(--margins-lg);
  display: flex;
  align-items: center;
  width: fit-content;

  border-radius: var(--border-radius-message-box);
  background-color: var(--message-bubbles-received-background-color);
  height: 35px;
  margin-left: var(--margins-xs);
`;

const ClickToDownload = styled.div`
  cursor: pointer;
  padding: var(--margins-xs) var(--margins-md);
  white-space: nowrap;
`;

export const ClickToTrustSender = (props: { messageId: string }) => {
  const attachments = useMessageAttachments(props.messageId);
  const openConfirmationModal = async (e: any) => {
    e.stopPropagation();
    e.preventDefault();
    const found = await Data.getMessageById(props.messageId);
    if (!found) {
      window.log.warn('message not found ClickToTrustSender');
      return;
    }
    const sender = found.getSource();
    const convo = getConversationController().get(sender);
    window.inboxStore?.dispatch(
      updateConfirmModal({
        title: window.i18n('attachmentsAutoDownloadModalTitle'),
        i18nMessage: {
          token: 'attachmentsAutoDownloadModalDescription',
          args: {
            conversation_name: convo.getContactProfileNameOrShortenedPubKey(),
          },
        },
        closeTheme: SessionButtonColor.Danger,
        onClickOk: async () => {
          convo.set({ isTrustedForAttachmentDownload: true });
          await convo.commit();
          const messagesInConvo = await Data.getLastMessagesByConversation(convo.id, 100, false);

          await Promise.all(
            messagesInConvo.map(async message => {
              const msgAttachments = message.get('attachments');
              const messagePreviews = message.get('preview');
              if (message.get('direction') !== 'incoming') {
                return;
              }
              if (
                (!msgAttachments || msgAttachments.length === 0) &&
                (!messagePreviews || messagePreviews.length === 0)
              ) {
                return;
              }

              const downloadedAttachments = await Promise.all(
                msgAttachments.map(async (attachment: any, index: any) => {
                  if (attachment.path) {
                    return { ...attachment, pending: false };
                  }
                  return AttachmentDownloads.addJob(attachment, {
                    messageId: message.id,
                    type: 'attachment',
                    index,
                    isOpenGroupV2: false,
                    openGroupV2Details: undefined,
                  });
                })
              );

              const preview = await Promise.all(
                (messagePreviews || []).map(async (item: any, index: any) => {
                  if (!item.image) {
                    return item;
                  }

                  const image = message.isTrustedForAttachmentDownload()
                    ? await AttachmentDownloads.addJob(item.image, {
                        messageId: message.id,
                        type: 'preview',
                        index,
                        isOpenGroupV2: false,
                        openGroupV2Details: undefined,
                      })
                    : null;

                  return { ...item, image };
                })
              );

              message.set({ preview });

              message.set({ attachments: downloadedAttachments });
              await message.commit();
            })
          );
        },
        onClickClose: () => {
          window.inboxStore?.dispatch(updateConfirmModal(null));
        },
      })
    );
  };

  const firstMimeType = attachments?.[0].contentType || 'unknown';

  const fileType = isAudio(firstMimeType)
    ? window.i18n('audio')
    : isVideoTypeSupported(firstMimeType) || isImageTypeSupported(firstMimeType)
      ? window.i18n('media')
      : window.i18n('file');

  return (
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    <StyledTrustSenderUI onClick={openConfirmationModal}>
      <SessionIcon iconSize="small" iconType="gallery" />
      <ClickToDownload>
        {window.i18n('attachmentsClickToDownload', {
          // Note: we don't want to change the case of a localized string, but as an exception this one is approved.
          // The reason is that the attachments logic is scheduled to be changed soon :tm:
          file_type: fileType.toLocaleLowerCase(),
        })}
      </ClickToDownload>
    </StyledTrustSenderUI>
  );
};
