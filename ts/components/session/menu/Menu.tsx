import React from 'react';
import { LocalizerType } from '../../../types/Util';
import { TimerOption } from '../../conversation/ConversationHeader';
import { Item, Submenu } from 'react-contexify';
import { SessionNicknameDialog } from '../SessionNicknameDialog';
import { useDispatch } from 'react-redux';
import { updateConfirmModal } from '../../../state/ducks/modalDialog';
import { ConversationController } from '../../../session/conversations';
import { UserUtils } from '../../../session/utils';
import { AdminLeaveClosedGroupDialog } from '../../conversation/AdminLeaveClosedGroupDialog';

function showTimerOptions(
  isPublic: boolean,
  isKickedFromGroup: boolean,
  left: boolean,
  isBlocked: boolean
): boolean {
  return !isPublic && !left && !isKickedFromGroup && !isBlocked;
}

function showMemberMenu(isPublic: boolean, isGroup: boolean): boolean {
  return !isPublic && isGroup;
}

function showBlock(isMe: boolean, isPrivate: boolean): boolean {
  return !isMe && isPrivate;
}

function showClearNickname(isMe: boolean, hasNickname: boolean, isGroup: boolean): boolean {
  return !isMe && hasNickname && !isGroup;
}

function showChangeNickname(isMe: boolean, isGroup: boolean) {
  return !isMe && !isGroup;
}

function showDeleteMessages(isPublic: boolean): boolean {
  return !isPublic;
}

// we want to show the copyId for open groups and private chats only
function showCopyId(isPublic: boolean, isGroup: boolean): boolean {
  return !isGroup || isPublic;
}

function showDeleteContact(
  isMe: boolean,
  isGroup: boolean,
  isPublic: boolean,
  isGroupLeft: boolean,
  isKickedFromGroup: boolean
): boolean {
  // you need to have left a closed group first to be able to delete it completely.
  return (!isMe && !isGroup) || (isGroup && (isGroupLeft || isKickedFromGroup || isPublic));
}

function showAddModerators(isAdmin: boolean, isKickedFromGroup: boolean): boolean {
  return !isKickedFromGroup && isAdmin;
}

function showRemoveModerators(isAdmin: boolean, isKickedFromGroup: boolean): boolean {
  return !isKickedFromGroup && isAdmin;
}

function showUpdateGroupName(isAdmin: boolean, isKickedFromGroup: boolean, left: boolean): boolean {
  return !isKickedFromGroup && !left && isAdmin;
}

function showLeaveGroup(
  isKickedFromGroup: boolean,
  left: boolean,
  isGroup: boolean,
  isPublic: boolean
): boolean {
  return !isKickedFromGroup && !left && isGroup && !isPublic;
}

function showInviteContact(isGroup: boolean, isPublic: boolean): boolean {
  return isGroup && isPublic;
}

/** Menu items standardized */

export function getInviteContactMenuItem(
  isGroup: boolean | undefined,
  isPublic: boolean | undefined,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showInviteContact(Boolean(isGroup), Boolean(isPublic))) {
    return <Item onClick={action}>{i18n('inviteContacts')}</Item>;
  }
  return null;
}

export function getDeleteContactMenuItem(
  isMe: boolean | undefined,
  isGroup: boolean | undefined,
  isPublic: boolean | undefined,
  isLeft: boolean | undefined,
  isKickedFromGroup: boolean | undefined,
  action: any,
  i18n: LocalizerType,
  id: string
): JSX.Element | null {
  if (
    showDeleteContact(
      Boolean(isMe),
      Boolean(isGroup),
      Boolean(isPublic),
      Boolean(isLeft),
      Boolean(isKickedFromGroup)
    )
  ) {
    let menuItemText: string;
    if (isPublic) {
      menuItemText = i18n('leaveGroup');
    } else {
      menuItemText = i18n('delete');
    }

    const dispatch = useDispatch();
    const onClickClose = () => {
          dispatch(updateConfirmModal(null));
    }

    const showConfirmationModal = () => {
      dispatch(updateConfirmModal({
        title: menuItemText,
        message: isGroup ? i18n('leaveGroupConfirmation'): i18n('deleteContactConfirmation'),
        onClickClose,
        onClickOk: () => {
          void ConversationController.getInstance().deleteContact(id);
          onClickClose();
        }
      }))
    }

      return <Item onClick={showConfirmationModal}>{menuItemText}</Item>;
  }
  return null;
}

export function getLeaveGroupMenuItem(
  isKickedFromGroup: boolean | undefined,
  left: boolean | undefined,
  isGroup: boolean | undefined,
  isPublic: boolean | undefined,
  action: any,
  i18n: LocalizerType,
  id: string,
  setModal: any,
  theme: any
): JSX.Element | null {
  if (
    showLeaveGroup(Boolean(isKickedFromGroup), Boolean(left), Boolean(isGroup), Boolean(isPublic))
  ) {
    const dispatch = useDispatch();
    const conversation = ConversationController.getInstance().get(id);

    const onClickClose = () => {
      dispatch(updateConfirmModal(null));
    }

    const openConfirmationModal = () => {
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
        dispatch(updateConfirmModal({
          title,
          message,
          onClickOk: () => {
            conversation.leaveClosedGroup();
            onClickClose();
          },
          onClickClose
        }));
      } else {
        setModal(
          <AdminLeaveClosedGroupDialog
            groupName={conversation.getName()}
            onSubmit={conversation.leaveClosedGroup}
            onClose={() => {setModal(null)}}
            theme={theme}
          ></AdminLeaveClosedGroupDialog>
        )
      }

    }

    return <Item onClick={openConfirmationModal}>{i18n('leaveGroup')}</Item>;
  }
  return null;
}

export function getUpdateGroupNameMenuItem(
  isAdmin: boolean | undefined,
  isKickedFromGroup: boolean | undefined,
  left: boolean | undefined,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showUpdateGroupName(Boolean(isAdmin), Boolean(isKickedFromGroup), Boolean(left))) {
    return <Item onClick={action}>{i18n('editGroup')}</Item>;
  }
  return null;
}

export function getRemoveModeratorsMenuItem(
  isAdmin: boolean | undefined,
  isKickedFromGroup: boolean | undefined,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showRemoveModerators(Boolean(isAdmin), Boolean(isKickedFromGroup))) {
    return <Item onClick={action}>{i18n('removeModerators')}</Item>;
  }
  return null;
}

export function getAddModeratorsMenuItem(
  isAdmin: boolean | undefined,
  isKickedFromGroup: boolean | undefined,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showAddModerators(Boolean(isAdmin), Boolean(isKickedFromGroup))) {
    return <Item onClick={action}>{i18n('addModerators')}</Item>;
  }
  return null;
}

export function getCopyMenuItem(
  isPublic: boolean | undefined,
  isGroup: boolean | undefined,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showCopyId(Boolean(isPublic), Boolean(isGroup))) {
    const copyIdLabel = isPublic ? i18n('copyOpenGroupURL') : i18n('copySessionID');
    return <Item onClick={action}>{copyIdLabel}</Item>;
  }
  return null;
}

export function getMarkAllReadMenuItem(action: any, i18n: LocalizerType): JSX.Element | null {
  return <Item onClick={action}>{i18n('markAllAsRead')}</Item>;
}

export function getDisappearingMenuItem(
  isPublic: boolean | undefined,
  isKickedFromGroup: boolean | undefined,
  left: boolean | undefined,
  isBlocked: boolean | undefined,
  timerOptions: Array<TimerOption>,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (
    showTimerOptions(
      Boolean(isPublic),
      Boolean(isKickedFromGroup),
      Boolean(left),
      Boolean(isBlocked)
    )
  ) {
    const isRtlMode = isRtlBody();
    return (
      // Remove the && false to make context menu work with RTL support
      <Submenu
        label={i18n('disappearingMessages') as any}
      // rtl={isRtlMode && false}
      >
        {(timerOptions || []).map(item => (
          <Item
            key={item.value}
            onClick={() => {
              action(item.value);
            }}
          >
            {item.name}
          </Item>
        ))}
      </Submenu>
    );
  }
  return null;
}

export function isRtlBody(): boolean {
  return ($('body') as any).hasClass('rtl');
}

export function getShowMemberMenuItem(
  isPublic: boolean | undefined,
  isGroup: boolean | undefined,
  action: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showMemberMenu(Boolean(isPublic), Boolean(isGroup))) {
    return <Item onClick={action}>{i18n('groupMembers')}</Item>;
  }
  return null;
}

export function getBlockMenuItem(
  isMe: boolean | undefined,
  isPrivate: boolean | undefined,
  isBlocked: boolean | undefined,
  actionBlock: any,
  actionUnblock: any,
  i18n: LocalizerType
): JSX.Element | null {
  if (showBlock(Boolean(isMe), Boolean(isPrivate))) {
    const blockTitle = isBlocked ? i18n('unblockUser') : i18n('blockUser');
    const blockHandler = isBlocked ? actionUnblock : actionBlock;
    return <Item onClick={blockHandler}>{blockTitle}</Item>;
  }
  return null;
}

export function getClearNicknameMenuItem(
  isMe: boolean | undefined,
  hasNickname: boolean | undefined,
  action: any,
  isGroup: boolean | undefined,
  i18n: LocalizerType
): JSX.Element | null {
  if (showClearNickname(Boolean(isMe), Boolean(hasNickname), Boolean(isGroup))) {
    return <Item onClick={action}>{i18n('clearNickname')}</Item>;
  }
  return null;
}

export function getChangeNicknameMenuItem(
  isMe: boolean | undefined,
  action: any,
  isGroup: boolean | undefined,
  i18n: LocalizerType,
  conversationId?: string,
  setModal?: any
): JSX.Element | null {
  if (showChangeNickname(Boolean(isMe), Boolean(isGroup))) {

    const clearModal = () => {
      setModal(null);
    }

    const onClickCustom = () => {
      setModal(<SessionNicknameDialog onClickClose={clearModal} conversationId={conversationId}></SessionNicknameDialog>);
    }

    return (
      <>
        <Item onClick={onClickCustom}>{i18n('changeNickname')}</Item>
      </>
    );
  }
  return null;
}

export function getDeleteMessagesMenuItem(
  isPublic: boolean | undefined,
  action: any,
  i18n: LocalizerType,
  id: string
): JSX.Element | null {
  if (showDeleteMessages(Boolean(isPublic))) {

    const dispatch = useDispatch();
    const conversation = ConversationController.getInstance().get(id);

    const onClickClose = () => {
      dispatch(updateConfirmModal(null));
    }

    const onClickOk = () => {
      conversation.destroyMessages();
      onClickClose();
    }

    const openConfirmationModal = () => {
      dispatch(updateConfirmModal({
        title: window.i18n('deleteMessages'),
        message: window.i18n('deleteConversationConfirmation'),
        onClickOk,
        onClickClose,
      }))
    }

    return <Item onClick={openConfirmationModal}>{i18n('deleteMessages')}</Item>;
  }
  return null;
}
