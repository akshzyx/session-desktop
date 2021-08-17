import { createSelector } from 'reselect';
import { StagedAttachmentType } from '../../components/session/conversation/SessionCompositionBox';
import { StagedAttachmentsStateType } from '../ducks/stagedAttachments';
import { StateType } from '../reducer';
import { getSelectedConversationKey } from './conversations';

export const getStagedAttachmentsState = (state: StateType): StagedAttachmentsStateType =>
  state.stagedAttachments;

const getStagedAttachmentsForConversation = (
  state: StagedAttachmentsStateType,
  conversationKey: string | undefined
) => {
  if (!conversationKey) {
    return undefined;
  }
  return state.stagedAttachments[conversationKey] || undefined;
};

export const getStagedAttachmentsForCurrentConversation = createSelector(
  [getSelectedConversationKey, getStagedAttachmentsState],
  (
    selectedConversationKey: string | undefined,
    state: StagedAttachmentsStateType
  ): Array<StagedAttachmentType> | undefined => {
    return getStagedAttachmentsForConversation(state, selectedConversationKey);
  }
);
