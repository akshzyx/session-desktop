import { useState } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import { clearOurAvatar, uploadOurAvatar } from '../../interactions/conversationInteractions';
import { ToastUtils } from '../../session/utils';
import { editProfileModal, updateEditProfilePictureModel } from '../../state/ducks/modalDialog';
import type { EditProfilePictureModalProps } from '../../types/ReduxTypes';
import { pickFileForAvatar } from '../../types/attachments/VisualAttachment';
import { SessionWrapperModal } from '../SessionWrapperModal';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SpacerLG } from '../basic/Text';
import { SessionIconButton } from '../icon';
import { SessionSpinner } from '../loading';
import { ProfileAvatar } from './edit-profile/components';

const StyledAvatarContainer = styled.div`
  cursor: pointer;
`;

const StyledUploadButton = styled.div`
  background-color: var(--chat-buttons-background-color);
  border-radius: 50%;
  overflow: hidden;
`;

const UploadImageButton = () => {
  return (
    <div style={{ position: 'relative' }}>
      <StyledUploadButton>
        <SessionIconButton iconType="thumbnail" iconSize={80} iconPadding="16px" />
      </StyledUploadButton>
      <SessionIconButton
        iconType="plusFat"
        iconSize={23}
        iconColor="var(--modal-background-content-color)"
        iconPadding="5px"
        borderRadius="50%"
        backgroundColor="var(--primary-color)"
        style={{ position: 'absolute', bottom: 0, right: 0 }}
      />
    </div>
  );
};

const uploadProfileAvatar = async (scaledAvatarUrl: string | null) => {
  if (scaledAvatarUrl?.length) {
    try {
      const blobContent = await (await fetch(scaledAvatarUrl)).blob();
      if (!blobContent || !blobContent.size) {
        throw new Error('Failed to fetch blob content from scaled avatar');
      }
      await uploadOurAvatar(await blobContent.arrayBuffer());
    } catch (error) {
      if (error.message && error.message.length) {
        ToastUtils.pushToastError('edit-profile', error.message);
      }
      window.log.error(
        'showEditProfileDialog Error ensuring that image is properly sized:',
        error && error.stack ? error.stack : error
      );
    }
  }
};

export const EditProfilePictureModal = (props: EditProfilePictureModalProps) => {
  const dispatch = useDispatch();

  const [newAvatarObjectUrl, setNewAvatarObjectUrl] = useState<string | null>(props.avatarPath);
  const [loading, setLoading] = useState(false);

  if (!props) {
    return null;
  }

  const { avatarPath, profileName, ourId } = props;

  const closeDialog = () => {
    dispatch(updateEditProfilePictureModel(null));
    dispatch(editProfileModal({}));
  };

  const handleAvatarClick = async () => {
    const updatedAvatarObjectUrl = await pickFileForAvatar();
    if (updatedAvatarObjectUrl) {
      setNewAvatarObjectUrl(updatedAvatarObjectUrl);
    }
  };

  const handleUpload = async () => {
    setLoading(true);
    if (newAvatarObjectUrl === avatarPath) {
      window.log.debug('Avatar Object URL has not changed!');
      return;
    }

    await uploadProfileAvatar(newAvatarObjectUrl);
    setLoading(false);
    dispatch(updateEditProfilePictureModel(null));
  };

  const handleRemove = async () => {
    setLoading(true);
    await clearOurAvatar();
    setNewAvatarObjectUrl(null);
    setLoading(false);
    dispatch(updateEditProfilePictureModel(null));
  };

  return (
    <SessionWrapperModal
      title={window.i18n('profileSetDisplayPicture')}
      onClose={closeDialog}
      showHeader={true}
      headerReverse={true}
      showExitIcon={true}
    >
      <div
        className="avatar-center"
        role="button"
        onClick={() => void handleAvatarClick()}
        data-testid={'image-upload-click'}
      >
        <StyledAvatarContainer className="avatar-center-inner">
          {newAvatarObjectUrl || avatarPath ? (
            <ProfileAvatar
              newAvatarObjectUrl={newAvatarObjectUrl}
              avatarPath={avatarPath}
              profileName={profileName}
              ourId={ourId}
            />
          ) : (
            <UploadImageButton />
          )}
        </StyledAvatarContainer>
      </div>

      {loading ? (
        <SessionSpinner loading={loading} />
      ) : (
        <>
          <SpacerLG />
          <div className="session-modal__button-group">
            <SessionButton
              text={window.i18n('save')}
              buttonType={SessionButtonType.Simple}
              onClick={handleUpload}
              disabled={newAvatarObjectUrl === avatarPath}
              dataTestId="save-button-profile-update"
            />
            <SessionButton
              text={window.i18n('remove')}
              buttonColor={SessionButtonColor.Danger}
              buttonType={SessionButtonType.Simple}
              onClick={handleRemove}
              disabled={!avatarPath}
            />
          </div>
        </>
      )}
    </SessionWrapperModal>
  );
};
