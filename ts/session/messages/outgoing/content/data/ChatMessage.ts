import { DataMessage } from './DataMessage';
import { SignalService } from '../../../../../protobuf';
import { MessageParams } from '../../Message';
import { LokiProfile } from '../../../../../types/Message';

export interface AttachmentPointer {
  id?: number;
  contentType?: string;
  key?: Uint8Array;
  size?: number;
  thumbnail?: Uint8Array;
  digest?: Uint8Array;
  filename?: string;
  flags?: number;
  width?: number;
  height?: number;
  caption?: string;
  url?: string;
}

export interface Preview {
  url?: string;
  title?: string;
  image?: AttachmentPointer;
}

export interface QuotedAttachment {
  contentType?: string;
  fileName?: string;
  thumbnail?: AttachmentPointer;
}

export interface Quote {
  id?: number;
  author?: string;
  text?: string;
  attachments?: Array<QuotedAttachment>;
}

export interface ChatMessageParams extends MessageParams {
  attachments?: Array<AttachmentPointer>;
  body?: string;
  quote?: Quote;
  expireTimer?: number;
  lokiProfile?: LokiProfile;
  preview?: Array<Preview>;
}

export class ChatMessage extends DataMessage {
  private readonly attachments?: Array<AttachmentPointer>;
  private readonly body?: string;
  private readonly quote?: Quote;
  private readonly expireTimer?: number;
  private readonly profileKey?: Uint8Array;
  private readonly displayName?: string;
  private readonly avatarPointer?: string;
  private readonly preview?: Array<Preview>;

  constructor(params: ChatMessageParams) {
    super({ timestamp: params.timestamp, identifier: params.identifier });
    this.attachments = params.attachments;
    this.body = params.body;
    this.quote = params.quote;
    this.expireTimer = params.expireTimer;
    this.profileKey = params.lokiProfile && params.lokiProfile.profileKey;
    this.displayName = params.lokiProfile && params.lokiProfile.displayName;
    this.avatarPointer = params.lokiProfile && params.lokiProfile.avatarPointer;
    this.preview = params.preview;
  }

  public ttl(): number {
    return this.getDefaultTTL();
  }

  public dataProto(): SignalService.DataMessage {
    const dataMessage = new SignalService.DataMessage();

    if (this.body) {
      dataMessage.body = this.body;
    }

    dataMessage.attachments = this.attachments || [];

    if (this.expireTimer) {
      dataMessage.expireTimer = this.expireTimer;
    }

    if (this.profileKey) {
      dataMessage.profileKey = this.profileKey;
    }

    if (this.preview) {
      dataMessage.preview = this.preview;
    }

    if (this.avatarPointer || this.displayName) {
      const profile = new SignalService.DataMessage.LokiProfile();

      if (this.avatarPointer) {
        profile.avatar = this.avatarPointer;
      }

      if (this.displayName) {
        profile.displayName = this.displayName;
      }
      dataMessage.profile = profile;
    }
    if (this.profileKey) {
      dataMessage.profileKey = this.profileKey;
    }

    if (this.quote) {
      dataMessage.quote = new SignalService.DataMessage.Quote();

      dataMessage.quote.id = this.quote.id;
      dataMessage.quote.author = this.quote.author;
      dataMessage.quote.text = this.quote.text;
      if (this.quote.attachments) {
        dataMessage.quote.attachments = this.quote.attachments.map(
          (attachment: QuotedAttachment) => {
            const quotedAttachment = new SignalService.DataMessage.Quote.QuotedAttachment();
            if (attachment.contentType) {
              quotedAttachment.contentType = attachment.contentType;
            }
            if (attachment.fileName) {
              quotedAttachment.fileName = attachment.fileName;
            }
            if (attachment.thumbnail) {
              quotedAttachment.thumbnail = attachment.thumbnail;
            }

            return quotedAttachment;
          }
        );
      }
    }

    if (Array.isArray(this.preview)) {
      dataMessage.preview = this.preview.map(preview => {
        const item = new SignalService.DataMessage.Preview();
        if (preview.title) {
          item.title = preview.title;
        }
        if (preview.url) {
          item.url = preview.url;
        }
        item.image = preview.image || null;

        return item;
      });
    }

    return dataMessage;
  }
}
