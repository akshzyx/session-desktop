import _ from 'lodash';
import { MessageUtils, ToastUtils, UserUtils } from '.';
import { getCallMediaPermissionsSettings } from '../../components/session/settings/SessionSettings';
import { getConversationById } from '../../data/data';
import { ConversationModel } from '../../models/conversation';
import { MessageModelType } from '../../models/messageType';
import { SignalService } from '../../protobuf';
import {
  answerCall,
  callConnected,
  endCall,
  incomingCall,
  openConversationWithMessages,
  setFullScreenCall,
  startingCallWith,
} from '../../state/ducks/conversations';
import { getConversationController } from '../conversations';
import { CallMessage } from '../messages/outgoing/controlMessage/CallMessage';
import { ed25519Str } from '../onions/onionPath';
import { getMessageQueue, MessageSender } from '../sending';
import { PubKey } from '../types';

import { v4 as uuidv4 } from 'uuid';
import { PnServer } from '../../pushnotification';
import { setIsRinging } from './RingingManager';

export type InputItem = { deviceId: string; label: string };

let currentCallUUID: string | undefined;

const rejectedCallUUIDS: Set<string> = new Set();

export type CallManagerOptionsType = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  camerasList: Array<InputItem>;
  audioInputsList: Array<InputItem>;
  audioOutputsList: Array<InputItem>;
  isLocalVideoStreamMuted: boolean;
  isRemoteVideoStreamMuted: boolean;
  isAudioMuted: boolean;
  currentSelectedAudioOutput: string;
};

export type CallManagerListener = ((options: CallManagerOptionsType) => void) | null;
const videoEventsListeners: Array<{ id: string; listener: CallManagerListener }> = [];

function callVideoListeners() {
  if (videoEventsListeners.length) {
    videoEventsListeners.forEach(item => {
      item.listener?.({
        localStream: mediaDevices,
        remoteStream,
        camerasList,
        audioInputsList,
        audioOutputsList,
        isRemoteVideoStreamMuted: remoteVideoStreamIsMuted,
        isLocalVideoStreamMuted: selectedCameraId === DEVICE_DISABLED_DEVICE_ID,
        isAudioMuted: selectedAudioInputId === DEVICE_DISABLED_DEVICE_ID,
        currentSelectedAudioOutput: selectedAudioOutputId,
      });
    });
  }
}

export function addVideoEventsListener(uniqueId: string, listener: CallManagerListener) {
  const indexFound = videoEventsListeners.findIndex(m => m.id === uniqueId);
  if (indexFound === -1) {
    videoEventsListeners.push({ id: uniqueId, listener });
  } else {
    videoEventsListeners[indexFound].listener = listener;
  }
  callVideoListeners();
}

export function removeVideoEventsListener(uniqueId: string) {
  const indexFound = videoEventsListeners.findIndex(m => m.id === uniqueId);
  if (indexFound !== -1) {
    videoEventsListeners.splice(indexFound);
  }
  callVideoListeners();
}

/**
 * This field stores all the details received about a specific call with the same uuid. It is a per pubkey and per call cache.
 */
const callCache = new Map<string, Map<string, Array<SignalService.CallMessage>>>();

let peerConnection: RTCPeerConnection | null;
let dataChannel: RTCDataChannel | null;
let remoteStream: MediaStream | null;
let mediaDevices: MediaStream | null;
let remoteVideoStreamIsMuted = true;

export const DEVICE_DISABLED_DEVICE_ID = 'off';

let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
let lastOutgoingOfferTimestamp = -Infinity;

const configuration: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceServers: [
    {
      urls: 'turn:freyr.getsession.org',
      username: 'session',
      credential: 'session',
    },
  ],
  // iceTransportPolicy: 'relay', // for now, this cause the connection to break after 30-40 sec if we enable this
};

let selectedCameraId: string = DEVICE_DISABLED_DEVICE_ID;
let selectedAudioInputId: string = DEVICE_DISABLED_DEVICE_ID;
let selectedAudioOutputId: string = DEVICE_DISABLED_DEVICE_ID;
let camerasList: Array<InputItem> = [];
let audioInputsList: Array<InputItem> = [];
let audioOutputsList: Array<InputItem> = [];

async function getConnectedDevices(type: 'videoinput' | 'audioinput' | 'audiooutput') {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(device => device.kind === type);
}

// Listen for changes to media devices and update the list accordingly
// tslint:disable-next-line: no-typeof-undefined
if (typeof navigator !== 'undefined') {
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    await updateConnectedDevices();
    callVideoListeners();
  });
}

async function updateConnectedDevices() {
  // Get the set of cameras connected
  const videoCameras = await getConnectedDevices('videoinput');

  camerasList = videoCameras.map(m => ({
    deviceId: m.deviceId,
    label: m.label,
  }));

  // Get the set of audio inputs connected
  const audiosInput = await getConnectedDevices('audioinput');
  audioInputsList = audiosInput.map(m => ({
    deviceId: m.deviceId,
    label: m.label,
  }));

  // Get the set of audio outputs connected
  const audiosOutput = await getConnectedDevices('audiooutput');
  audioOutputsList = audiosOutput.map(m => ({
    deviceId: m.deviceId,
    label: m.label,
  }));
}

function sendVideoStatusViaDataChannel() {
  const videoEnabledLocally = selectedCameraId !== DEVICE_DISABLED_DEVICE_ID;
  const stringToSend = JSON.stringify({
    video: videoEnabledLocally,
  });
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel?.send(stringToSend);
  }
}

function sendHangupViaDataChannel() {
  const stringToSend = JSON.stringify({
    hangup: true,
  });
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel?.send(stringToSend);
  }
}

export async function selectCameraByDeviceId(cameraDeviceId: string) {
  if (cameraDeviceId === DEVICE_DISABLED_DEVICE_ID) {
    selectedCameraId = DEVICE_DISABLED_DEVICE_ID;

    const sender = peerConnection?.getSenders().find(s => {
      return s.track?.kind === 'video';
    });
    if (sender?.track) {
      sender.track.enabled = false;
    }
    sendVideoStatusViaDataChannel();
    callVideoListeners();
    return;
  }
  if (camerasList.some(m => m.deviceId === cameraDeviceId)) {
    selectedCameraId = cameraDeviceId;

    const devicesConfig = {
      video: {
        deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
      },
    };

    try {
      const newVideoStream = await navigator.mediaDevices.getUserMedia(devicesConfig);
      const videoTrack = newVideoStream.getVideoTracks()[0];
      if (!peerConnection) {
        throw new Error('cannot selectCameraByDeviceId without a peer connection');
      }
      let sender = peerConnection.getSenders().find(s => {
        return s.track?.kind === videoTrack.kind;
      });

      // video might be completely off
      if (!sender) {
        peerConnection.addTrack(videoTrack);
      }
      sender = peerConnection.getSenders().find(s => {
        return s.track?.kind === videoTrack.kind;
      });
      if (sender) {
        await sender.replaceTrack(videoTrack);
        videoTrack.enabled = true;
        mediaDevices?.getVideoTracks().forEach(t => {
          t.stop();
          mediaDevices?.removeTrack(t);
        });
        mediaDevices?.addTrack(videoTrack);

        sendVideoStatusViaDataChannel();
        callVideoListeners();
      }
    } catch (e) {
      window.log.warn('selectCameraByDeviceId failed with', e.message);
      callVideoListeners();
    }
  }
}

export async function selectAudioInputByDeviceId(audioInputDeviceId: string) {
  if (audioInputDeviceId === DEVICE_DISABLED_DEVICE_ID) {
    selectedAudioInputId = audioInputDeviceId;

    const sender = peerConnection?.getSenders().find(s => {
      return s.track?.kind === 'audio';
    });
    if (sender?.track) {
      sender.track.enabled = false;
    }
    callVideoListeners();
    return;
  }
  if (audioInputsList.some(m => m.deviceId === audioInputDeviceId)) {
    selectedAudioInputId = audioInputDeviceId;

    const devicesConfig = {
      audio: {
        deviceId: selectedAudioInputId ? { exact: selectedAudioInputId } : undefined,
      },
    };

    try {
      const newAudioStream = await navigator.mediaDevices.getUserMedia(devicesConfig);
      const audioTrack = newAudioStream.getAudioTracks()[0];
      if (!peerConnection) {
        throw new Error('cannot selectAudioInputByDeviceId without a peer connection');
      }
      const sender = peerConnection.getSenders().find(s => {
        return s.track?.kind === audioTrack.kind;
      });

      if (sender) {
        await sender.replaceTrack(audioTrack);
        // we actually do not need to toggle the track here, as toggling it here unmuted here locally (so we start to hear ourselves)
      } else {
        throw new Error('Failed to get sender for selectAudioInputByDeviceId ');
      }
    } catch (e) {
      window.log.warn('selectAudioInputByDeviceId failed with', e.message);
    }

    callVideoListeners();
  }
}

export async function selectAudioOutputByDeviceId(audioOutputDeviceId: string) {
  if (audioOutputDeviceId === DEVICE_DISABLED_DEVICE_ID) {
    selectedAudioOutputId = audioOutputDeviceId;

    callVideoListeners();
    return;
  }
  if (audioOutputsList.some(m => m.deviceId === audioOutputDeviceId)) {
    selectedAudioOutputId = audioOutputDeviceId;

    callVideoListeners();
  }
}

async function handleNegotiationNeededEvent(recipient: string) {
  try {
    makingOffer = true;
    window.log.info('got handleNegotiationNeeded event. creating offer');
    const offer = await peerConnection?.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    if (!offer) {
      throw new Error('Could not create an offer');
    }
    await peerConnection?.setLocalDescription(offer);

    if (!currentCallUUID) {
      window.log.warn('cannot send offer without a currentCallUUID');
      throw new Error('cannot send offer without a currentCallUUID');
    }

    if (offer && offer.sdp) {
      const offerMessage = new CallMessage({
        timestamp: Date.now(),
        type: SignalService.CallMessage.Type.OFFER,
        sdps: [offer.sdp],
        uuid: currentCallUUID,
      });

      window.log.info(`sending OFFER MESSAGE with callUUID: ${currentCallUUID}`);
      const negotationOfferSendResult = await getMessageQueue().sendToPubKeyNonDurably(
        PubKey.cast(recipient),
        offerMessage
      );
      if (typeof negotationOfferSendResult === 'number') {
        // window.log?.warn('setting last sent timestamp');
        lastOutgoingOfferTimestamp = negotationOfferSendResult;
      }
    }
  } catch (err) {
    window.log?.error(`Error on handling negotiation needed ${err}`);
  } finally {
    makingOffer = false;
  }
}

function handleIceCandidates(event: RTCPeerConnectionIceEvent, pubkey: string) {
  if (event.candidate) {
    iceCandidates.push(event.candidate);
    void iceSenderDebouncer(pubkey);
  }
}

async function openMediaDevicesAndAddTracks() {
  try {
    await updateConnectedDevices();

    if (!audioInputsList.length) {
      ToastUtils.pushNoAudioInputFound();
      return;
    }

    selectedAudioInputId = audioInputsList[0].deviceId;
    selectedCameraId = DEVICE_DISABLED_DEVICE_ID;
    window.log.info(
      `openMediaDevices videoDevice:${selectedCameraId} audioDevice:${selectedAudioInputId}`
    );

    const devicesConfig = {
      audio: {
        deviceId: { exact: selectedAudioInputId },

        echoCancellation: true,
      },
      // we don't need a video stream on start
      video: false,
    };

    mediaDevices = await navigator.mediaDevices.getUserMedia(devicesConfig);
    mediaDevices.getTracks().map(track => {
      // if (track.kind === 'video') {
      //   track.enabled = false;
      // }
      if (mediaDevices) {
        peerConnection?.addTrack(track, mediaDevices);
      }
    });
  } catch (err) {
    window.log.warn('openMediaDevices: ', err);
    ToastUtils.pushVideoCallPermissionNeeded();
    await closeVideoCall();
  }
  callVideoListeners();
}

// tslint:disable-next-line: function-name
export async function USER_callRecipient(recipient: string) {
  if (!getCallMediaPermissionsSettings()) {
    ToastUtils.pushVideoCallPermissionNeeded();
    return;
  }
  if (currentCallUUID) {
    window.log.warn(
      'Looks like we are already in a call as in USER_callRecipient is not undefined'
    );
    return;
  }
  await updateConnectedDevices();
  window?.log?.info(`starting call with ${ed25519Str(recipient)}..`);
  window.inboxStore?.dispatch(startingCallWith({ pubkey: recipient }));
  if (peerConnection) {
    throw new Error('USER_callRecipient peerConnection is already initialized ');
  }
  currentCallUUID = uuidv4();
  peerConnection = createOrGetPeerConnection(recipient);
  // send a pre offer just to wake up the device on the remote side
  const preOfferMsg = new CallMessage({
    timestamp: Date.now(),
    type: SignalService.CallMessage.Type.PRE_OFFER,
    uuid: currentCallUUID,
  });

  window.log.info('Sending preOffer message to ', ed25519Str(recipient));

  // we do it manually as the sendToPubkeyNonDurably rely on having a message saved to the db for MessageSentSuccess
  // which is not the case for a pre offer message (the message only exists in memory)
  const rawMessage = await MessageUtils.toRawMessage(PubKey.cast(recipient), preOfferMsg);
  const { wrappedEnvelope } = await MessageSender.send(rawMessage);
  void PnServer.notifyPnServer(wrappedEnvelope, recipient);

  await openMediaDevicesAndAddTracks();
  setIsRinging(true);
}

const iceCandidates: Array<RTCIceCandidate> = new Array();
const iceSenderDebouncer = _.debounce(async (recipient: string) => {
  if (!iceCandidates) {
    return;
  }
  const validCandidates = _.compact(
    iceCandidates.map(c => {
      if (
        c.sdpMLineIndex !== null &&
        c.sdpMLineIndex !== undefined &&
        c.sdpMid !== null &&
        c.candidate
      ) {
        return {
          sdpMLineIndex: c.sdpMLineIndex,
          sdpMid: c.sdpMid,
          candidate: c.candidate,
        };
      }
      return null;
    })
  );
  if (!currentCallUUID) {
    window.log.warn('Cannot send ice candidates without a currentCallUUID');
    return;
  }
  const callIceCandicates = new CallMessage({
    timestamp: Date.now(),
    type: SignalService.CallMessage.Type.ICE_CANDIDATES,
    sdpMLineIndexes: validCandidates.map(c => c.sdpMLineIndex),
    sdpMids: validCandidates.map(c => c.sdpMid),
    sdps: validCandidates.map(c => c.candidate),
    uuid: currentCallUUID,
  });

  window.log.info(
    `sending ICE CANDIDATES MESSAGE to ${ed25519Str(recipient)} about call ${currentCallUUID}`
  );

  await getMessageQueue().sendToPubKeyNonDurably(PubKey.cast(recipient), callIceCandicates);
}, 2000);

const findLastMessageTypeFromSender = (sender: string, msgType: SignalService.CallMessage.Type) => {
  const msgCacheFromSenderWithDevices = callCache.get(sender);
  if (!msgCacheFromSenderWithDevices) {
    return undefined;
  }

  // FIXME this does not sort by timestamp as we do not have a timestamp stored in the SignalService.CallMessage object...
  const allMsg = _.flattenDeep([...msgCacheFromSenderWithDevices.values()]);
  const allMsgFromType = allMsg.filter(m => m.type === msgType);
  const lastMessageOfType = _.last(allMsgFromType);

  if (!lastMessageOfType) {
    return undefined;
  }
  return lastMessageOfType;
};

function handleSignalingStateChangeEvent() {
  if (peerConnection?.signalingState === 'closed') {
    void closeVideoCall();
  }
}

function handleConnectionStateChanged(pubkey: string) {
  window.log.info('handleConnectionStateChanged :', peerConnection?.connectionState);

  if (peerConnection?.signalingState === 'closed' || peerConnection?.connectionState === 'failed') {
    void closeVideoCall();
  } else if (peerConnection?.connectionState === 'connected') {
    setIsRinging(false);
    window.inboxStore?.dispatch(callConnected({ pubkey }));
  }
}

async function closeVideoCall() {
  window.log.info('closingVideoCall ');
  setIsRinging(false);
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.onsignalingstatechange = null;
    peerConnection.onicegatheringstatechange = null;
    peerConnection.onnegotiationneeded = null;

    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (mediaDevices) {
      mediaDevices.getTracks().forEach(track => {
        track.stop();
      });
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        remoteStream?.removeTrack(track);
      });
    }

    peerConnection.close();
    peerConnection = null;
  }

  mediaDevices = null;
  remoteStream = null;
  selectedCameraId = DEVICE_DISABLED_DEVICE_ID;
  selectedAudioInputId = DEVICE_DISABLED_DEVICE_ID;
  currentCallUUID = undefined;

  window.inboxStore?.dispatch(setFullScreenCall(false));
  const convos = getConversationController().getConversations();
  const callingConvos = convos.filter(convo => convo.callState !== undefined);
  if (callingConvos.length > 0) {
    // reset all convos callState
    await Promise.all(
      callingConvos.map(async m => {
        m.callState = undefined;
        await m.commit();
      })
    );
  }

  remoteVideoStreamIsMuted = true;

  makingOffer = false;
  ignoreOffer = false;
  isSettingRemoteAnswerPending = false;
  lastOutgoingOfferTimestamp = -Infinity;
  callVideoListeners();
}

function onDataChannelReceivedMessage(ev: MessageEvent<string>) {
  try {
    const parsed = JSON.parse(ev.data);

    if (parsed.hangup !== undefined) {
      const foundEntry = getConversationController()
        .getConversations()
        .find(
          (convo: ConversationModel) =>
            convo.callState === 'connecting' ||
            convo.callState === 'offering' ||
            convo.callState === 'ongoing'
        );

      if (!foundEntry || !foundEntry.id) {
        return;
      }
      handleCallTypeEndCall(foundEntry.id, currentCallUUID);

      return;
    }

    if (parsed.video !== undefined) {
      remoteVideoStreamIsMuted = !Boolean(parsed.video);
    }
  } catch (e) {
    window.log.warn('onDataChannelReceivedMessage Could not parse data in event', ev);
  }
  callVideoListeners();
}
function onDataChannelOnOpen() {
  window.log.info('onDataChannelOnOpen: sending video status');
  setIsRinging(false);
  sendVideoStatusViaDataChannel();
}

function createOrGetPeerConnection(withPubkey: string, isAcceptingCall = false) {
  if (peerConnection) {
    return peerConnection;
  }
  remoteStream = new MediaStream();
  peerConnection = new RTCPeerConnection(configuration);
  dataChannel = peerConnection.createDataChannel('session-datachannel', {
    ordered: true,
    negotiated: true,
    id: 548, // S E S S I O N in ascii code 83*3+69+73+79+78
  });

  dataChannel.onmessage = onDataChannelReceivedMessage;
  dataChannel.onopen = onDataChannelOnOpen;

  if (!isAcceptingCall) {
    peerConnection.onnegotiationneeded = async () => {
      await handleNegotiationNeededEvent(withPubkey);
    };
  }

  peerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;

  peerConnection.ontrack = event => {
    event.track.onunmute = () => {
      remoteStream?.addTrack(event.track);
      callVideoListeners();
    };
    event.track.onmute = () => {
      remoteStream?.removeTrack(event.track);
      callVideoListeners();
    };
  };
  peerConnection.onconnectionstatechange = () => {
    handleConnectionStateChanged(withPubkey);
  };

  peerConnection.onicecandidate = event => {
    handleIceCandidates(event, withPubkey);
  };

  peerConnection.oniceconnectionstatechange = () => {
    window.log.info(
      'oniceconnectionstatechange peerConnection.iceConnectionState: ',
      peerConnection?.iceConnectionState
    );

    if (peerConnection && peerConnection?.iceConnectionState === 'disconnected') {
      //this will trigger a negotation event with iceRestart set to true in the createOffer options set
      global.setTimeout(() => {
        window.log.info('onconnectionstatechange disconnected: restartIce()');

        if (peerConnection?.iceConnectionState === 'disconnected') {
          (peerConnection as any).restartIce();
        }
      }, 2000);
    }
  };

  return peerConnection;
}

// tslint:disable-next-line: function-name
export async function USER_acceptIncomingCallRequest(fromSender: string) {
  window.log.info('USER_acceptIncomingCallRequest');
  setIsRinging(false);
  if (currentCallUUID) {
    window.log.warn(
      'Looks like we are already in a call as in USER_acceptIncomingCallRequest is not undefined'
    );
    return;
  }
  await updateConnectedDevices();

  const lastOfferMessage = findLastMessageTypeFromSender(
    fromSender,
    SignalService.CallMessage.Type.OFFER
  );

  if (!lastOfferMessage) {
    window?.log?.info(
      'incoming call request cannot be accepted as the corresponding message is not found'
    );
    return;
  }
  if (!lastOfferMessage.uuid) {
    window?.log?.info('incoming call request cannot be accepted as uuid is invalid');
    return;
  }
  window.inboxStore?.dispatch(answerCall({ pubkey: fromSender }));
  await openConversationWithMessages({ conversationKey: fromSender });
  if (peerConnection) {
    throw new Error('USER_acceptIncomingCallRequest: peerConnection is already set.');
  }
  currentCallUUID = lastOfferMessage.uuid;

  peerConnection = createOrGetPeerConnection(fromSender, true);

  await openMediaDevicesAndAddTracks();

  const { sdps } = lastOfferMessage;
  if (!sdps || sdps.length === 0) {
    window?.log?.info(
      'incoming call request cannot be accepted as the corresponding sdps is empty'
    );
    return;
  }
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({ sdp: sdps[0], type: 'offer' })
    );
  } catch (e) {
    window.log?.error(`Error setting RTC Session Description ${e}`);
  }

  const lastCandidatesFromSender = findLastMessageTypeFromSender(
    fromSender,
    SignalService.CallMessage.Type.ICE_CANDIDATES
  );

  if (lastCandidatesFromSender) {
    window.log.info('found sender ice candicate message already sent. Using it');
    for (let index = 0; index < lastCandidatesFromSender.sdps.length; index++) {
      const sdp = lastCandidatesFromSender.sdps[index];
      const sdpMLineIndex = lastCandidatesFromSender.sdpMLineIndexes[index];
      const sdpMid = lastCandidatesFromSender.sdpMids[index];
      const candicate = new RTCIceCandidate({ sdpMid, sdpMLineIndex, candidate: sdp });
      await peerConnection.addIceCandidate(candicate);
    }
  }
  await buildAnswerAndSendIt(fromSender);
}

// tslint:disable-next-line: function-name
export async function USER_rejectIncomingCallRequest(fromSender: string, forcedUUID?: string) {
  setIsRinging(false);

  const lastOfferMessage = findLastMessageTypeFromSender(
    fromSender,
    SignalService.CallMessage.Type.OFFER
  );

  const aboutCallUUID = forcedUUID || lastOfferMessage?.uuid;
  window.log.info(`USER_rejectIncomingCallRequest ${ed25519Str(fromSender)}: ${aboutCallUUID}`);
  if (aboutCallUUID) {
    rejectedCallUUIDS.add(aboutCallUUID);
    const endCallMessage = new CallMessage({
      type: SignalService.CallMessage.Type.END_CALL,
      timestamp: Date.now(),
      uuid: aboutCallUUID,
    });
    await getMessageQueue().sendToPubKeyNonDurably(PubKey.cast(fromSender), endCallMessage);

    // delete all msg not from that uuid only but from that sender pubkey
    clearCallCacheFromPubkeyAndUUID(fromSender, aboutCallUUID);
  }

  // if we got a forceUUID, it means we just to deny another user's device incoming call we are already in a call with.
  if (!forcedUUID) {
    window.inboxStore?.dispatch(
      endCall({
        pubkey: fromSender,
      })
    );

    const convos = getConversationController().getConversations();
    const callingConvos = convos.filter(convo => convo.callState !== undefined);
    if (callingConvos.length > 0) {
      // we just got a new offer from someone we are already in a call with
      if (callingConvos.length === 1 && callingConvos[0].id === fromSender) {
        await closeVideoCall();
      }
    }
  }
}

// tslint:disable-next-line: function-name
export async function USER_hangup(fromSender: string) {
  window.log.info('USER_hangup');

  if (!currentCallUUID) {
    window.log.warn('should not be able to hangup without a currentCallUUID');
    return;
  } else {
    rejectedCallUUIDS.add(currentCallUUID);
    const endCallMessage = new CallMessage({
      type: SignalService.CallMessage.Type.END_CALL,
      timestamp: Date.now(),
      uuid: currentCallUUID,
    });
    void getMessageQueue().sendToPubKeyNonDurably(PubKey.cast(fromSender), endCallMessage);
  }

  window.inboxStore?.dispatch(endCall({ pubkey: fromSender }));
  window.log.info('sending hangup with an END_CALL MESSAGE');

  sendHangupViaDataChannel();

  clearCallCacheFromPubkeyAndUUID(fromSender, currentCallUUID);

  await closeVideoCall();
}

export function handleCallTypeEndCall(sender: string, aboutCallUUID?: string) {
  window.log.info('handling callMessage END_CALL:', aboutCallUUID);

  if (aboutCallUUID) {
    rejectedCallUUIDS.add(aboutCallUUID);

    clearCallCacheFromPubkeyAndUUID(sender, aboutCallUUID);

    if (aboutCallUUID === currentCallUUID) {
      void closeVideoCall();

      window.inboxStore?.dispatch(endCall({ pubkey: sender }));
    }
  }
}

async function buildAnswerAndSendIt(sender: string) {
  if (peerConnection) {
    if (!currentCallUUID) {
      window.log.warn('cannot send answer without a currentCallUUID');
      return;
    }

    const answer = await peerConnection.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    if (!answer?.sdp || answer.sdp.length === 0) {
      window.log.warn('failed to create answer');
      return;
    }
    await peerConnection.setLocalDescription(answer);
    const answerSdp = answer.sdp;
    const callAnswerMessage = new CallMessage({
      timestamp: Date.now(),
      type: SignalService.CallMessage.Type.ANSWER,
      sdps: [answerSdp],
      uuid: currentCallUUID,
    });

    window.log.info('sending ANSWER MESSAGE');

    await getMessageQueue().sendToPubKeyNonDurably(PubKey.cast(sender), callAnswerMessage);
    await getMessageQueue().sendToPubKeyNonDurably(
      UserUtils.getOurPubKeyFromCache(),
      callAnswerMessage
    );
  }
}

export function isCallRejected(uuid: string) {
  return rejectedCallUUIDS.has(uuid);
}

export async function handleCallTypeOffer(
  sender: string,
  callMessage: SignalService.CallMessage,
  incomingOfferTimestamp: number
) {
  try {
    const remoteCallUUID = callMessage.uuid;
    if (!remoteCallUUID || remoteCallUUID.length === 0) {
      throw new Error('incoming offer call has no valid uuid');
    }
    window.log.info('handling callMessage OFFER with uuid: ', remoteCallUUID);

    if (!getCallMediaPermissionsSettings()) {
      await handleMissedCall(sender, incomingOfferTimestamp, true);
      return;
    }

    if (currentCallUUID && currentCallUUID !== remoteCallUUID) {
      // we just got a new offer with a different callUUID. this is a missed call (from either the same sender or another one)
      if (callCache.get(sender)?.has(currentCallUUID)) {
        // this is a missed call from the same sender (another call from another device maybe?)
        // just reject it.
        await USER_rejectIncomingCallRequest(sender, remoteCallUUID);
        return;
      }
      await handleMissedCall(sender, incomingOfferTimestamp, false);

      return;
    }

    const readyForOffer =
      !makingOffer && (peerConnection?.signalingState === 'stable' || isSettingRemoteAnswerPending);
    const polite = lastOutgoingOfferTimestamp < incomingOfferTimestamp;
    const offerCollision = !readyForOffer;

    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) {
      window.log?.warn('Received offer when unready for offer; Ignoring offer.');
      return;
    }

    if (remoteCallUUID === currentCallUUID && currentCallUUID) {
      window.log.info('Got a new offer message from our ongoing call');
      isSettingRemoteAnswerPending = false;
      const remoteDesc = new RTCSessionDescription({
        type: 'offer',
        sdp: callMessage.sdps[0],
      });
      isSettingRemoteAnswerPending = false;
      if (peerConnection) {
        await peerConnection.setRemoteDescription(remoteDesc); // SRD rolls back as needed
        await buildAnswerAndSendIt(sender);
      }
    } else {
      window.inboxStore?.dispatch(incomingCall({ pubkey: sender }));

      // show a notification
      const callerConvo = getConversationController().get(sender);
      const convNotif = callerConvo?.get('triggerNotificationsFor') || 'disabled';
      if (convNotif === 'disabled') {
        window?.log?.info('notifications disabled for convo', ed25519Str(sender));
      } else if (callerConvo) {
        await callerConvo.notifyIncomingCall();
      }
      setIsRinging(true);
    }

    pushCallMessageToCallCache(sender, remoteCallUUID, callMessage);
  } catch (err) {
    window.log?.error(`Error handling offer message ${err}`);
  }
}

export async function handleMissedCall(
  sender: string,
  incomingOfferTimestamp: number,
  isBecauseOfCallPermission: boolean
) {
  const incomingCallConversation = await getConversationById(sender);
  setIsRinging(false);
  if (!isBecauseOfCallPermission) {
    ToastUtils.pushedMissedCall(
      incomingCallConversation?.getNickname() ||
        incomingCallConversation?.getProfileName() ||
        'Unknown'
    );
  } else {
    ToastUtils.pushedMissedCallCauseOfPermission(
      incomingCallConversation?.getNickname() ||
        incomingCallConversation?.getProfileName() ||
        'Unknown'
    );
  }

  await incomingCallConversation?.addSingleMessage({
    conversationId: incomingCallConversation.id,
    source: sender,
    type: 'incoming' as MessageModelType,
    sent_at: incomingOfferTimestamp,
    received_at: Date.now(),
    expireTimer: 0,
    isMissedCall: true,
    unread: 1,
  });
  incomingCallConversation?.updateLastMessage();

  return;
}

export async function handleCallTypeAnswer(sender: string, callMessage: SignalService.CallMessage) {
  if (!callMessage.sdps || callMessage.sdps.length === 0) {
    window.log.warn('cannot handle answered message without signal description protols');
    return;
  }
  const remoteCallUUID = callMessage.uuid;
  if (!remoteCallUUID || remoteCallUUID.length === 0) {
    window.log.warn('handleCallTypeAnswer has no valid uuid');
    return;
  }

  // this is an answer we sent to ourself, this must be about another of our device accepting an incoming call
  // if we accepted that call already from the current device, currentCallUUID is set
  if (sender === UserUtils.getOurPubKeyStrFromCache() && remoteCallUUID !== currentCallUUID) {
    window.log.info(`handling callMessage ANSWER from ourself about call ${remoteCallUUID}`);

    let foundOwnerOfCallUUID: string | undefined;
    for (const deviceKey of callCache.keys()) {
      if (foundOwnerOfCallUUID) {
        break;
      }
      for (const callUUIDEntry of callCache.get(deviceKey) as Map<
        string,
        Array<SignalService.CallMessage>
      >) {
        if (callUUIDEntry[0] === remoteCallUUID) {
          foundOwnerOfCallUUID = deviceKey;
          break;
        }
      }
    }

    if (foundOwnerOfCallUUID) {
      rejectedCallUUIDS.add(remoteCallUUID);

      const convos = getConversationController().getConversations();
      const callingConvos = convos.filter(convo => convo.callState !== undefined);
      if (callingConvos.length > 0) {
        // we just got a new offer from someone we are already in a call with
        if (callingConvos.length === 1 && callingConvos[0].id === foundOwnerOfCallUUID) {
          await closeVideoCall();
        }
      }
      window.inboxStore?.dispatch(
        endCall({
          pubkey: foundOwnerOfCallUUID,
        })
      );
      return;
    }
  } else {
    window.log.info(`handling callMessage ANSWER from ${remoteCallUUID}`);
  }

  pushCallMessageToCallCache(sender, remoteCallUUID, callMessage);

  if (!peerConnection) {
    window.log.info('handleCallTypeAnswer without peer connection. Dropping');
    return;
  }
  window.inboxStore?.dispatch(
    answerCall({
      pubkey: sender,
    })
  );
  const remoteDesc = new RTCSessionDescription({
    type: 'answer',
    sdp: callMessage.sdps[0],
  });

  // window.log?.info('Setting remote answer pending');
  isSettingRemoteAnswerPending = true;
  await peerConnection?.setRemoteDescription(remoteDesc); // SRD rolls back as needed
  isSettingRemoteAnswerPending = false;
}

export async function handleCallTypeIceCandidates(
  sender: string,
  callMessage: SignalService.CallMessage
) {
  if (!callMessage.sdps || callMessage.sdps.length === 0) {
    window.log.warn('cannot handle iceCandicates message without candidates');
    return;
  }
  const remoteCallUUID = callMessage.uuid;
  if (!remoteCallUUID || remoteCallUUID.length === 0) {
    window.log.warn('handleCallTypeIceCandidates has no valid uuid');
    return;
  }
  window.log.info('handling callMessage ICE_CANDIDATES');

  pushCallMessageToCallCache(sender, remoteCallUUID, callMessage);
  if (currentCallUUID && callMessage.uuid === currentCallUUID) {
    await addIceCandidateToExistingPeerConnection(callMessage);
  }
}

async function addIceCandidateToExistingPeerConnection(callMessage: SignalService.CallMessage) {
  if (peerConnection) {
    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < callMessage.sdps.length; index++) {
      const sdp = callMessage.sdps[index];
      const sdpMLineIndex = callMessage.sdpMLineIndexes[index];
      const sdpMid = callMessage.sdpMids[index];
      const candicate = new RTCIceCandidate({ sdpMid, sdpMLineIndex, candidate: sdp });
      try {
        await peerConnection.addIceCandidate(candicate);
      } catch (err) {
        if (!ignoreOffer) {
          window.log?.warn('Error handling ICE candidates message', err);
        }
      }
    }
  } else {
    window.log.info('handleIceCandidatesMessage but we do not have a peerconnection set');
  }
}

// tslint:disable-next-line: no-async-without-await
export async function handleOtherCallTypes(sender: string, callMessage: SignalService.CallMessage) {
  const remoteCallUUID = callMessage.uuid;
  if (!remoteCallUUID || remoteCallUUID.length === 0) {
    window.log.warn('handleOtherCallTypes has no valid uuid');
    return;
  }
  pushCallMessageToCallCache(sender, remoteCallUUID, callMessage);
}

function clearCallCacheFromPubkeyAndUUID(sender: string, callUUID: string) {
  callCache.get(sender)?.delete(callUUID);
}

function createCallCacheForPubkeyAndUUID(sender: string, uuid: string) {
  if (!callCache.has(sender)) {
    callCache.set(sender, new Map());
  }

  if (!callCache.get(sender)?.has(uuid)) {
    callCache.get(sender)?.set(uuid, new Array());
  }
}

function pushCallMessageToCallCache(
  sender: string,
  uuid: string,
  callMessage: SignalService.CallMessage
) {
  createCallCacheForPubkeyAndUUID(sender, uuid);
  callCache
    .get(sender)
    ?.get(uuid)
    ?.push(callMessage);
}
