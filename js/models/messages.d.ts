import { ConversationModel } from './conversations';

type MessageModelType = 'incoming' | 'outgoing';
type MessageDeliveryStatus =
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'error';

interface MessageAttributes {
  id: number;
  source: string;
  quote: any;
  expireTimer: number;
  received_at: number;
  sent_at: number;
  preview: any;
  body: string;
  expirationStartTimestamp: any;
  read_by: Array<string>;
  delivered_to: Array<string>;
  decrypted_at: number;
  recipients: Array<string>;
  delivered: number;
  type: MessageModelType;
  group_update: any;
  groupInvitation: any;
  attachments: any;
  contact: any;
  conversationId: any;
  errors: any;
  flags: number;
  hasAttachments: boolean;
  hasFileAttachments: boolean;
  hasVisualMediaAttachments: boolean;
  schemaVersion: number;
  expirationTimerUpdate: any;
  unread: boolean;
  group: any;
  bodyPending: boolean;
  timestamp: number;
  status: MessageDeliveryStatus;
}

export interface MessageModel extends Backbone.Model<MessageAttributes> {
  idForLogging: () => string;
  isGroupUpdate: () => boolean;
  isExpirationTimerUpdate: () => boolean;
  getNotificationText: () => string;
  markRead: () => void;
  merge: (other: MessageModel) => void;
  saveErrors: (error: any) => void;
  sendSyncMessageOnly: (message: any) => void;
  isUnread: () => boolean;
  commit: () => Promise<number>;
  getPropsForMessageDetail: () => any;
  getConversation: () => ConversationModel;
  handleMessageSentSuccess: (sentMessage: any, wrappedEnvelope: any) => any;
  handleMessageSentFailure: (sentMessage: any, error: any) => any;

  propsForMessage?: any;
  propsForTimerNotification?: any;
  propsForGroupInvitation?: any;
  propsForGroupNotification?: any;
  propsForVerificationNotification?: any;
  firstMessageOfSeries: boolean;
}
