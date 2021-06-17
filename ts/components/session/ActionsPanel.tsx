import React, { Dispatch, useEffect, useState } from 'react';
import { SessionIconButton, SessionIconSize, SessionIconType } from './icon';
import { Avatar, AvatarSize } from '../Avatar';
import { darkTheme, lightTheme } from '../../state/ducks/SessionTheme';
import { SessionToastContainer } from './SessionToastContainer';
import { ConversationController } from '../../session/conversations';
import { UserUtils } from '../../session/utils';
import { syncConfigurationIfNeeded } from '../../session/utils/syncUtils';

import {
  createOrUpdateItem,
  generateAttachmentKeyIfEmpty,
  getAllOpenGroupV1Conversations,
  getItemById,
  hasSyncedInitialConfigurationItem,
  lastAvatarUploadTimestamp,
  removeConversation,
  removeOneOpenGroupV1Message,
} from '../../data/data';
import { OnionPaths } from '../../session/onions';
import { getMessageQueue } from '../../session/sending';
import { useDispatch, useSelector } from 'react-redux';
import { getOurNumber } from '../../state/selectors/user';
import {
  getOurPrimaryConversation,
  getUnreadMessageCount,
} from '../../state/selectors/conversations';
import { getTheme } from '../../state/selectors/theme';
import { applyTheme } from '../../state/ducks/theme';
import { getFocusedSection } from '../../state/selectors/section';
import { useInterval } from '../../hooks/useInterval';
import { clearSearch } from '../../state/ducks/search';
import { showLeftPaneSection } from '../../state/ducks/section';

import {
  cleanUpOldDecryptedMedias,
  getDecryptedMediaUrl,
} from '../../session/crypto/DecryptedAttachmentsManager';
import { OpenGroupManagerV2 } from '../../opengroup/opengroupV2/OpenGroupManagerV2';
import { loadDefaultRooms } from '../../opengroup/opengroupV2/ApiUtil';
import { forceRefreshRandomSnodePool } from '../../session/snode_api/snodePool';
import { SwarmPolling } from '../../session/snode_api/swarmPolling';
import { ActionPanelOnionStatusLight, OnionPathModal } from '../OnionStatusDialog';
import { EditProfileDialog } from '../EditProfileDialog';
import { StateType } from '../../state/reducer';
import { SessionConfirm } from './SessionConfirm';
import { IMAGE_JPEG } from '../../types/MIME';
import { FSv2 } from '../../fileserver';
import { debounce } from 'lodash';
import { DURATION } from '../../session/constants';
import { actions as conversationActions } from '../../state/ducks/conversations';

// tslint:disable-next-line: no-import-side-effect no-submodule-imports

export enum SectionType {
  Profile,
  Message,
  Contact,
  Channel,
  Settings,
  Moon,
  PathIndicator,
}

const Section = (props: {
  setModal?: any;
  type: SectionType;
  avatarPath?: string;
}) => {
  const ourNumber = useSelector(getOurNumber);
  const unreadMessageCount = useSelector(getUnreadMessageCount);
  const theme = useSelector(getTheme);
  const dispatch = useDispatch();
  const { setModal, type, avatarPath } = props;

  const focusedSection = useSelector(getFocusedSection);
  const isSelected = focusedSection === props.type;


  const handleModalClose = () => {
    setModal(null);
  }

  const handleClick = () => {
    /* tslint:disable:no-void-expression */
    if (type === SectionType.Profile) {
      setModal(<EditProfileDialog onClose={handleModalClose} theme={theme} ></EditProfileDialog>);
    } else if (type === SectionType.Moon) {
      const themeFromSettings = window.Events.getThemeSetting();
      const updatedTheme = themeFromSettings === 'dark' ? 'light' : 'dark';
      window.setTheme(updatedTheme);

      const newThemeObject = updatedTheme === 'dark' ? darkTheme : lightTheme;
      dispatch(applyTheme(newThemeObject));
    } else if (type === SectionType.PathIndicator) {
      // Show Path Indicator Modal
      setModal(<OnionPathModal onClose={handleModalClose}></OnionPathModal>);
    } else {
      dispatch(clearSearch());
      dispatch(showLeftPaneSection(type));
    }
  };

  if (type === SectionType.Profile) {
    const conversation = ConversationController.getInstance().get(ourNumber);

    const profile = conversation?.getLokiProfile();
    const userName = (profile && profile.displayName) || ourNumber;
    return (
      <Avatar
        avatarPath={avatarPath}
        size={AvatarSize.XS}
        onAvatarClick={handleClick}
        name={userName}
        pubkey={ourNumber}
      />
    );
  }

  let iconColor = undefined;
  if (type === SectionType.PathIndicator) {
  }

  const unreadToShow = type === SectionType.Message ? unreadMessageCount : undefined;

  let iconType: SessionIconType;
  switch (type) {
    case SectionType.Message:
      iconType = SessionIconType.ChatBubble;
      break;
    case SectionType.Contact:
      iconType = SessionIconType.Users;
      break;
    case SectionType.Settings:
      iconType = SessionIconType.Gear;
      break;
    case SectionType.Moon:
      iconType = SessionIconType.Moon;
      break;
    default:
      iconType = SessionIconType.Moon;
  }

  return (
    <>
      {type === SectionType.PathIndicator ?
        <ActionPanelOnionStatusLight
          handleClick={handleClick}
          isSelected={isSelected}
        />
        :
        <SessionIconButton
          iconSize={SessionIconSize.Medium}
          iconType={iconType}
          iconColor={iconColor}
          notificationCount={unreadToShow}
          onClick={handleClick}
          isSelected={isSelected}
          theme={theme}
        />
      }
    </>
  );
};

const showResetSessionIDDialogIfNeeded = async () => {
  const userED25519KeyPairHex = await UserUtils.getUserED25519KeyPair();
  if (userED25519KeyPairHex) {
    return;
  }

  window.showResetSessionIdDialog();
};

const cleanUpMediasInterval = DURATION.MINUTES * 30;

const setupTheme = () => {
  const theme = window.Events.getThemeSetting();
  window.setTheme(theme);

  const newThemeObject = theme === 'dark' ? darkTheme : lightTheme;
  window?.inboxStore?.dispatch(applyTheme(newThemeObject));
};

// Do this only if we created a new Session ID, or if we already received the initial configuration message
const triggerSyncIfNeeded = async () => {
  const didWeHandleAConfigurationMessageAlready =
    (await getItemById(hasSyncedInitialConfigurationItem))?.value || false;
  if (didWeHandleAConfigurationMessageAlready) {
    await syncConfigurationIfNeeded();
  }
};

const scheduleDeleteOpenGroupV1Messages = async () => {
  const leftToRemove = await removeOneOpenGroupV1Message();
  if (leftToRemove > 0) {
    window?.log?.info(`We still have ${leftToRemove} opengroupv1 messages to remove...`);
    setTimeout(scheduleDeleteOpenGroupV1Messages, 10000);
  } else {
    window?.log?.info('No more opengroupv1 messages to remove...');
  }
};

const removeAllV1OpenGroups = async () => {
  const allV1Convos = (await getAllOpenGroupV1Conversations()).models || [];
  // do not remove messages of opengroupv1 for now. We have to find a way of doing it without making the whole app extremely slow
  // tslint:disable-next-line: prefer-for-of
  for (let index = 0; index < allV1Convos.length; index++) {
    const v1Convo = allV1Convos[index];
    try {
      await removeConversation(v1Convo.id);
      window.log.info(`deleting v1convo : ${v1Convo.id}`);
      ConversationController.getInstance().unsafeDelete(v1Convo);
      if (window.inboxStore) {
        window.inboxStore?.dispatch(conversationActions.conversationRemoved(v1Convo.id));
        window.inboxStore?.dispatch(
          conversationActions.conversationChanged(v1Convo.id, v1Convo.getProps())
        );
      }
    } catch (e) {
      window.log.warn(`failed to delete opengroupv1 ${v1Convo.id}`, e);
    }
  }

  setTimeout(scheduleDeleteOpenGroupV1Messages, 10000);
};

const triggerAvatarReUploadIfNeeded = async () => {
  const lastTimeStampAvatarUpload = (await getItemById(lastAvatarUploadTimestamp))?.value || 0;

  if (Date.now() - lastTimeStampAvatarUpload > DURATION.DAYS * 14) {
    window.log.info('Reuploading avatar...');
    // reupload the avatar
    const ourConvo = ConversationController.getInstance().get(UserUtils.getOurPubKeyStrFromCache());
    if (!ourConvo) {
      window.log.warn('ourConvo not found... This is not a valid case');
      return;
    }
    const profileKey = window.textsecure.storage.get('profileKey');
    if (!profileKey) {
      window.log.warn('our profileKey not found... This is not a valid case');
      return;
    }

    const currentAttachmentPath = ourConvo.getAvatarPath();

    if (!currentAttachmentPath) {
      window.log.warn('No attachment currently set for our convo.. Nothing to do.');
      return;
    }

    const decryptedAvatarUrl = await getDecryptedMediaUrl(currentAttachmentPath, IMAGE_JPEG);

    if (!decryptedAvatarUrl) {
      window.log.warn('Could not decrypt avatar stored locally..');
      return;
    }
    const response = await fetch(decryptedAvatarUrl);
    const blob = await response.blob();
    const decryptedAvatarData = await blob.arrayBuffer();

    if (!decryptedAvatarData?.byteLength) {
      window.log.warn('Could not read blob of avatar locally..');
      return;
    }

    const encryptedData = await window.textsecure.crypto.encryptProfile(
      decryptedAvatarData,
      profileKey
    );

    const avatarPointer = await FSv2.uploadFileToFsV2(encryptedData);
    let fileUrl;
    if (!avatarPointer) {
      window.log.warn('failed to reupload avatar to fsv2');
      return;
    }
    ({ fileUrl } = avatarPointer);

    ourConvo.set('avatarPointer', fileUrl);

    // this encrypts and save the new avatar and returns a new attachment path
    const upgraded = await window.Signal.Migrations.processNewAttachment({
      isRaw: true,
      data: decryptedAvatarData,
      url: fileUrl,
    });
    const newAvatarPath = upgraded.path;
    // Replace our temporary image with the attachment pointer from the server:
    ourConvo.set('avatar', null);
    const existingHash = ourConvo.get('avatarHash');
    const displayName = ourConvo.get('profileName');
    // this commits already
    await ourConvo.setLokiProfile({ avatar: newAvatarPath, displayName, avatarHash: existingHash });
    const newTimestampReupload = Date.now();
    await createOrUpdateItem({ id: lastAvatarUploadTimestamp, value: newTimestampReupload });
    window.log.info(
      `Reuploading avatar finished at ${newTimestampReupload}, newAttachmentPointer ${fileUrl}`
    );
  }
};

/**
 * This function is called only once: on app startup with a logged in user
 */
const doAppStartUp = () => {
  if (window.lokiFeatureFlags.useOnionRequests || window.lokiFeatureFlags.useFileOnionRequests) {
    // Initialize paths for onion requests
    void OnionPaths.buildNewOnionPathsOneAtATime();
  }

  // init the messageQueue. In the constructor, we add all not send messages
  // this call does nothing except calling the constructor, which will continue sending message in the pipeline
  void getMessageQueue().processAllPending();
  void setupTheme();

  // keep that one to make sure our users upgrade to new sessionIDS
  void showResetSessionIDDialogIfNeeded();
  void removeAllV1OpenGroups();

  // this generates the key to encrypt attachments locally
  void generateAttachmentKeyIfEmpty();
  void OpenGroupManagerV2.getInstance().startPolling();
  // trigger a sync message if needed for our other devices

  void triggerSyncIfNeeded();

  void loadDefaultRooms();

  debounce(triggerAvatarReUploadIfNeeded, 200);

  // TODO: Investigate the case where we reconnect
  const ourKey = UserUtils.getOurPubKeyStrFromCache();
  SwarmPolling.getInstance().addPubkey(ourKey);
  SwarmPolling.getInstance().start();
};

/**
 * ActionsPanel is the far left banner (not the left pane).
 * The panel with buttons to switch between the message/contact/settings/theme views
 */
export const ActionsPanel = () => {
  const [startCleanUpMedia, setStartCleanUpMedia] = useState(false);
  const ourPrimaryConversation = useSelector(getOurPrimaryConversation);
  const [modal, setModal] = useState<any>(null);

  // this maxi useEffect is called only once: when the component is mounted.
  // For the action panel, it means this is called only one per app start/with a user loggedin
  useEffect(() => {
    void doAppStartUp();
  }, []);

  // wait for cleanUpMediasInterval and then start cleaning up medias
  // this would be way easier to just be able to not trigger a call with the setInterval
  useEffect(() => {
    const timeout = global.setTimeout(() => setStartCleanUpMedia(true), cleanUpMediasInterval);

    return () => global.clearTimeout(timeout);
  }, []);

  useInterval(
    () => {
      cleanUpOldDecryptedMedias();
    },
    startCleanUpMedia ? cleanUpMediasInterval : null
  );

  if (!ourPrimaryConversation) {
    window?.log?.warn('ActionsPanel: ourPrimaryConversation is not set');
    return <></>;
  }

  useInterval(() => {
    void syncConfigurationIfNeeded();
  }, DURATION.DAYS * 2);

  useInterval(() => {
    void forceRefreshRandomSnodePool();
  }, DURATION.DAYS * 1);

  useInterval(() => {
    // this won't be run every days, but if the app stays open for more than 10 days
    void triggerAvatarReUploadIfNeeded();
  }, DURATION.DAYS * 1);

  const formatLog = (s: any ) => {
    console.log("@@@@:: ", s);
  }


  const confirmModalState = useSelector((state: StateType) => state.confirmModal);
  
  return (
    <>
      {modal ? modal : null}
      { confirmModalState ? <SessionConfirm {...confirmModalState} />: null}
      <div className="module-left-pane__sections-container">
        <Section
          setModal={setModal}
          type={SectionType.Profile}
          avatarPath={ourPrimaryConversation.avatarPath}
        />
        <Section type={SectionType.Message} />
        <Section type={SectionType.Contact} />
        <Section type={SectionType.Settings} />

        <SessionToastContainer />

        <Section
          setModal={setModal}
          type={SectionType.PathIndicator} />
        <Section type={SectionType.Moon} />
      </div>
    </>
  );
};
