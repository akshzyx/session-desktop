import { expect } from 'chai';
import { beforeEach } from 'mocha';

import { SessionRequestMessage } from '../../../session/messages/outgoing';
import { SignalService } from '../../../protobuf';
import { TextDecoder, TextEncoder } from 'util';
import { Constants } from '../../../session';

describe('SessionRequestMessage', () => {
  let message: SessionRequestMessage;
  const preKeyBundle = {
    deviceId: 123456,
    preKeyId: 654321,
    signedKeyId: 111111,
    preKey: new TextEncoder().encode('preKey'),
    signature: new TextEncoder().encode('signature'),
    signedKey: new TextEncoder().encode('signedKey'),
    identityKey: new TextEncoder().encode('identityKey'),
  };

  beforeEach(() => {
    const timestamp = Date.now();
    message = new SessionRequestMessage({ timestamp, preKeyBundle });
  });

  it('has a preKeyBundle', () => {
    const plainText = message.plainTextBuffer();
    const decoded = SignalService.Content.decode(plainText);

    expect(decoded.preKeyBundleMessage).to.have.property(
      'deviceId',
      preKeyBundle.deviceId
    );
    expect(decoded.preKeyBundleMessage).to.have.property(
      'preKeyId',
      preKeyBundle.preKeyId
    );
    expect(decoded.preKeyBundleMessage).to.have.property(
      'signedKeyId',
      preKeyBundle.signedKeyId
    );

    const signature = new TextDecoder().decode(
      decoded.preKeyBundleMessage?.signature
    );
    const signedKey = new TextDecoder().decode(
      decoded.preKeyBundleMessage?.signedKey
    );
    const identityKey = new TextDecoder().decode(
      decoded.preKeyBundleMessage?.identityKey
    );

    expect(signature).to.be.deep.equal('signature');
    expect(signedKey).to.be.deep.equal('signedKey');
    expect(identityKey).to.be.deep.equal('identityKey');
  });

  it('has a nullMessage not null', () => {
    const plainText = message.plainTextBuffer();
    const decoded = SignalService.Content.decode(plainText);

    expect(decoded.nullMessage).to.be.not.equal(
      null,
      'decoded.dataMessage.nullMessage should not be null'
    );
  });

  it('correct ttl', () => {
    expect(message.ttl()).to.equal(Constants.TTL_DEFAULT.SESSION_REQUEST);
  });

  it('has an identifier', () => {
    expect(message.identifier).to.not.equal(null, 'identifier cannot be null');
    expect(message.identifier).to.not.equal(
      undefined,
      'identifier cannot be undefined'
    );
  });
});
