import _ from 'underscore';
import { PubKey } from '../../session/types';
import { allowOnlyOneAtATime } from '../../session/utils/Promise';
import { fromBase64ToArrayBuffer, fromHex } from '../../session/utils/String';
import { updateDefaultRooms } from '../../state/ducks/defaultRooms';
import { getCompleteUrlFromRoom } from '../utils/OpenGroupUtils';
import { parseOpenGroupV2 } from './JoinOpenGroupV2';
import { getAllRoomInfos } from './OpenGroupAPIV2';
import { OpenGroupMessageV2 } from './OpenGroupMessageV2';

export type OpenGroupRequestCommonType = {
  serverUrl: string;
  roomId: string;
};

export type OpenGroupV2Request = {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  room: string;
  server: string;
  endpoint: string;
  // queryParams are used for post or get, but not the same way
  queryParams?: Record<string, any>;
  headers?: Record<string, string>;
  isAuthRequired: boolean;
  serverPublicKey?: string; // if not provided, a db called will be made to try to get it.
};

export type OpenGroupV2CompactPollRequest = {
  server: string;
  endpoint: string;
  body: string;
  serverPubKey: string;
};

export type OpenGroupV2Info = {
  id: string;
  name: string;
  imageId?: string;
};

export type OpenGroupV2InfoJoinable = OpenGroupV2Info & {
  completeUrl: string;
  base64Data?: string;
};

/**
 * Try to build an full url and check it for validity.
 * @returns null if the check failed. the built URL otherwise
 */
export const buildUrl = (request: OpenGroupV2Request): URL | null => {
  let rawURL = `${request.server}/${request.endpoint}`;
  if (request.method === 'GET') {
    const entries = Object.entries(request.queryParams || {});

    if (entries.length) {
      const queryString = entries.map(([key, value]) => `${key}=${value}`).join('&');
      rawURL += `?${queryString}`;
    }
  }
  // this just check that the URL is valid
  try {
    return new URL(`${rawURL}`);
  } catch (error) {
    return null;
  }
};

export const parseMessages = async (
  rawMessages: Array<Record<string, any>>
): Promise<Array<OpenGroupMessageV2>> => {
  if (!rawMessages) {
    window.log.info('no new messages');
    return [];
  }
  const messages = await Promise.all(
    rawMessages.map(async r => {
      try {
        const opengroupMessage = OpenGroupMessageV2.fromJson(r);
        if (
          !opengroupMessage?.serverId ||
          !opengroupMessage.sentTimestamp ||
          !opengroupMessage.base64EncodedData ||
          !opengroupMessage.base64EncodedSignature
        ) {
          window.log.warn('invalid open group message received');
          return null;
        }
        // Validate the message signature
        const senderPubKey = PubKey.cast(opengroupMessage.sender).withoutPrefix();
        const signature = fromBase64ToArrayBuffer(opengroupMessage.base64EncodedSignature);
        const messageData = fromBase64ToArrayBuffer(opengroupMessage.base64EncodedData);
        // throws if signature failed
        await window.libsignal.Curve.async.verifySignature(
          fromHex(senderPubKey),
          messageData,
          signature
        );
        return opengroupMessage;
      } catch (e) {
        window.log.error('An error happened while fetching getMessages output:', e);
        return null;
      }
    })
  );
  return _.compact(messages).sort((a, b) => (a.serverId || 0) - (b.serverId || 0));
};
// tslint:disable: no-http-string
const defaultServerUrl = 'http://116.203.70.33';
const defaultServerPublicKey = 'a03c383cf63c3c4efe67acc52112a6dd734b3a946b9545f488aaa93da7991238';
const defaultRoom = `${defaultServerUrl}/main?public_key=${defaultServerPublicKey}`;

const loadDefaultRoomsSingle = () =>
  allowOnlyOneAtATime(
    'loadDefaultRoomsSingle',
    async (): Promise<Array<OpenGroupV2InfoJoinable>> => {
      const roomInfos = parseOpenGroupV2(defaultRoom);
      if (roomInfos) {
        try {
          const roomsGot = await getAllRoomInfos(roomInfos);

          if (!roomsGot) {
            return [];
          }

          return roomsGot.map(room => {
            return {
              ...room,
              completeUrl: getCompleteUrlFromRoom({
                serverUrl: roomInfos.serverUrl,
                serverPublicKey: roomInfos.serverPublicKey,
                roomId: room.id,
              }),
            };
          });
        } catch (e) {
          window.log.warn('loadDefaultRoomloadDefaultRoomssIfNeeded failed', e);
        }
        return [];
      }
      return [];
    }
  );

/**
 * Load to the cache all the details of the room of the default opengroupv2 server
 * This call will only run once at a time.
 */
export const loadDefaultRooms = async () => {
  const allRooms: Array<OpenGroupV2InfoJoinable> = await loadDefaultRoomsSingle();
  if (allRooms !== undefined) {
    window.inboxStore?.dispatch(updateDefaultRooms(allRooms));
  }
};
