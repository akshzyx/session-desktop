import {
  ChatMessage,
  ClosedGroupChatMessage,
  OpenGroupMessage,
} from '../../../session/messages/outgoing';
import { v4 as uuid } from 'uuid';
import { OpenGroup } from '../../../session/objects';
import { generateFakePubKey, generateFakePubKeys } from './pubkey';
import { ConversationAttributes } from '../../../../js/models/conversations';

export function generateChatMessage(identifier?: string): ChatMessage {
  return new ChatMessage({
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
    identifier: identifier ?? uuid(),
    timestamp: Date.now(),
    attachments: undefined,
    quote: undefined,
    expireTimer: undefined,
    lokiProfile: undefined,
    preview: undefined,
  });
}

export function generateOpenGroupMessage(): OpenGroupMessage {
  const group = new OpenGroup({
    server: 'chat.example.server',
    channel: 0,
    conversationId: '0',
  });

  return new OpenGroupMessage({
    timestamp: Date.now(),
    group,
    attachments: undefined,
    preview: undefined,
    body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
    quote: undefined,
  });
}

export function generateClosedGroupMessage(
  groupId?: string
): ClosedGroupChatMessage {
  return new ClosedGroupChatMessage({
    identifier: uuid(),
    groupId: groupId ?? generateFakePubKey().key,
    chatMessage: generateChatMessage(),
  });
}

interface MockConversationParams {
  id?: string;
  type: MockConversationType;
  members?: Array<string>;
}

export enum MockConversationType {
  Primary = 'primary',
  Secondary = 'secondary',
  Group = 'group',
}

export class MockConversation {
  public id: string;
  public type: MockConversationType;
  public attributes: ConversationAttributes;
  public isPrimary?: boolean;

  constructor(params: MockConversationParams) {
    const dayInSeconds = 86400;

    this.type = params.type;
    this.id = params.id ?? generateFakePubKey().key;
    this.isPrimary = this.type === MockConversationType.Primary;

    const members =
      this.type === MockConversationType.Group
        ? params.members ?? generateFakePubKeys(10).map(m => m.key)
        : [];

    this.attributes = {
      members,
      left: false,
      expireTimer: dayInSeconds,
      profileSharing: true,
      mentionedUs: false,
      unreadCount: 99,
      isArchived: false,
      active_at: Date.now(),
      timestamp: Date.now(),
      secondaryStatus: !this.isPrimary,
    };
  }

  public isPrivate() {
    return true;
  }

  public isOurLocalDevice() {
    return false;
  }

  public isBlocked() {
    return false;
  }

  public getPrimaryDevicePubKey() {
    if (this.type === MockConversationType.Group) {
      return undefined;
    }

    return this.isPrimary ? this.id : generateFakePubKey().key;
  }

  public get(obj: string) {
    return (this.attributes as any)[obj];
  }
}
