/* global
  window,
  libsignal,
  textsecure,
  StringView,
  Multibase,
  TextEncoder,
  TextDecoder,
  crypto,
  dcodeIO,
  libloki
*/

// eslint-disable-next-line func-names
(function() {
  window.libloki = window.libloki || {};


  const IV_LENGTH = 16;
  const NONCE_LENGTH = 12;


  async function deriveSymmetricKey(pubkey, seckey) {
    const ephemeralSecret = await libsignal.Curve.async.calculateAgreement(
      pubkey,
      seckey
    );

    const salt = window.Signal.Crypto.bytesFromString('LOKI');

    const key = await crypto.subtle.importKey(
      'raw',
      salt,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );
    const symmetricKey = await crypto.subtle.sign(
      { name: 'HMAC', hash: 'SHA-256' },
      key,
      ephemeralSecret
    );

    return symmetricKey;
  }

  async function encryptForPubkey(pubkeyX25519, payloadBytes) {
    const ephemeral = await libloki.crypto.generateEphemeralKeyPair();

    const snPubkey = StringView.hexToArrayBuffer(pubkeyX25519);

    const symmetricKey = await deriveSymmetricKey(snPubkey, ephemeral.privKey);

    const ciphertext = await EncryptGCM(symmetricKey, payloadBytes);

    return { ciphertext, symmetricKey, ephemeralKey: ephemeral.pubKey };
  }

  async function decryptForPubkey(seckeyX25519, ephemKey, ciphertext) {
    const symmetricKey = await deriveSymmetricKey(ephemKey, seckeyX25519);

    const plaintext = await DecryptGCM(symmetricKey, ciphertext);

    return plaintext;
  }

  async function EncryptGCM(symmetricKey, plaintext) {
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

    const key = await crypto.subtle.importKey(
      'raw',
      symmetricKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      key,
      plaintext
    );

    const ivAndCiphertext = new Uint8Array(
      NONCE_LENGTH + ciphertext.byteLength
    );

    ivAndCiphertext.set(nonce);
    ivAndCiphertext.set(new Uint8Array(ciphertext), nonce.byteLength);

    return ivAndCiphertext;
  }

  async function DecryptGCM(symmetricKey, ivAndCiphertext) {
    const nonce = ivAndCiphertext.slice(0, NONCE_LENGTH);
    const ciphertext = ivAndCiphertext.slice(NONCE_LENGTH);

    const key = await crypto.subtle.importKey(
      'raw',
      symmetricKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      ciphertext
    );
  }

  async function DHDecrypt(symmetricKey, ivAndCiphertext) {
    const iv = ivAndCiphertext.slice(0, IV_LENGTH);
    const ciphertext = ivAndCiphertext.slice(IV_LENGTH);
    return libsignal.crypto.decrypt(symmetricKey, ciphertext, iv);
  }


  const base32zIndex = Multibase.names.indexOf('base32z');
  const base32zCode = Multibase.codes[base32zIndex];

  function decodeSnodeAddressToPubKey(snodeAddress) {
    const snodeAddressClean = snodeAddress
      .replace('.snode', '')
      .replace('https://', '')
      .replace('http://', '');
    return Multibase.decode(`${base32zCode}${snodeAddressClean}`);
  }

  async function generateEphemeralKeyPair() {
    const keys = await libsignal.Curve.async.generateKeyPair();
    // Signal protocol prepends with "0x05"
    keys.pubKey = keys.pubKey.slice(1);
    return keys;
  }

  async function generateSignatureForPairing(secondaryPubKey, type) {
    const pubKeyArrayBuffer = StringView.hexToArrayBuffer(secondaryPubKey);
    // Make sure the signature includes the pairing action (pairing or unpairing)
    const len = pubKeyArrayBuffer.byteLength;
    const data = new Uint8Array(len + 1);
    data.set(new Uint8Array(pubKeyArrayBuffer), 0);
    data[len] = type;

    const myKeyPair = await window.libsession.Utils.UserUtil.getIdentityKeyPair();
    if (!myKeyPair) {
      throw new Error('Failed to get keypair for pairing signature generation');
    }
    const signature = await libsignal.Curve.async.calculateSignature(
      myKeyPair.privKey,
      data.buffer
    );
    return signature;
  }

  async function verifyAuthorisation(authorisation) {
    const {
      primaryDevicePubKey,
      secondaryDevicePubKey,
      requestSignature,
      grantSignature,
    } = authorisation;
    const isGrant = !!(grantSignature && grantSignature.length > 0);
    if (!primaryDevicePubKey || !secondaryDevicePubKey) {
      window.log.warn(
        'Received a pairing request with missing pubkeys. Ignored.'
      );
      return false;
    } else if (!requestSignature) {
      window.log.warn(
        'Received a pairing request with missing request signature. Ignored.'
      );
      return false;
    }
    const verify = async (signature, signatureType) => {
      const encoding = typeof signature === 'string' ? 'base64' : undefined;
      await this.verifyPairingSignature(
        primaryDevicePubKey,
        secondaryDevicePubKey,
        dcodeIO.ByteBuffer.wrap(signature, encoding).toArrayBuffer(),
        signatureType
      );
    };
    try {
      await verify(requestSignature, PairingType.REQUEST);
    } catch (e) {
      window.log.warn(
        'Could not verify pairing request authorisation signature. Ignoring message.'
      );
      window.log.error(e);
      return false;
    }
    // can't have grant without requestSignature?
    if (isGrant) {
      try {
        await verify(grantSignature, PairingType.GRANT);
      } catch (e) {
        window.log.warn(
          'Could not verify pairing grant authorisation signature. Ignoring message.'
        );
        window.log.error(e);
        return false;
      }
    }
    return true;
  }

  // FIXME: rename to include the fact it's relative to YOUR device
  async function validateAuthorisation(authorisation) {
    const {
      primaryDevicePubKey,
      secondaryDevicePubKey,
      grantSignature,
    } = authorisation;
    const alreadySecondaryDevice = !!window.storage.get('isSecondaryDevice');
    const ourPubKey = textsecure.storage.user.getNumber();
    const isRequest = !(grantSignature && grantSignature.length > 0);
    if (isRequest && alreadySecondaryDevice) {
      window.log.warn(
        'Received a pairing request while being a secondary device. Ignored.'
      );
      return false;
    } else if (isRequest && primaryDevicePubKey !== ourPubKey) {
      window.log.warn(
        'Received a pairing request addressed to another pubkey. Ignored.'
      );
      return false;
    } else if (isRequest && secondaryDevicePubKey === ourPubKey) {
      window.log.warn('Received a pairing request from ourselves. Ignored.');
      return false;
    }
    return this.verifyAuthorisation(authorisation);
  }

  async function verifyPairingSignature(
    primaryDevicePubKey,
    secondaryPubKey,
    signature,
    type
  ) {
    const secondaryPubKeyArrayBuffer = StringView.hexToArrayBuffer(
      secondaryPubKey
    );
    const primaryDevicePubKeyArrayBuffer = StringView.hexToArrayBuffer(
      primaryDevicePubKey
    );
    const len = secondaryPubKeyArrayBuffer.byteLength;
    const data = new Uint8Array(len + 1);
    // For REQUEST type message, the secondary device signs the primary device pubkey
    // For GRANT type message, the primary device signs the secondary device pubkey
    let issuer;
    if (type === PairingType.GRANT) {
      data.set(new Uint8Array(secondaryPubKeyArrayBuffer));
      issuer = primaryDevicePubKeyArrayBuffer;
    } else if (type === PairingType.REQUEST) {
      data.set(new Uint8Array(primaryDevicePubKeyArrayBuffer));
      issuer = secondaryPubKeyArrayBuffer;
    }
    data[len] = type;
    // Throws for invalid signature
    await libsignal.Curve.async.verifySignature(issuer, data.buffer, signature);
  }
  async function decryptToken({ cipherText64, serverPubKey64 }) {
    const ivAndCiphertext = new Uint8Array(
      dcodeIO.ByteBuffer.fromBase64(cipherText64).toArrayBuffer()
    );

    const serverPubKey = new Uint8Array(
      dcodeIO.ByteBuffer.fromBase64(serverPubKey64).toArrayBuffer()
    );
    const keyPair = await window.libsession.Utils.UserUtil.getIdentityKeyPair();
    if (!keyPair) {
      throw new Error('Failed to get keypair for token decryption');
    }
    const { privKey } = keyPair;
    const symmetricKey = await libsignal.Curve.async.calculateAgreement(
      serverPubKey,
      privKey
    );

    const token = await DHDecrypt(symmetricKey, ivAndCiphertext);

    const tokenString = dcodeIO.ByteBuffer.wrap(token).toString('utf8');
    return tokenString;
  }

  const sha512 = data => crypto.subtle.digest('SHA-512', data);

  const PairingType = Object.freeze({
    REQUEST: 1,
    GRANT: 2,
  });


  window.libloki.crypto = {
    EncryptGCM, // AES-GCM
    DHDecrypt,
    DecryptGCM, // AES-GCM
    decryptToken,
    generateSignatureForPairing,
    verifyAuthorisation,
    validateAuthorisation,
    verifyPairingSignature,
    PairingType,
    generateEphemeralKeyPair,
    encryptForPubkey,
    decryptForPubkey,
    _decodeSnodeAddressToPubKey: decodeSnodeAddressToPubKey,
    sha512,
  };
})();
