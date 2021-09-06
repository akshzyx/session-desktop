import React from 'react';
import { animation, Menu } from 'react-contexify';
import {
  getAddModeratorsMenuItem,
  getBlockMenuItem,
  getChangeNicknameMenuItem,
  getClearNicknameMenuItem,
  getCopyMenuItem,
  getDeleteContactMenuItem,
  getDeleteMessagesMenuItem,
  getDisappearingMenuItem,
  getInviteContactMenuItem,
  getLeaveGroupMenuItem,
  getMarkAllReadMenuItem,
  getNotificationForConvoMenuItem,
  getPinConversationMenuItem,
  getRemoveModeratorsMenuItem,
  getUpdateGroupNameMenuItem,
} from './Menu';
import _ from 'lodash';
import { ConversationNotificationSettingType } from '../../../models/conversation';
import { NotificationForConvoOption } from '../../../state/ducks/conversations';

export type PropsConversationHeaderMenu = {
  conversationId: string;
  triggerId: string;
  isMe: boolean;
  isPublic: boolean;
  isKickedFromGroup: boolean;
  left: boolean;
  isGroup: boolean;
  weAreAdmin: boolean;
  notificationForConvo: Array<NotificationForConvoOption>;
  currentNotificationSetting: ConversationNotificationSettingType;
  isPrivate: boolean;
  isBlocked: boolean;
  hasNickname: boolean;
};

const ConversationHeaderMenu = (props: PropsConversationHeaderMenu) => {
  const {
    conversationId,
    triggerId,
    isMe,
    isPublic,
    isGroup,
    isKickedFromGroup,
    weAreAdmin,
    isBlocked,
    isPrivate,
    left,
    hasNickname,
    notificationForConvo,
    currentNotificationSetting,
  } = props;

  return (
    <Menu id={triggerId} animation={animation.fade}>
      {getDisappearingMenuItem(isPublic, isKickedFromGroup, left, isBlocked, conversationId)}
      {getNotificationForConvoMenuItem(
        isKickedFromGroup,
        left,
        isBlocked,
        notificationForConvo,
        currentNotificationSetting,
        conversationId
      )}
      {getPinConversationMenuItem(conversationId)}
      {getBlockMenuItem(isMe, isPrivate, isBlocked, conversationId)}
      {getCopyMenuItem(isPublic, isGroup, conversationId)}
      {getMarkAllReadMenuItem(conversationId)}
      {getChangeNicknameMenuItem(isMe, isGroup, conversationId)}
      {getClearNicknameMenuItem(isMe, hasNickname, isGroup, conversationId)}
      {getDeleteMessagesMenuItem(isPublic, conversationId)}
      {getAddModeratorsMenuItem(weAreAdmin, isPublic, isKickedFromGroup, conversationId)}
      {getRemoveModeratorsMenuItem(weAreAdmin, isPublic, isKickedFromGroup, conversationId)}
      {getUpdateGroupNameMenuItem(weAreAdmin, isKickedFromGroup, left, conversationId)}
      {getLeaveGroupMenuItem(isKickedFromGroup, left, isGroup, isPublic, conversationId)}
      {/* TODO: add delete group */}
      {getInviteContactMenuItem(isGroup, isPublic, conversationId)}
      {getDeleteContactMenuItem(isMe, isGroup, isPublic, left, isKickedFromGroup, conversationId)}
    </Menu>
  );
};

function propsAreEqual(prev: PropsConversationHeaderMenu, next: PropsConversationHeaderMenu) {
  return _.isEqual(prev, next);
}
export const MemoConversationHeaderMenu = React.memo(ConversationHeaderMenu, propsAreEqual);
