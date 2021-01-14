import { getItemById } from '../../js/modules/data';
import { PrimaryPubKey } from '../session/types';
import { MultiDeviceProtocol } from '../session/protocols';
import { StringUtils } from '../session/utils';
import _ from 'lodash';


export type KeyPair = {
  pubKey: ArrayBuffer;
  privKey: ArrayBuffer;
};


export type HexKeyPair = {
  publicHex: string;
  privateHex: string;
};

/**
 * Returns the real public key of this device. We might be a primary or a secondary device.
 * If you want the primary, call getPrimary() instead.
 */
export async function getCurrentDevicePubKey(): Promise<string | undefined> {
  const item = await getItemById('number_id');
  if (!item || !item.value) {
    return undefined;
  }

  return item.value.split('.')[0];
}

/**
 * Returns our primary device pubkey.
 * If we are a secondary device, our primary PubKey won't be the same as our currentDevicePubKey
 */
export async function getPrimary(): Promise<PrimaryPubKey> {
  const ourNumber = (await getCurrentDevicePubKey()) as string;
  return MultiDeviceProtocol.getPrimaryDevice(ourNumber);
}

/**
 * This return the stored x25519 identity keypair for the current logged in user
 */
export async function getIdentityKeyPair(): Promise<KeyPair | undefined> {
  const item = await getItemById('identityKey');

  return item?.value;
}

export async function getUserED25519KeyPair(): Promise<HexKeyPair | undefined> {
  // 'identityKey' keeps the ed25519KeyPair under a ed25519KeyPair field.
  // it is only set if the user migrated to the ed25519 way of generating a key
  const item = await getItemById('identityKey');
  const ed25519KeyPair = item?.value?.ed25519KeyPair;
  if (ed25519KeyPair?.publicKey && ed25519KeyPair?.privateKey) {
    const pubKeyAsArray = _.map(ed25519KeyPair.publicKey, a => a);
    const privKeyAsArray = _.map(ed25519KeyPair.privateKey, a => a);
    return {
      publicHex: StringUtils.toHex(new Uint8Array(pubKeyAsArray)),
      privateHex: StringUtils.toHex(new Uint8Array(privKeyAsArray)),
    };
  }
  return undefined;
}
