import { removeFromCache } from './cache';
import { EnvelopePlus } from './types';

import * as Data from '../../js/modules/data';

import { SignalService } from '../protobuf';
import { updateProfile } from './dataMessage';
import { onVerified } from './syncMessages';

import { StringUtils } from '../session/utils';
import { MultiDeviceProtocol } from '../session/protocols';

import ByteBuffer from 'bytebuffer';
import { BlockedNumberController } from '../util';
import { ConversationController } from '../session/conversations';

async function unpairingRequestIsLegit(source: string, ourPubKey: string) {
  const { textsecure, storage, lokiFileServerAPI } = window;

  const isSecondary = textsecure.storage.get('isSecondaryDevice');
  if (!isSecondary) {
    return false;
  }
  const primaryPubKey = storage.get('primaryDevicePubKey');
  // TODO: allow unpairing from any paired device?
  if (source !== primaryPubKey) {
    return false;
  }

  const primaryMapping = await lokiFileServerAPI.getUserDeviceMapping(
    primaryPubKey
  );

  // If we don't have a mapping on the primary then we have been unlinked
  if (!primaryMapping) {
    return true;
  }

  // We expect the primary device to have updated its mapping
  // before sending the unpairing request
  const found = primaryMapping.authorisations.find(
    (authorisation: any) => authorisation.secondaryDevicePubKey === ourPubKey
  );

  // our pubkey should NOT be in the primary device mapping
  return !found;
}

async function clearAppAndRestart() {
  // remove our device mapping annotations from file server
  await window.lokiFileServerAPI.clearOurDeviceMappingAnnotations();
  // Delete the account and restart
  try {
    await window.Signal.Logs.deleteAll();
    await Data.removeAll();
    await Data.close();
    await Data.removeDB();
    await Data.removeOtherData();
    // TODO generate an empty db with a flag
    // to display a message about the unpairing
    // after the app restarts
  } catch (error) {
    window.log.error(
      'Something went wrong deleting all data:',
      error && error.stack ? error.stack : error
    );
  }
  window.restart();
}

export async function handleUnpairRequest(
  envelope: EnvelopePlus,
  ourPubKey: string
) {
  // TODO: move high-level pairing logic to libloki.multidevice.xx

  const legit = await unpairingRequestIsLegit(envelope.source, ourPubKey);

  await removeFromCache(envelope);
  if (legit) {
    await clearAppAndRestart();
  }
}

export async function handlePairingAuthorisationMessage(
  envelope: EnvelopePlus,
  pairingAuthorisation: SignalService.IPairingAuthorisationMessage,
  dataMessage: SignalService.IDataMessage | undefined | null
): Promise<void> {
  if (!window.lokiFeatureFlags.useMultiDevice) {
    window.log.info(
      `Received a pairing authorisation message from ${envelope.source} while multi device is disabled.`
    );
    await removeFromCache(envelope);
    return;
  }

  const { secondaryDevicePubKey, grantSignature } = pairingAuthorisation;
  const isGrant =
    grantSignature &&
    grantSignature.length > 0 &&
    secondaryDevicePubKey === window.textsecure.storage.user.getNumber();
  if (isGrant) {
    await handleAuthorisationForSelf(
      envelope,
      pairingAuthorisation,
      dataMessage
    );
  } else {
    await handlePairingRequest(envelope, pairingAuthorisation);
  }
}

async function handlePairingRequest(
  envelope: EnvelopePlus,
  pairingRequest: SignalService.IPairingAuthorisationMessage
) {
  const { libloki, Whisper } = window;

  const valid = await libloki.crypto.validateAuthorisation(pairingRequest);
  if (valid) {
    // Pairing dialog is open and is listening
    if (Whisper.events.isListenedTo('devicePairingRequestReceived')) {
      await MultiDeviceProtocol.savePairingAuthorisation(
        pairingRequest as Data.PairingAuthorisation
      );
      Whisper.events.trigger(
        'devicePairingRequestReceived',
        pairingRequest.secondaryDevicePubKey
      );
    } else {
      Whisper.events.trigger(
        'devicePairingRequestReceivedNoListener',
        pairingRequest.secondaryDevicePubKey
      );
    }
    // Ignore requests if the dialog is closed
  }
  await removeFromCache(envelope);
}

async function handleAuthorisationForSelf(
  envelope: EnvelopePlus,
  pairingAuthorisation: SignalService.IPairingAuthorisationMessage,
  dataMessage: SignalService.IDataMessage | undefined | null
) {
  const { libloki, Whisper } = window;

  const valid = await libloki.crypto.validateAuthorisation(
    pairingAuthorisation
  );
  const alreadySecondaryDevice = !!window.storage.get('isSecondaryDevice');
  if (alreadySecondaryDevice) {
    window.log.warn(
      'Received an unexpected pairing authorisation (device is already paired as secondary device). Ignoring.'
    );
  } else if (!valid) {
    window.log.warn(
      'Received invalid pairing authorisation for self. Could not verify signature. Ignoring.'
    );
  } else {
    const { primaryDevicePubKey, grantSignature } = pairingAuthorisation;
    if (grantSignature && grantSignature.length > 0 && primaryDevicePubKey) {
      // Authorisation received to become a secondary device
      window.log.info(
        `Received pairing authorisation from ${primaryDevicePubKey}`
      );
      // Set current device as secondary.
      // This will ensure the authorisation is sent
      // along with each session request.
      window.storage.remove('secondaryDeviceStatus');
      window.storage.put('isSecondaryDevice', true);
      window.storage.put('primaryDevicePubKey', primaryDevicePubKey);
      await MultiDeviceProtocol.savePairingAuthorisation(
        pairingAuthorisation as Data.PairingAuthorisation
      );
      const primaryConversation = await ConversationController.getInstance().getOrCreateAndWait(
        primaryDevicePubKey,
        'private'
      );
      await primaryConversation.commit();
      Whisper.events.trigger('secondaryDeviceRegistration');
      // Update profile
      if (dataMessage) {
        const { profile, profileKey } = dataMessage;

        if (profile && profileKey) {
          const ourNumber = window.storage.get('primaryDevicePubKey');
          const me = ConversationController.getInstance().get(ourNumber);
          if (me) {
            await updateProfile(me, profile, profileKey);
          }
        } else {
          window.log.warn('profile or profileKey are missing in DataMessage');
        }
      }
    } else {
      window.log.warn('Unimplemented pairing authorisation message type');
    }
  }
  await removeFromCache(envelope);
}

function parseContacts(arrbuf: ArrayBuffer): Array<any> {
  const buffer = new ByteBuffer();
  buffer.append(arrbuf);
  buffer.offset = 0;
  buffer.limit = arrbuf.byteLength;

  const next = () => {
    try {
      if (buffer.limit === buffer.offset) {
        return undefined; // eof
      }
      const len = buffer.readInt32();
      const nextBuffer = buffer
        // tslint:disable-next-line restrict-plus-operands
        .slice(buffer.offset, buffer.offset + len)
        .toArrayBuffer();
      // TODO: de-dupe ByteBuffer.js includes in libaxo/libts
      // then remove this toArrayBuffer call.

      const proto: any = SignalService.ContactDetails.decode(
        new Uint8Array(nextBuffer)
      );

      if (proto.profileKey && proto.profileKey.length === 0) {
        proto.profileKey = null;
      }

      buffer.skip(len);

      if (proto.avatar) {
        const attachmentLen = proto.avatar.length;
        proto.avatar.data = buffer
          // tslint:disable-next-line restrict-plus-operands
          .slice(buffer.offset, buffer.offset + attachmentLen)
          .toArrayBuffer();
        buffer.skip(attachmentLen);
      }

      if (proto.profileKey) {
        proto.profileKey = proto.profileKey.buffer;
      }

      return proto;
    } catch (error) {
      window.log.error(
        'ProtoParser.next error:',
        error && error.stack ? error.stack : error
      );
    }

    return null;
  };

  const results = [];
  let contactDetails = next();

  while (contactDetails) {
    results.push(contactDetails);
    contactDetails = next();
  }

  return results;
}

export async function handleContacts(
  envelope: EnvelopePlus,
  contacts: SignalService.SyncMessage.IContacts
) {
  window.log.info('contact sync');
  // const { blob } = contacts;

  if (!contacts.data || contacts.data.length === 0) {
    window.log.error('Contacts without data');
    return;
  }

  const attachmentPointer = {
    contacts,
    data: ByteBuffer.wrap(contacts.data).toArrayBuffer(), // ByteBuffer to ArrayBuffer
  };

  const contactDetails = parseContacts(attachmentPointer.data);

  await Promise.all(
    contactDetails.map(async (cd: any) => onContactReceived(cd))
  );

  // Not sure it `contactsync` even does anything at the moment
  // const ev = new Event('contactsync');
  // results.push(this.dispatchAndWait(ev));

  window.log.info('handleContacts: finished');
  await removeFromCache(envelope);
}

// tslint:disable-next-line: max-func-body-length
async function onContactReceived(details: any) {
  const { storage, textsecure, libloki, Whisper } = window;
  const { Errors } = window.Signal.Types;

  const id = details.number;
  libloki.api.debug.logContactSync(
    'Got sync contact message with',
    id,
    ' details:',
    details
  );

  if (id === textsecure.storage.user.getNumber()) {
    // special case for syncing details about ourselves
    if (details.profileKey) {
      window.log.info('Got sync message with our own profile key');
      storage.put('profileKey', details.profileKey);
    }
  }

  const c = new Whisper.Conversation({ id });
  const validationError = c.validateNumber();
  if (validationError) {
    window.log.error(
      'Invalid contact received:',
      Errors.toLogFormat(validationError)
    );
    return;
  }

  try {
    const conversation = await ConversationController.getInstance().getOrCreateAndWait(
      id,
      'private'
    );
    let activeAt = conversation.get('active_at');

    // The idea is to make any new contact show up in the left pane. If
    //   activeAt is null, then this contact has been purposefully hidden.
    if (activeAt !== null) {
      activeAt = activeAt || Date.now();
      conversation.set('active_at', activeAt);
    }

    if (details.profileKey) {
      const profileKey = StringUtils.decode(details.profileKey, 'base64');
      void conversation.setProfileKey(profileKey);
    }

    if (details.name && details.name.length) {
      await conversation.setLokiProfile({ displayName: details.name });
    }

    if (details.nickname && details.nickname.length) {
      await conversation.setNickname(details.nickname);
    }

    // Update the conversation avatar only if new avatar exists and hash differs
    const { avatar } = details;
    if (avatar && avatar.data) {
      const newAttributes = await window.Signal.Types.Conversation.maybeUpdateAvatar(
        conversation.attributes,
        avatar.data,
        {
          // This is some crazy inderection...
          writeNewAttachmentData: window.Signal.writeNewAttachmentData,
          deleteAttachmentData: window.Signal.deleteAttachmentData,
        }
      );
      conversation.set(newAttributes);
    }
    await conversation.commit();
    const { expireTimer } = details;
    const isValidExpireTimer = typeof expireTimer === 'number';
    if (isValidExpireTimer) {
      const source = textsecure.storage.user.getNumber();
      const receivedAt = Date.now();

      await conversation.updateExpirationTimer(
        expireTimer,
        source,
        receivedAt,
        { fromSync: true }
      );
    }

    if (details.verified) {
      const { verified } = details;
      const verifiedEvent: any = {};
      verifiedEvent.verified = {
        state: verified.state,
        destination: verified.destination,
        identityKey: verified.identityKey.buffer,
      };
      verifiedEvent.viaContactSync = true;
      await onVerified(verifiedEvent);
    }

    const isBlocked = details.blocked || false;

    if (conversation.isPrivate()) {
      await BlockedNumberController.setBlocked(conversation.id, isBlocked);
    }

    await conversation.commit();
  } catch (error) {
    window.log.error('onContactReceived error:', Errors.toLogFormat(error));
  }
}
