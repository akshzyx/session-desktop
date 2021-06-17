import { DataMessage } from '..';
import { Constants } from '../../..';
import { SignalService } from '../../../../protobuf';
import { MessageParams } from '../Message';

interface GroupInvitationMessageParams extends MessageParams {
  serverAddress: string;
  serverName: string;
  // if there is an expire timer set for the conversation, we need to set it.
  // otherwise, it will disable the expire timer on the receiving side.
  expireTimer?: number;
}

export class GroupInvitationMessage extends DataMessage {
  private readonly serverAddress: string;
  private readonly serverName: string;
  private readonly expireTimer?: number;

  constructor(params: GroupInvitationMessageParams) {
    super({ timestamp: params.timestamp, identifier: params.identifier });
    this.serverAddress = params.serverAddress;
    this.serverName = params.serverName;
    this.expireTimer = params.expireTimer;
  }

  public dataProto(): SignalService.DataMessage {
    const openGroupInvitation = new SignalService.DataMessage.OpenGroupInvitation({
      url: this.serverAddress,
      name: this.serverName,
    });

    return new SignalService.DataMessage({
      openGroupInvitation,
      expireTimer: this.expireTimer,
    });
  }
}
