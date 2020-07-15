// TODO: fix libloki and textsecure not being available here yet

import { handleEndSession } from './sessionHandling';
import { EnvelopePlus } from './types';
import { downloadAttachment } from './attachments';
import { handleMediumGroupUpdate } from './mediumGroups';
import { onGroupReceived } from './groups';

import { addToCache, getAllFromCache, removeFromCache } from './cache';
import { processMessage } from '../session/snode_api/swarmPolling';
import { onError } from './errors';

// innerHandleContentMessage is only needed because of code duplication in handleDecryptedEnvelope...
import {
  handleContentMessage,
  innerHandleContentMessage,
  isBlocked,
  onDeliveryReceipt,
} from './contentMessage';
import _ from 'lodash';

export { processMessage, onDeliveryReceipt, onGroupReceived };

import {
  handleDataMessage,
  handleMessageEvent,
  updateProfile,
} from './dataMessage';

import { getEnvelopeId } from './common';
import { StringUtils } from '../session/utils';
import { SignalService } from '../protobuf';
import { BlockedNumberController } from '../util/blockedNumberController';

// TODO: check if some of these exports no longer needed
export {
  handleEndSession,
  handleMediumGroupUpdate,
  downloadAttachment,
  handleDataMessage,
  updateProfile,
  handleMessageEvent,
};

interface ReqOptions {
  conversationId: string;
}

const incomingMessagePromises: Array<Promise<any>> = [];

async function handleEnvelope(envelope: EnvelopePlus) {
  // TODO: enable below

  // if (this.stoppingProcessing) {
  //   return Promise.resolve();
  // }

  if (envelope.type === SignalService.Envelope.Type.RECEIPT) {
    return onDeliveryReceipt(envelope.source, envelope.timestamp);
  }

  if (envelope.content && envelope.content.length > 0) {
    return handleContentMessage(envelope);
  }

  await removeFromCache(envelope);
  throw new Error('Received message with no content and no legacyMessage');
}

class EnvelopeQueue {
  private count: number = 0;

  // Last pending promise
  private pending: Promise<any> = Promise.resolve();

  public async add(task: any): Promise<any> {
    this.count += 1;
    const promise = this.pending.then(task, task);
    this.pending = promise;

    this.pending.then(
      this.cleanup.bind(this, promise),
      this.cleanup.bind(this, promise)
    );
  }

  private cleanup(promise: Promise<any>) {
    // TODO: enable this?
    // this.updateProgress(this.count);

    // We want to clear out the promise chain whenever possible because it could
    //   lead to large memory usage over time:
    //   https://github.com/nodejs/node/issues/6673#issuecomment-244331609
    if (this.pending === promise) {
      this.pending = Promise.resolve();
    }
  }
}

const envelopeQueue = new EnvelopeQueue();

function queueEnvelope(envelope: EnvelopePlus) {
  const id = getEnvelopeId(envelope);
  window.log.info('queueing envelope', id);

  const task = handleEnvelope.bind(null, envelope);
  const taskWithTimeout = window.textsecure.createTaskWithTimeout(
    task,
    `queueEnvelope ${id}`
  );

  const promise = envelopeQueue.add(taskWithTimeout);

  promise.catch((error: any) => {
    window.log.error(
      'queueEnvelope error handling envelope',
      id,
      ':',
      error && error.stack ? error.stack : error
    );
  });
}

async function handleRequestDetail(
  plaintext: Uint8Array,
  options: ReqOptions,
  lastPromise: Promise<any>
): Promise<void> {
  const { textsecure } = window;

  const envelope: any = SignalService.Envelope.decode(plaintext);

  // After this point, decoding errors are not the server's
  //   fault, and we should handle them gracefully and tell the
  //   user they received an invalid message

  // The message is for a medium size group
  if (options.conversationId) {
    const ourNumber = textsecure.storage.user.getNumber();
    const senderIdentity = envelope.source;

    if (senderIdentity === ourNumber) {
      return;
    }

    // Sender identity will be lost if we load from cache, because
    // plaintext (and protobuf.Envelope) does not have that field...
    envelope.source = options.conversationId;
    // tslint:disable-next-line no-parameter-reassignment
    plaintext = SignalService.Envelope.encode(envelope).finish();
    envelope.senderIdentity = senderIdentity;
  }

  envelope.id = envelope.serverGuid || window.getGuid();
  envelope.serverTimestamp = envelope.serverTimestamp
    ? envelope.serverTimestamp.toNumber()
    : null;

  try {
    // NOTE: Annoyngly we add plaintext to the cache
    // after we've already processed some of it (thus the
    // need to handle senderIdentity separately)...

    await addToCache(envelope, plaintext);

    // TODO: This is the glue between the first and the last part of the
    // receiving pipeline refactor. It is to be implemented in the next PR.

    // To ensure that we queue in the same order we receive messages
    await lastPromise;
    queueEnvelope(envelope);
  } catch (error) {
    window.log.error(
      'handleRequest error trying to add message to cache:',
      error && error.stack ? error.stack : error
    );
  }
}

export async function handleRequest(
  body: any,
  options: ReqOptions
): Promise<void> {
  // tslint:disable-next-line no-promise-as-boolean
  const lastPromise = _.last(incomingMessagePromises) || Promise.resolve();

  const plaintext = body;

  const promise = handleRequestDetail(plaintext, options, lastPromise).catch(
    e => {
      window.log.error(
        'Error handling incoming message:',
        e && e.stack ? e.stack : e
      );

      void onError(e);
    }
  );

  incomingMessagePromises.push(promise);
}
// tslint:enable:cyclomatic-complexity max-func-body-length */

// ***********************************************************************
// ***********************************************************************
// ***********************************************************************

export async function queueAllCached() {
  const items = await getAllFromCache();
  items.forEach(async item => {
    await queueCached(item);
  });
}

async function queueCached(item: any) {
  const { textsecure } = window;

  try {
    const envelopePlaintext = StringUtils.encode(item.envelope, 'base64');
    const envelopeArray = new Uint8Array(envelopePlaintext);

    const envelope: any = SignalService.Envelope.decode(envelopeArray);
    envelope.id = envelope.serverGuid || item.id;
    envelope.source = envelope.source || item.source;

    // Why do we need to do this???
    envelope.sourceDevice = 1;
    envelope.senderIdentity = envelope.senderIdentity || item.senderIdentity;
    envelope.serverTimestamp = envelope.serverTimestamp || item.serverTimestamp;
    envelope.preKeyBundleMessage =
      envelope.preKeyBundleMessage || item.preKeyBundleMessage;

    const { decrypted } = item;

    if (decrypted) {
      const payloadPlaintext = StringUtils.encode(decrypted, 'base64');

      await queueDecryptedEnvelope(envelope, payloadPlaintext);
    } else {
      queueEnvelope(envelope);
    }
  } catch (error) {
    window.log.error(
      'queueCached error handling item',
      item.id,
      'removing it. Error:',
      error && error.stack ? error.stack : error
    );

    try {
      const { id } = item;
      await textsecure.storage.unprocessed.remove(id);
    } catch (deleteError) {
      window.log.error(
        'queueCached error deleting item',
        item.id,
        'Error:',
        deleteError && deleteError.stack ? deleteError.stack : deleteError
      );
    }
  }
}

async function queueDecryptedEnvelope(envelope: any, plaintext: ArrayBuffer) {
  const id = getEnvelopeId(envelope);
  window.log.info('queueing decrypted envelope', id);

  const task = handleDecryptedEnvelope.bind(null, envelope, plaintext);
  const taskWithTimeout = window.textsecure.createTaskWithTimeout(
    task,
    `queueEncryptedEnvelope ${id}`
  );
  const promise = envelopeQueue.add(taskWithTimeout);

  return promise.catch(error => {
    window.log.error(
      `queueDecryptedEnvelope error handling envelope ${id}:`,
      error && error.stack ? error.stack : error
    );
  });
}

async function handleDecryptedEnvelope(
  envelope: EnvelopePlus,
  plaintext: ArrayBuffer
) {
  // if (this.stoppingProcessing) {
  //   return Promise.resolve();
  // }

  if (envelope.content) {
    await innerHandleContentMessage(envelope, plaintext);
  } else {
    await removeFromCache(envelope);
  }
}

export async function handleUnencryptedMessage({ message: outerMessage }: any) {
  const { source } = outerMessage;
  const { group, profile, profileKey } = outerMessage.message;

  const ourNumber = window.textsecure.storage.user.getNumber();
  const isMe = source === ourNumber;

  if (!isMe && profile) {
    const conversation = await window.ConversationController.getOrCreateAndWait(
      source,
      'private'
    );
    await updateProfile(conversation, profile, profileKey);
  }

  const primaryDevice = window.storage.get('primaryDevicePubKey');
  const isOurDevice =
    source && (source === ourNumber || source === primaryDevice);
  const isPublicChatMessage =
    group && group.id && !!group.id.match(/^publicChat:/);

  const ev = {
    // Public chat messages from ourselves should be outgoing
    type: isPublicChatMessage && isOurDevice ? 'sent' : 'message',
    data: outerMessage,
    confirm: () => {
      /* do nothing */
    },
  };

  await handleMessageEvent(ev);
}
