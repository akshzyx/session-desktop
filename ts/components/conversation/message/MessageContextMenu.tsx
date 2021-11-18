import React, { useCallback } from 'react';

import { animation, Item, Menu } from 'react-contexify';

import { MessageInteraction } from '../../../interactions';
import { getMessageById } from '../../../data/data';
import { replyToMessage } from '../../../interactions/conversationInteractions';
import {
  showMessageDetailsView,
  toggleSelectedMessageId,
} from '../../../state/ducks/conversations';
import { saveAttachmentToDisk } from '../../../util/attachmentsUtil';
import {
  addSenderAsModerator,
  removeSenderFromModerator,
} from '../../../interactions/messageInteractions';
import { MessageRenderingProps } from '../../../models/messageType';
import { pushUnblockToSend } from '../../../session/utils/Toast';
import { useDispatch, useSelector } from 'react-redux';
import { getMessageContextMenuProps } from '../../../state/selectors/conversations';
import {
  deleteMessagesById,
  deleteMessagesByIdForEveryone,
} from '../../../interactions/conversations/unsendingInteractions';

export type MessageContextMenuSelectorProps = Pick<
  MessageRenderingProps,
  | 'attachments'
  | 'authorPhoneNumber'
  | 'convoId'
  | 'direction'
  | 'status'
  | 'isDeletable'
  | 'isPublic'
  | 'isOpenGroupV2'
  | 'weAreAdmin'
  | 'isSenderAdmin'
  | 'text'
  | 'serverTimestamp'
  | 'timestamp'
  | 'isBlocked'
  | 'isDeletableForEveryone'
>;

type Props = { messageId: string; contextMenuId: string };

// tslint:disable: max-func-body-length cyclomatic-complexity
export const MessageContextMenu = (props: Props) => {
  const selected = useSelector(state => getMessageContextMenuProps(state as any, props.messageId));
  const dispatch = useDispatch();

  if (!selected) {
    return null;
  }
  const {
    attachments,
    authorPhoneNumber,
    convoId,
    direction,
    status,
    isDeletable,
    isDeletableForEveryone,
    isPublic,
    isOpenGroupV2,
    weAreAdmin,
    isSenderAdmin,
    text,
    serverTimestamp,
    timestamp,
    isBlocked,
  } = selected;
  const { messageId, contextMenuId } = props;
  const isOutgoing = direction === 'outgoing';
  const showRetry = status === 'error' && isOutgoing;
  const isSent = status === 'sent';
  const multipleAttachments = attachments && attachments.length > 1;

  const onContextMenuShown = useCallback(() => {
    window.contextMenuShown = true;
  }, []);

  const onContextMenuHidden = useCallback(() => {
    // This function will called before the click event
    // on the message would trigger (and I was unable to
    // prevent propagation in this case), so use a short timeout
    setTimeout(() => {
      window.contextMenuShown = false;
    }, 100);
  }, []);

  const onShowDetail = async () => {
    const found = await getMessageById(messageId);
    if (found) {
      const messageDetailsProps = await found.getPropsForMessageDetail();
      dispatch(showMessageDetailsView(messageDetailsProps));
    } else {
      window.log.warn(`Message ${messageId} not found in db`);
    }
  };

  const selectMessageText = window.i18n('selectMessage');
  const deleteMessageJustForMeText = window.i18n('deleteJustForMe');
  const unsendMessageText = window.i18n('deleteForEveryone');

  const addModerator = useCallback(() => {
    void addSenderAsModerator(authorPhoneNumber, convoId);
  }, [authorPhoneNumber, convoId]);

  const removeModerator = useCallback(() => {
    void removeSenderFromModerator(authorPhoneNumber, convoId);
  }, [authorPhoneNumber, convoId]);

  const onReply = useCallback(() => {
    if (isBlocked) {
      pushUnblockToSend();
      return;
    }
    void replyToMessage(messageId);
  }, [isBlocked, messageId]);

  const saveAttachment = useCallback(
    (e: any) => {
      e.event.stopPropagation();
      if (!attachments?.length) {
        return;
      }
      const messageTimestamp = timestamp || serverTimestamp || 0;
      void saveAttachmentToDisk({
        attachment: attachments[0],
        messageTimestamp,
        messageSender: authorPhoneNumber,
        conversationId: convoId,
      });
    },
    [convoId, authorPhoneNumber, timestamp, serverTimestamp, convoId, attachments]
  );

  const copyText = useCallback(() => {
    MessageInteraction.copyBodyToClipboard(text);
  }, [text]);

  const onRetry = useCallback(async () => {
    const found = await getMessageById(messageId);
    if (found) {
      await found.retrySend();
    }
  }, [messageId]);

  const onBan = useCallback(() => {
    MessageInteraction.banUser(authorPhoneNumber, convoId);
  }, [authorPhoneNumber, convoId]);

  const onBanAndDeleteAll = useCallback(() => {
    MessageInteraction.banUser(authorPhoneNumber, convoId, true);
  }, [authorPhoneNumber, convoId]);

  const onUnban = useCallback(() => {
    MessageInteraction.unbanUser(authorPhoneNumber, convoId);
  }, [authorPhoneNumber, convoId]);

  const onSelect = useCallback(() => {
    dispatch(toggleSelectedMessageId(messageId));
  }, [messageId]);

  const onDelete = useCallback(() => {
    void deleteMessagesById([messageId], convoId);
  }, [convoId, messageId]);

  const onDeleteForEveryone = useCallback(() => {
    void deleteMessagesByIdForEveryone([messageId], convoId);
  }, [convoId, messageId]);

  return (
    <Menu
      id={contextMenuId}
      onShown={onContextMenuShown}
      onHidden={onContextMenuHidden}
      animation={animation.fade}
    >
      {!multipleAttachments && attachments && attachments[0] ? (
        <Item onClick={saveAttachment}>{window.i18n('downloadAttachment')}</Item>
      ) : null}

      <Item onClick={copyText}>{window.i18n('copyMessage')}</Item>
      {(isSent || !isOutgoing) && <Item onClick={onReply}>{window.i18n('replyToMessage')}</Item>}
      <Item onClick={onShowDetail}>{window.i18n('moreInformation')}</Item>
      {showRetry ? <Item onClick={onRetry}>{window.i18n('resend')}</Item> : null}
      {isDeletable ? (
        <>
          <Item onClick={onSelect}>{selectMessageText}</Item>
        </>
      ) : null}
      {isDeletable && !isPublic ? (
        <>
          <Item onClick={onDelete}>{deleteMessageJustForMeText}</Item>
        </>
      ) : null}
      {isDeletableForEveryone ? (
        <>
          <Item onClick={onDeleteForEveryone}>{unsendMessageText}</Item>
        </>
      ) : null}
      {weAreAdmin && isPublic ? <Item onClick={onBan}>{window.i18n('banUser')}</Item> : null}
      {weAreAdmin && isPublic ? (
        <Item onClick={onBanAndDeleteAll}>{window.i18n('banUserAndDeleteAll')}</Item>
      ) : null}
      {weAreAdmin && isOpenGroupV2 ? (
        <Item onClick={onUnban}>{window.i18n('unbanUser')}</Item>
      ) : null}
      {weAreAdmin && isPublic && !isSenderAdmin ? (
        <Item onClick={addModerator}>{window.i18n('addAsModerator')}</Item>
      ) : null}
      {weAreAdmin && isPublic && isSenderAdmin ? (
        <Item onClick={removeModerator}>{window.i18n('removeFromModerators')}</Item>
      ) : null}
    </Menu>
  );
};
