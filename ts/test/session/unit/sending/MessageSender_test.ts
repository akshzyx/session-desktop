import { expect } from 'chai';
import * as crypto from 'crypto';
import * as sinon from 'sinon';
import { toNumber } from 'lodash';
import { LokiMessageApi, MessageSender } from '../../../../session/sending';
import { TestUtils } from '../../../test-utils';
import { MessageEncrypter } from '../../../../session/crypto';
import { SignalService } from '../../../../protobuf';
import { OpenGroupMessage } from '../../../../session/messages/outgoing';
import { EncryptionType } from '../../../../session/types/EncryptionType';
import { PubKey } from '../../../../session/types';
import { UserUtils } from '../../../../session/utils';

describe('MessageSender', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
    TestUtils.restoreStubs();
  });

  // tslint:disable-next-line: max-func-body-length
  describe('send', () => {
    const ourNumber = '0123456789abcdef';
    let lokiMessageAPISendStub: sinon.SinonStub<any>;
    let encryptStub: sinon.SinonStub<[PubKey, Uint8Array, EncryptionType]>;

    beforeEach(() => {
      lokiMessageAPISendStub = sandbox.stub(LokiMessageApi, 'sendMessage').resolves();

      encryptStub = sandbox.stub(MessageEncrypter, 'encrypt').resolves({
        envelopeType: SignalService.Envelope.Type.UNIDENTIFIED_SENDER,
        cipherText: crypto.randomBytes(10),
      });

      sandbox.stub(UserUtils, 'getOurPubKeyStrFromCache').returns(ourNumber);
    });

    describe('retry', () => {
      const rawMessage = {
        identifier: '1',
        device: TestUtils.generateFakePubKey().key,
        plainTextBuffer: crypto.randomBytes(10),
        encryption: EncryptionType.Fallback,
        timestamp: Date.now(),
        ttl: 100,
      };

      it('should not retry if an error occurred during encryption', async () => {
        encryptStub.throws(new Error('Failed to encrypt.'));
        const promise = MessageSender.send(rawMessage);
        await expect(promise).is.rejectedWith('Failed to encrypt.');
        expect(lokiMessageAPISendStub.callCount).to.equal(0);
      });

      it('should only call lokiMessageAPI once if no errors occured', async () => {
        await MessageSender.send(rawMessage);
        expect(lokiMessageAPISendStub.callCount).to.equal(1);
      });

      it('should only retry the specified amount of times before throwing', async () => {
        // const clock = sinon.useFakeTimers();

        lokiMessageAPISendStub.throws(new Error('API error'));
        const attempts = 2;
        const promise = MessageSender.send(rawMessage, attempts, 10);
        await expect(promise).is.rejectedWith('API error');
        // clock.restore();
        expect(lokiMessageAPISendStub.callCount).to.equal(attempts);
      });

      it('should not throw error if successful send occurs within the retry limit', async () => {
        lokiMessageAPISendStub.onFirstCall().throws(new Error('API error'));
        await MessageSender.send(rawMessage, 3, 10);
        expect(lokiMessageAPISendStub.callCount).to.equal(2);
      });
    });

    describe('logic', () => {
      let messageEncyrptReturnEnvelopeType = SignalService.Envelope.Type.UNIDENTIFIED_SENDER;

      beforeEach(() => {
        encryptStub.callsFake(async (_device, plainTextBuffer, _type) => ({
          envelopeType: messageEncyrptReturnEnvelopeType,
          cipherText: plainTextBuffer,
        }));
      });

      it('should pass the correct values to lokiMessageAPI', async () => {
        const device = TestUtils.generateFakePubKey().key;
        const timestamp = Date.now();
        const ttl = 100;

        await MessageSender.send({
          identifier: '1',
          device,
          plainTextBuffer: crypto.randomBytes(10),
          encryption: EncryptionType.Fallback,
          timestamp,
          ttl,
        });

        const args = lokiMessageAPISendStub.getCall(0).args;
        expect(args[0]).to.equal(device);
        expect(args[2]).to.equal(timestamp);
        expect(args[3]).to.equal(ttl);
      });

      it('should correctly build the envelope', async () => {
        messageEncyrptReturnEnvelopeType = SignalService.Envelope.Type.UNIDENTIFIED_SENDER;

        // This test assumes the encryption stub returns the plainText passed into it.
        const device = TestUtils.generateFakePubKey().key;
        const plainTextBuffer = crypto.randomBytes(10);
        const timestamp = Date.now();

        await MessageSender.send({
          identifier: '1',
          device,
          plainTextBuffer,
          encryption: EncryptionType.Fallback,
          timestamp,
          ttl: 1,
        });

        const data = lokiMessageAPISendStub.getCall(0).args[1];
        const webSocketMessage = SignalService.WebSocketMessage.decode(data);
        expect(webSocketMessage.request?.body).to.not.equal(
          undefined,
          'Request body should not be undefined'
        );
        expect(webSocketMessage.request?.body).to.not.equal(
          null,
          'Request body should not be null'
        );

        const envelope = SignalService.Envelope.decode(
          webSocketMessage.request?.body as Uint8Array
        );
        expect(envelope.type).to.equal(SignalService.Envelope.Type.UNIDENTIFIED_SENDER);
        expect(envelope.source).to.equal('');
        expect(toNumber(envelope.timestamp)).to.equal(timestamp);
        expect(envelope.content).to.deep.equal(plainTextBuffer);
      });

      describe('UNIDENTIFIED_SENDER', () => {
        it('should set the envelope source to be empty', async () => {
          messageEncyrptReturnEnvelopeType = SignalService.Envelope.Type.UNIDENTIFIED_SENDER;

          // This test assumes the encryption stub returns the plainText passed into it.
          const device = TestUtils.generateFakePubKey().key;
          const plainTextBuffer = crypto.randomBytes(10);
          const timestamp = Date.now();

          await MessageSender.send({
            identifier: '1',
            device,
            plainTextBuffer,
            encryption: EncryptionType.Fallback,
            timestamp,
            ttl: 1,
          });

          const data = lokiMessageAPISendStub.getCall(0).args[1];
          const webSocketMessage = SignalService.WebSocketMessage.decode(data);
          expect(webSocketMessage.request?.body).to.not.equal(
            undefined,
            'Request body should not be undefined'
          );
          expect(webSocketMessage.request?.body).to.not.equal(
            null,
            'Request body should not be null'
          );

          const envelope = SignalService.Envelope.decode(
            webSocketMessage.request?.body as Uint8Array
          );
          expect(envelope.type).to.equal(SignalService.Envelope.Type.UNIDENTIFIED_SENDER);
          expect(envelope.source).to.equal(
            '',
            'envelope source should be empty in UNIDENTIFIED_SENDER'
          );
        });
      });
    });
  });

  describe('sendToOpenGroup', () => {
    it('should send the message to the correct server and channel', async () => {
      // We can do this because LokiPublicChatFactoryAPI has a module export in it
      const stub = sandbox.stub().resolves({
        sendMessage: sandbox.stub(),
      });

      TestUtils.stubWindow('lokiPublicChatAPI', {
        findOrCreateChannel: stub,
      });

      const group = {
        server: 'server',
        channel: 1,
        conversationId: '0',
      };

      const message = new OpenGroupMessage({
        timestamp: Date.now(),
        group,
      });

      await MessageSender.sendToOpenGroup(message);

      const [server, channel, conversationId] = stub.getCall(0).args;
      expect(server).to.equal(group.server);
      expect(channel).to.equal(group.channel);
      expect(conversationId).to.equal(group.conversationId);
    });
  });
});
