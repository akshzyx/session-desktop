import { MessageModel, MessageAttributes } from './messages';

interface ConversationAttributes {
  profileName?: string;
  id: string;
  name: string;
  members: Array<string>;
  left: boolean;
  expireTimer: number;
  profileSharing: boolean;
  mentionedUs: boolean;
  unreadCount: number;
  active_at: number;
  timestamp: number; // timestamp of what?
  lastJoinedTimestamp: number; // ClosedGroupV2: last time we were added to this group
  groupAdmins?: Array<string>;
  isKickedFromGroup?: boolean;
  avatarPath?: string;
  isMe?: boolean;
  subscriberCount?: number;
  sessionRestoreSeen?: boolean;
  is_medium_group?: boolean;
  type: string;
  lastMessage?: string;
}

export interface ConversationModel
  extends Backbone.Model<ConversationAttributes> {
  destroyMessages();
  getPublicSendData();
  leaveGroup();
  idForLogging: () => string;
  // Save model changes to the database
  commit: () => Promise<void>;
  notify: (message: MessageModel) => void;
  updateExpirationTimer: (
    expireTimer: number | null,
    source?: string,
    receivedAt?: number,
    options?: object
  ) => Promise<void>;
  isPrivate: () => boolean;
  getProfile: (id: string) => Promise<any>;
  getProfiles: () => Promise<any>;
  setProfileKey: (key: string) => Promise<void>;
  isMe: () => boolean;
  getRecipients: () => Array<string>;
  getTitle: () => string;
  onReadMessage: (message: MessageModel) => void;
  getName: () => string;
  addMessage: (attributes: Partial<MessageAttributes>) => Promise<MessageModel>;
  isMediumGroup: () => boolean;
  getNickname: () => string | undefined;
  setNickname: (nickname: string | undefined) => Promise<void>;
  getUnread: () => Promise<Whisper.MessageCollection>;
  getUnreadCount: () => Promise<number>;

  isPublic: () => boolean;
  isClosedGroup: () => boolean;
  isBlocked: () => boolean;
  isClosable: () => boolean;
  isAdmin: (id: string) => boolean;
  throttledBumpTyping: () => void;

  // types to make more specific
  sendMessage: (
    body: any,
    attachments: any,
    quote: any,
    preview: any,
    groupInvitation: any,
    otherOptions: any
  ) => Promise<void>;
  updateGroupAdmins: any;
  setLokiProfile: any;
  getLokiProfile: any;
  getNumber: any;
  getProfileName: any;
  getAvatarPath: any;
  markRead: (timestamp: number) => Promise<void>;
  showChannelLightbox: any;
  deletePublicMessages: any;
  makeQuote: any;
  unblock: any;
  deleteContact: any;
  removeMessage: (messageId: string) => Promise<void>;
  deleteMessages();

  endSession: () => Promise<void>;
  block: any;
  copyPublicKey: any;
  getAvatar: any;
  notifyTyping: (
    { isTyping, sender } = { isTyping: boolean, sender: string }
  ) => any;
  queueJob: any;
  onUpdateGroupName: any;
  getContactProfileNameOrShortenedPubKey: () => string;
  getContactProfileNameOrFullPubKey: () => string;
  getProps(): any;
  updateLastMessage: () => void;
  updateProfileName: any;
  updateProfileAvatar: any;
}
