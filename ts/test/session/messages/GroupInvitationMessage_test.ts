import { expect } from 'chai';
import { beforeEach} from 'mocha';

import { GroupInvitationMessage } from '../../../session/messages/outgoing';
import { SignalService } from '../../../protobuf';

describe('GroupInvitationMessage', () => {
    let message: GroupInvitationMessage;
    const timestamp = Date.now();
    const identifier = '123456';
    const serverAddress = 'http://localhost';
    const channelId = 1;
    const serverName = 'test';

    beforeEach(() => {
        message = new GroupInvitationMessage({
            timestamp,
            identifier,
            serverAddress,
            channelId,
            serverName,
        });
    });

    it('dataMessage.groupInvitation has serverAddress, channelId, and serverName set', () => {
        const plainText = message.plainTextBuffer();
        const decoded = SignalService.Content.toObject(SignalService.Content.decode(plainText));

        expect(decoded.dataMessage.groupInvitation).to.have.property('serverAddress', serverAddress);
        expect(decoded.dataMessage.groupInvitation).to.have.property('channelId', channelId);
        expect(decoded.dataMessage.groupInvitation).to.have.property('serverName', serverName);
    });

    it('ttl of 1 day', () => {
        expect(message.ttl()).to.equal(24 * 60 * 60 * 1000);
    });
});
