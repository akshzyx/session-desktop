import chai from 'chai';
import * as sinon from 'sinon';
import { TestUtils } from '../../../test-utils';
import { MessageUtils } from '../../../../session/utils';
import { EncryptionType, PubKey } from '../../../../session/types';
import { ClosedGroupV2ChatMessage } from '../../../../session/messages/outgoing/content/data/groupv2/ClosedGroupV2ChatMessage';
import {
  ClosedGroupV2EncryptionPairMessage,
  ClosedGroupV2NewMessage,
  ClosedGroupV2UpdateMessage,
} from '../../../../session/messages/outgoing';
import { SignalService } from '../../../../protobuf';
// tslint:disable-next-line: no-require-imports no-var-requires
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

const { expect } = chai;

describe('Message Utils', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe('toRawMessage', () => {
    it('can convert to raw message', async () => {
      const device = TestUtils.generateFakePubKey();
      const message = TestUtils.generateChatMessage();

      const rawMessage = await MessageUtils.toRawMessage(device, message);

      expect(Object.keys(rawMessage)).to.have.length(6);
      expect(rawMessage.identifier).to.exist;
      expect(rawMessage.device).to.exist;
      expect(rawMessage.encryption).to.exist;
      expect(rawMessage.plainTextBuffer).to.exist;
      expect(rawMessage.timestamp).to.exist;
      expect(rawMessage.ttl).to.exist;

      expect(rawMessage.identifier).to.equal(message.identifier);
      expect(rawMessage.device).to.equal(device.key);
      expect(rawMessage.plainTextBuffer).to.deep.equal(
        message.plainTextBuffer()
      );
      expect(rawMessage.timestamp).to.equal(message.timestamp);
      expect(rawMessage.ttl).to.equal(message.ttl());
    });

    it('should generate valid plainTextBuffer', async () => {
      const device = TestUtils.generateFakePubKey();
      const message = TestUtils.generateChatMessage();

      const rawMessage = await MessageUtils.toRawMessage(device, message);

      const rawBuffer = rawMessage.plainTextBuffer;
      const rawBufferJSON = JSON.stringify(rawBuffer);
      const messageBufferJSON = JSON.stringify(message.plainTextBuffer());

      expect(rawBuffer instanceof Uint8Array).to.equal(
        true,
        'raw message did not contain a plainTextBuffer'
      );
      expect(rawBufferJSON).to.equal(
        messageBufferJSON,
        'plainTextBuffer was not converted correctly'
      );
    });

    it('should maintain pubkey', async () => {
      const device = TestUtils.generateFakePubKey();
      const message = TestUtils.generateChatMessage();

      const rawMessage = await MessageUtils.toRawMessage(device, message);
      const derivedPubKey = PubKey.from(rawMessage.device);

      expect(derivedPubKey).to.exist;
      expect(derivedPubKey?.isEqual(device)).to.equal(
        true,
        'pubkey of message was not converted correctly'
      );
    });

    it('should set encryption to ClosedGroup if a ClosedGroupV2ChatMessage is passed in', async () => {
      const device = TestUtils.generateFakePubKey();
      const groupId = TestUtils.generateFakePubKey();
      const chatMessage = TestUtils.generateChatMessage();
      const message = new ClosedGroupV2ChatMessage({ chatMessage, groupId });

      const rawMessage = await MessageUtils.toRawMessage(device, message);
      expect(rawMessage.encryption).to.equal(EncryptionType.ClosedGroup);
    });

    it('should set encryption to Fallback on other messages', async () => {
      const device = TestUtils.generateFakePubKey();
      const message = TestUtils.generateChatMessage();
      const rawMessage = await MessageUtils.toRawMessage(device, message);

      expect(rawMessage.encryption).to.equal(EncryptionType.Fallback);
    });

    it('passing ClosedGroupV2NewMessage returns Fallback', async () => {
      const device = TestUtils.generateFakePubKey();
      const member = TestUtils.generateFakePubKey().key;

      const msg = new ClosedGroupV2NewMessage({
        timestamp: Date.now(),
        name: 'df',
        members: [member],
        admins: [member],
        groupId: TestUtils.generateFakePubKey().key,
        keypair: TestUtils.generateFakeECKeyPair(),
        expireTimer: 0,
      });
      const rawMessage = await MessageUtils.toRawMessage(device, msg);
      expect(rawMessage.encryption).to.equal(EncryptionType.Fallback);
    });

    it('passing ClosedGroupV2UpdateMessage returns ClosedGroup', async () => {
      const device = TestUtils.generateFakePubKey();

      const msg = new ClosedGroupV2UpdateMessage({
        timestamp: Date.now(),
        name: 'df',
        members: [TestUtils.generateFakePubKey().key],
        groupId: TestUtils.generateFakePubKey().key,
        expireTimer: 0,
      });
      const rawMessage = await MessageUtils.toRawMessage(device, msg);
      expect(rawMessage.encryption).to.equal(EncryptionType.ClosedGroup);
    });

    it('passing ClosedGroupV2EncryptionPairMessage returns ClosedGroup', async () => {
      const device = TestUtils.generateFakePubKey();

      const fakeWrappers = new Array<
        SignalService.DataMessage.ClosedGroupUpdateV2.KeyPairWrapper
      >();
      fakeWrappers.push(
        new SignalService.DataMessage.ClosedGroupUpdateV2.KeyPairWrapper({
          publicKey: new Uint8Array(8),
          encryptedKeyPair: new Uint8Array(8),
        })
      );
      const msg = new ClosedGroupV2EncryptionPairMessage({
        timestamp: Date.now(),
        groupId: TestUtils.generateFakePubKey().key,
        encryptedKeyPairs: fakeWrappers,
        expireTimer: 0,
      });
      const rawMessage = await MessageUtils.toRawMessage(device, msg);
      expect(rawMessage.encryption).to.equal(EncryptionType.ClosedGroup);
    });

    it('passing ClosedGroupV2EncryptionPairMessage returns ClosedGroup', async () => {
      const device = TestUtils.generateFakePubKey();

      const fakeWrappers = new Array<
        SignalService.DataMessage.ClosedGroupUpdateV2.KeyPairWrapper
      >();
      fakeWrappers.push(
        new SignalService.DataMessage.ClosedGroupUpdateV2.KeyPairWrapper({
          publicKey: new Uint8Array(8),
          encryptedKeyPair: new Uint8Array(8),
        })
      );
      const msg = new ClosedGroupV2EncryptionPairMessage({
        timestamp: Date.now(),
        groupId: TestUtils.generateFakePubKey().key,
        encryptedKeyPairs: fakeWrappers,
        expireTimer: 0,
      });
      const rawMessage = await MessageUtils.toRawMessage(device, msg);
      expect(rawMessage.encryption).to.equal(EncryptionType.ClosedGroup);
    });
  });
});
