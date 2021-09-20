import {
  getCompleteUrlFromRoom,
  openGroupPrefixRegex,
  openGroupV2ConversationIdRegex,
} from '../opengroup/utils/OpenGroupUtils';
import { getV2OpenGroupRoom } from '../data/opengroups';
import { SyncUtils, ToastUtils, UserUtils } from '../session/utils';
import {
  ConversationModel,
  ConversationNotificationSettingType,
  ConversationTypeEnum,
} from '../models/conversation';
import { MessageModel } from '../models/message';
import { ApiV2 } from '../opengroup/opengroupV2';

import _ from 'lodash';
import { getConversationController } from '../session/conversations';
import { BlockedNumberController } from '../util/blockedNumberController';
import {
  adminLeaveClosedGroup,
  changeNickNameModal,
  updateAddModeratorsModal,
  updateConfirmModal,
  updateGroupMembersModal,
  updateGroupNameModal,
  updateInviteContactModal,
  updateRemoveModeratorsModal,
} from '../state/ducks/modalDialog';
import {
  createOrUpdateItem,
  getMessageById,
  lastAvatarUploadTimestamp,
  removeAllMessagesInConversation,
} from '../data/data';
import {
  conversationReset,
  quoteMessage,
  resetSelectedMessageIds,
} from '../state/ducks/conversations';
import { getDecryptedMediaUrl } from '../session/crypto/DecryptedAttachmentsManager';
import { IMAGE_JPEG } from '../types/MIME';
import { FSv2 } from '../fileserver';
import { fromHexToArray, toHex } from '../session/utils/String';
import { SessionButtonColor } from '../components/session/SessionButton';
import { perfEnd, perfStart } from '../session/utils/Performance';

export const getCompleteUrlForV2ConvoId = async (convoId: string) => {
  if (convoId.match(openGroupV2ConversationIdRegex)) {
    // this is a v2 group, just build the url
    const roomInfos = await getV2OpenGroupRoom(convoId);
    if (roomInfos) {
      const fullUrl = getCompleteUrlFromRoom(roomInfos);

      return fullUrl;
    }
  }
  return undefined;
};

export async function copyPublicKeyByConvoId(convoId: string) {
  if (convoId.match(openGroupPrefixRegex)) {
    // open group v1 or v2
    if (convoId.match(openGroupV2ConversationIdRegex)) {
      // this is a v2 group, just build the url
      const completeUrl = await getCompleteUrlForV2ConvoId(convoId);
      if (completeUrl) {
        window.clipboard.writeText(completeUrl);

        ToastUtils.pushCopiedToClipBoard();
        return;
      }
      window?.log?.warn('copy to pubkey no roomInfo');
      return;
    }

    // this is a v1
    const atIndex = convoId.indexOf('@');
    const openGroupUrl = convoId.substr(atIndex + 1);
    window.clipboard.writeText(openGroupUrl);

    ToastUtils.pushCopiedToClipBoard();
    return;
  }
  window.clipboard.writeText(convoId);

  ToastUtils.pushCopiedToClipBoard();
}

/**
 *
 * @param messages the list of MessageModel to delete
 * @param convo the conversation to delete from (only v2 opengroups are supported)
 */
async function deleteOpenGroupMessages(
  messages: Array<MessageModel>,
  convo: ConversationModel
): Promise<Array<string>> {
  if (!convo.isPublic()) {
    throw new Error('cannot delete public message on a non public groups');
  }

  if (convo.isOpenGroupV2()) {
    const roomInfos = convo.toOpenGroupV2();
    // on v2 servers we can only remove a single message per request..
    // so logic here is to delete each messages and get which one where not removed
    const validServerIdsToRemove = _.compact(
      messages.map(msg => {
        return msg.get('serverId');
      })
    );

    const validMessageModelsToRemove = _.compact(
      messages.map(msg => {
        const serverId = msg.get('serverId');
        if (serverId) {
          return msg;
        }
        return undefined;
      })
    );

    let allMessagesAreDeleted: boolean = false;
    if (validServerIdsToRemove.length) {
      allMessagesAreDeleted = await ApiV2.deleteMessageByServerIds(
        validServerIdsToRemove,
        roomInfos
      );
    }
    // remove only the messages we managed to remove on the server
    if (allMessagesAreDeleted) {
      window?.log?.info('Removed all those serverIds messages successfully');
      return validMessageModelsToRemove.map(m => m.id as string);
    } else {
      window?.log?.info(
        'failed to remove all those serverIds message. not removing them locally neither'
      );
      return [];
    }
  } else {
    throw new Error('Opengroupv1 are not supported anymore');
  }
}

export async function blockConvoById(conversationId: string) {
  const conversation = getConversationController().get(conversationId);

  if (!conversation.id || conversation.isPublic()) {
    return;
  }

  const promise = conversation.isPrivate()
    ? BlockedNumberController.block(conversation.id)
    : BlockedNumberController.blockGroup(conversation.id);
  await promise;
  await conversation.commit();
  ToastUtils.pushToastSuccess('blocked', window.i18n('blocked'));
}

export async function unblockConvoById(conversationId: string) {
  const conversation = getConversationController().get(conversationId);

  if (!conversation) {
    // we assume it's a block contact and not group.
    // this is to be able to unlock a contact we don't have a conversation with.
    await BlockedNumberController.unblock(conversationId);
    ToastUtils.pushToastSuccess('unblocked', window.i18n('unblocked'));
    return;
  }
  if (!conversation.id || conversation.isPublic()) {
    return;
  }
  const promise = conversation.isPrivate()
    ? BlockedNumberController.unblock(conversationId)
    : BlockedNumberController.unblockGroup(conversationId);
  await promise;
  ToastUtils.pushToastSuccess('unblocked', window.i18n('unblocked'));
  await conversation.commit();
}

export async function showUpdateGroupNameByConvoId(conversationId: string) {
  const conversation = getConversationController().get(conversationId);
  if (conversation.isMediumGroup()) {
    // make sure all the members' convo exists so we can add or remove them
    await Promise.all(
      conversation
        .get('members')
        .map(m => getConversationController().getOrCreateAndWait(m, ConversationTypeEnum.PRIVATE))
    );
  }
  window.inboxStore?.dispatch(updateGroupNameModal({ conversationId }));
}

export async function showUpdateGroupMembersByConvoId(conversationId: string) {
  const conversation = getConversationController().get(conversationId);
  if (conversation.isMediumGroup()) {
    // make sure all the members' convo exists so we can add or remove them
    await Promise.all(
      conversation
        .get('members')
        .map(m => getConversationController().getOrCreateAndWait(m, ConversationTypeEnum.PRIVATE))
    );
  }
  window.inboxStore?.dispatch(updateGroupMembersModal({ conversationId }));
}

export function showLeaveGroupByConvoId(conversationId: string) {
  const conversation = getConversationController().get(conversationId);

  if (!conversation.isGroup()) {
    throw new Error('showLeaveGroupDialog() called with a non group convo.');
  }

  const title = window.i18n('leaveGroup');
  const message = window.i18n('leaveGroupConfirmation');
  const ourPK = UserUtils.getOurPubKeyStrFromCache();
  const isAdmin = (conversation.get('groupAdmins') || []).includes(ourPK);
  const isClosedGroup = conversation.get('is_medium_group') || false;

  // if this is not a closed group, or we are not admin, we can just show a confirmation dialog
  if (!isClosedGroup || (isClosedGroup && !isAdmin)) {
    const onClickClose = () => {
      window.inboxStore?.dispatch(updateConfirmModal(null));
    };
    window.inboxStore?.dispatch(
      updateConfirmModal({
        title,
        message,
        onClickOk: async () => {
          await conversation.leaveClosedGroup();
          onClickClose();
        },
        onClickClose,
      })
    );
  } else {
    window.inboxStore?.dispatch(
      adminLeaveClosedGroup({
        conversationId,
      })
    );
  }
}
export function showInviteContactByConvoId(conversationId: string) {
  window.inboxStore?.dispatch(updateInviteContactModal({ conversationId }));
}
export async function onMarkAllReadByConvoId(conversationId: string) {
  const conversation = getConversationController().get(conversationId);

  await conversation.markReadBouncy(Date.now());
}

export function showAddModeratorsByConvoId(conversationId: string) {
  window.inboxStore?.dispatch(updateAddModeratorsModal({ conversationId }));
}

export function showRemoveModeratorsByConvoId(conversationId: string) {
  window.inboxStore?.dispatch(updateRemoveModeratorsModal({ conversationId }));
}

export async function markAllReadByConvoId(conversationId: string) {
  const conversation = getConversationController().get(conversationId);
  perfStart(`markAllReadByConvoId-${conversationId}`);

  await conversation.markReadBouncy(Date.now());
  perfEnd(`markAllReadByConvoId-${conversationId}`, 'markAllReadByConvoId');
}

export async function setNotificationForConvoId(
  conversationId: string,
  selected: ConversationNotificationSettingType
) {
  const conversation = getConversationController().get(conversationId);

  const existingSettings = conversation.get('triggerNotificationsFor');
  if (existingSettings !== selected) {
    conversation.set({ triggerNotificationsFor: selected });
    await conversation.commit();
  }
}
export async function clearNickNameByConvoId(conversationId: string) {
  const conversation = getConversationController().get(conversationId);
  await conversation.setNickname('');
}

export function showChangeNickNameByConvoId(conversationId: string) {
  window.inboxStore?.dispatch(changeNickNameModal({ conversationId }));
}

export async function deleteMessagesByConvoIdNoConfirmation(conversationId: string) {
  const conversation = getConversationController().get(conversationId);
  await removeAllMessagesInConversation(conversationId);
  window.inboxStore?.dispatch(conversationReset(conversationId));

  // destroy message keeps the active timestamp set so the
  // conversation still appears on the conversation list but is empty
  conversation.set({
    lastMessage: null,
    unreadCount: 0,
    mentionedUs: false,
  });

  await conversation.commit();
}

export function deleteMessagesByConvoIdWithConfirmation(conversationId: string) {
  const onClickClose = () => {
    window?.inboxStore?.dispatch(updateConfirmModal(null));
  };

  const onClickOk = async () => {
    await deleteMessagesByConvoIdNoConfirmation(conversationId);
    onClickClose();
  };

  window?.inboxStore?.dispatch(
    updateConfirmModal({
      title: window.i18n('deleteMessages'),
      message: window.i18n('deleteConversationConfirmation'),
      onClickOk,
      okTheme: SessionButtonColor.Danger,
      onClickClose,
    })
  );
}

export async function setDisappearingMessagesByConvoId(
  conversationId: string,
  seconds: number | undefined
) {
  const conversation = getConversationController().get(conversationId);

  if (!seconds || seconds <= 0) {
    await conversation.updateExpireTimer(null);
  } else {
    await conversation.updateExpireTimer(seconds);
  }
}

/**
 * This function can be used for reupload our avatar to the fsv2 or upload a new avatar.
 *
 * If this is a reupload, the old profileKey is used, otherwise a new one is generated
 */
export async function uploadOurAvatar(newAvatarDecrypted?: ArrayBuffer) {
  const ourConvo = getConversationController().get(UserUtils.getOurPubKeyStrFromCache());
  if (!ourConvo) {
    window.log.warn('ourConvo not found... This is not a valid case');
    return;
  }

  let profileKey: Uint8Array | null;
  let decryptedAvatarData;
  if (newAvatarDecrypted) {
    // Encrypt with a new key every time
    profileKey = window.libsignal.crypto.getRandomBytes(32) as Uint8Array;
    decryptedAvatarData = newAvatarDecrypted;
  } else {
    // this is a reupload. no need to generate a new profileKey
    const ourConvoProfileKey =
      getConversationController()
        .get(UserUtils.getOurPubKeyStrFromCache())
        ?.get('profileKey') || null;

    profileKey = ourConvoProfileKey ? fromHexToArray(ourConvoProfileKey) : null;
    if (!profileKey) {
      window.log.info('our profileKey not found. Not reuploading our avatar');
      return;
    }
    const currentAttachmentPath = ourConvo.getAvatarPath();

    if (!currentAttachmentPath) {
      window.log.warn('No attachment currently set for our convo.. Nothing to do.');
      return;
    }

    const decryptedAvatarUrl = await getDecryptedMediaUrl(currentAttachmentPath, IMAGE_JPEG);

    if (!decryptedAvatarUrl) {
      window.log.warn('Could not decrypt avatar stored locally..');
      return;
    }
    const response = await fetch(decryptedAvatarUrl);
    const blob = await response.blob();
    decryptedAvatarData = await blob.arrayBuffer();
  }

  if (!decryptedAvatarData?.byteLength) {
    window.log.warn('Could not read content of avatar ...');
    return;
  }

  const encryptedData = await window.textsecure.crypto.encryptProfile(
    decryptedAvatarData,
    profileKey
  );

  const avatarPointer = await FSv2.uploadFileToFsV2(encryptedData);
  let fileUrl;
  if (!avatarPointer) {
    window.log.warn('failed to upload avatar to fsv2');
    return;
  }
  ({ fileUrl } = avatarPointer);

  ourConvo.set('avatarPointer', fileUrl);

  // this encrypts and save the new avatar and returns a new attachment path
  const upgraded = await window.Signal.Migrations.processNewAttachment({
    isRaw: true,
    data: decryptedAvatarData,
    url: fileUrl,
  });
  // Replace our temporary image with the attachment pointer from the server:
  ourConvo.set('avatar', null);
  const displayName = ourConvo.get('profileName');

  // write the profileKey even if it did not change
  ourConvo.set({ profileKey: toHex(profileKey) });
  // Replace our temporary image with the attachment pointer from the server:
  // this commits already
  await ourConvo.setLokiProfile({
    avatar: upgraded.path,
    displayName,
  });
  const newTimestampReupload = Date.now();
  await createOrUpdateItem({ id: lastAvatarUploadTimestamp, value: newTimestampReupload });

  if (newAvatarDecrypted) {
    UserUtils.setLastProfileUpdateTimestamp(Date.now());
    await SyncUtils.forceSyncConfigurationNowIfNeeded(true);
  } else {
    window.log.info(
      `Reuploading avatar finished at ${newTimestampReupload}, newAttachmentPointer ${fileUrl}`
    );
  }
}

// tslint:disable-next-line: max-func-body-length
export async function deleteMessagesById(
  messageIds: Array<string>,
  conversationId: string,
  askUserForConfirmation: boolean
) {
  const conversation = getConversationController().getOrThrow(conversationId);
  const selectedMessages = _.compact(
    await Promise.all(messageIds.map(m => getMessageById(m, false)))
  );

  const moreThanOne = selectedMessages.length > 1;

  // In future, we may be able to unsend private messages also
  // isServerDeletable also defined in ConversationHeader.tsx for
  // future reference
  const isServerDeletable = conversation.isPublic();

  const doDelete = async (deleteForEveryone: boolean = true) => {
    let toDeleteLocallyIds: Array<string>;

    const ourDevicePubkey = UserUtils.getOurPubKeyStrFromCache();
    if (!ourDevicePubkey) {
      return;
    }
    const isAllOurs = selectedMessages.every(message => ourDevicePubkey === message.getSource());
    if (isServerDeletable) {
      //#region open group v2 deletion
      // Get our Moderator status
      const isAdmin = conversation.isAdmin(ourDevicePubkey);

      if (!isAllOurs && !isAdmin) {
        ToastUtils.pushMessageDeleteForbidden();

        window.inboxStore?.dispatch(resetSelectedMessageIds());
        return;
      }

      toDeleteLocallyIds = await deleteOpenGroupMessages(selectedMessages, conversation);
      if (toDeleteLocallyIds.length === 0) {
        // Message failed to delete from server, show error?
        return;
      }
      // successful deletion
      ToastUtils.pushDeleted();
      window.inboxStore?.dispatch(resetSelectedMessageIds());
      //#endregion
    } else {
      //#region deletion for 1-1 and closed groups
      if (!isAllOurs) {
        ToastUtils.pushMessageDeleteForbidden();
        window.inboxStore?.dispatch(resetSelectedMessageIds());
        return;
      }

      if (window.lokiFeatureFlags?.useUnsendRequests) {
        if (deleteForEveryone) {
          void deleteForAll(selectedMessages);
        } else {
          void deleteForJustThisUser(selectedMessages);
        }
      } else {
        //#region to remove once unsend enabled
        await Promise.all(messageIds.map(msgId => conversation.removeMessage(msgId)));
        ToastUtils.pushDeleted();
        window.inboxStore?.dispatch(resetSelectedMessageIds());
        //#endregion
      }
      //#endregion
    }
  };

  if (askUserForConfirmation) {
    let title = '';

    // Note:  keep that i18n logic separated so the scripts in tools/ find the usage of those
    if (isServerDeletable) {
      if (moreThanOne) {
        title = window.i18n('deleteMessagesForEveryone');
      } else {
        title = window.i18n('deleteMessageForEveryone');
      }
    } else {
      if (moreThanOne) {
        title = window.i18n('deleteMessages');
      } else {
        title = window.i18n('deleteMessage');
      }
    }

    const okText = window.i18n(isServerDeletable ? 'deleteForEveryone' : 'delete');

    //#region confirmation for deletion of messages
    const showDeletionTypeModal = () => {
      window.inboxStore?.dispatch(updateConfirmModal(null));
      window.inboxStore?.dispatch(
        updateConfirmModal({
          title: window.i18n('deletionTypeTitle'),
          okText: window.i18n('deleteMessageForEveryoneLowercase'),
          okTheme: SessionButtonColor.Danger,
          onClickOk: async () => {
            await doDelete(true);
          },
          cancelText: window.i18n('deleteJustForMe'),
          onClickCancel: async () => {
            await doDelete(false);
          },
        })
      );
      return;
    };

    window.inboxStore?.dispatch(
      updateConfirmModal({
        title,
        message: window.i18n(moreThanOne ? 'deleteMessagesQuestion' : 'deleteMessageQuestion'),
        okText,
        okTheme: SessionButtonColor.Danger,
        onClickOk: async () => {
          if (isServerDeletable) {
            // unsend logic
            await doDelete(true);
            // explicity close modal for this case.
            window.inboxStore?.dispatch(updateConfirmModal(null));
          } else {
            showDeletionTypeModal();
          }
        },
        closeAfterInput: false,
      })
    );
    //#endregion
  } else {
    void doDelete();
  }

  /**
   * Deletes messages for everyone in a 1-1 or closed group conversation
   * @param msgsToDelete Messages to delete
   */
  async function deleteForAll(msgsToDelete: Array<MessageModel>) {
    window?.log?.warn('Deleting messages for all users in this conversation');
    const result = await conversation.unsendMessages(msgsToDelete);
    // TODO: may need to specify deletion for own device as well.
    window.inboxStore?.dispatch(resetSelectedMessageIds());
    if (result) {
      ToastUtils.pushDeleted();
    } else {
      ToastUtils.someDeletionsFailed();
    }
  }

  /**
   *
   * @param toDeleteLocallyIds Messages to delete for just this user. Still sends an unsend message to sync
   *  with other devices
   */
  async function deleteForJustThisUser(msgsToDelete: Array<MessageModel>) {
    window?.log?.warn('Deleting messages just for this user');
    // is deleting on swarm sufficient or does it need to be unsent as well?
    const deleteResult = await conversation.deleteMessages(msgsToDelete);
    // Update view and trigger update
    window.inboxStore?.dispatch(resetSelectedMessageIds());
    if (deleteResult) {
      ToastUtils.pushDeleted();
    } else {
      ToastUtils.someDeletionsFailed();
    }
  }
}

export async function replyToMessage(messageId: string) {
  const quotedMessageModel = await getMessageById(messageId);
  if (!quotedMessageModel) {
    window.log.warn('Failed to find message to reply to');
    return;
  }
  const conversationModel = getConversationController().getOrThrow(
    quotedMessageModel.get('conversationId')
  );

  const quotedMessageProps = await conversationModel.makeQuote(quotedMessageModel);

  if (quotedMessageProps) {
    window.inboxStore?.dispatch(quoteMessage(quotedMessageProps));
  } else {
    window.inboxStore?.dispatch(quoteMessage(undefined));
  }
}
