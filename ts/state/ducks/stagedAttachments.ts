import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import _ from 'lodash';
import { StagedAttachmentType } from '../../components/session/conversation/SessionCompositionBox';

export type StagedAttachmentsStateType = {
  stagedAttachments: { [conversationKey: string]: Array<StagedAttachmentType> };
};

// Reducer

export function getEmptyStagedAttachmentsState(): StagedAttachmentsStateType {
  return {
    stagedAttachments: {},
  };
}

const stagedAttachmentsSlice = createSlice({
  name: 'stagedAttachments',
  initialState: getEmptyStagedAttachmentsState(),
  reducers: {
    addStagedAttachmentsInConversation(
      state: StagedAttachmentsStateType,
      action: PayloadAction<{
        conversationKey: string;
        newAttachments: Array<StagedAttachmentType>;
      }>
    ) {
      const { conversationKey, newAttachments } = action.payload;
      if (newAttachments.length === 0) {
        return state;
      }
      const currentStagedAttachments = state.stagedAttachments[conversationKey] || [];

      if (newAttachments.some(a => a.isVoiceMessage) && currentStagedAttachments.length > 0) {
        window?.log?.warn('A voice note cannot be sent with other attachments');
        return state;
      }

      const allAttachments = _.concat(currentStagedAttachments, newAttachments);
      const uniqAttachments = _.uniqBy(allAttachments, m => m.fullPath);

      state.stagedAttachments[conversationKey] = uniqAttachments;
      return state;
    },
    removeAllStagedAttachmentsInConversation(
      state: StagedAttachmentsStateType,
      action: PayloadAction<{ conversationKey: string }>
    ) {
      const { conversationKey } = action.payload;

      const currentStagedAttachments = state.stagedAttachments[conversationKey];
      if (!currentStagedAttachments || _.isEmpty(currentStagedAttachments)) {
        return state;
      }
      currentStagedAttachments.forEach(attachment => {
        if (attachment.url) {
          URL.revokeObjectURL(attachment.url);
        }
        if (attachment.objectUrl) {
          URL.revokeObjectURL(attachment.objectUrl);
        }
      });
      // tslint:disable-next-line: no-dynamic-delete
      delete state.stagedAttachments[conversationKey];
      return state;
    },
    removeStagedAttachmentInConversation(
      state: StagedAttachmentsStateType,
      action: PayloadAction<{ conversationKey: string; fullPath: string }>
    ) {
      const { conversationKey, fullPath } = action.payload;

      const currentStagedAttachments = state.stagedAttachments[conversationKey];

      if (!currentStagedAttachments || _.isEmpty(currentStagedAttachments)) {
        return state;
      }
      const attachmentToRemove = currentStagedAttachments.find(m => m.fullPath === fullPath);

      if (!attachmentToRemove) {
        return state;
      }

      if (attachmentToRemove.url) {
        URL.revokeObjectURL(attachmentToRemove.url);
      }
      if (attachmentToRemove.objectUrl) {
        URL.revokeObjectURL(attachmentToRemove.objectUrl);
      }
      state.stagedAttachments[conversationKey] = state.stagedAttachments[conversationKey].filter(
        a => a.fullPath !== fullPath
      );
      return state;
    },
  },
});

export const { actions, reducer } = stagedAttachmentsSlice;
export const {
  addStagedAttachmentsInConversation,
  removeAllStagedAttachmentsInConversation,
  removeStagedAttachmentInConversation,
} = actions;
