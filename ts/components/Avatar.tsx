import React, { useState } from 'react';
import classNames from 'classnames';
import { useEncryptedFileFetch } from '../hooks/useEncryptedFileFetch';
import _ from 'underscore';
import {
  useAvatarPath,
  useConversationUsername,
  useIsClosedGroup,
} from '../hooks/useParamSelector';
import { AvatarPlaceHolder } from './AvatarPlaceHolder/AvatarPlaceHolder';
import { ClosedGroupAvatar } from './AvatarPlaceHolder/ClosedGroupAvatar';
import { useDisableDrag } from '../hooks/useDisableDrag';

export enum AvatarSize {
  XS = 28,
  S = 36,
  M = 48,
  L = 64,
  XL = 80,
  HUGE = 300,
}

type Props = {
  forcedAvatarPath?: string | null;
  forcedName?: string;
  pubkey: string;
  size: AvatarSize;
  base64Data?: string; // if this is not empty, it will be used to render the avatar with base64 encoded data
  onAvatarClick?: () => void;
  dataTestId?: string;
};

const Identicon = (props: Props) => {
  const { size, forcedName, pubkey } = props;
  const displayName = useConversationUsername(pubkey);
  const userName = forcedName || displayName || '0';

  return <AvatarPlaceHolder diameter={size} name={userName} pubkey={pubkey} />;
};

const NoImage = (
  props: Pick<Props, 'forcedName' | 'size' | 'pubkey' | 'onAvatarClick'> & {
    isClosedGroup: boolean;
  }
) => {
  const { forcedName, size, pubkey, isClosedGroup } = props;
  // if no image but we have conversations set for the group, renders group members avatars
  if (pubkey && isClosedGroup) {
    return (
      <ClosedGroupAvatar size={size} closedGroupId={pubkey} onAvatarClick={props.onAvatarClick} />
    );
  }

  return <Identicon size={size} forcedName={forcedName} pubkey={pubkey} />;
};

const AvatarImage = (props: {
  avatarPath?: string;
  base64Data?: string;
  name?: string; // display name, profileName or pubkey, whatever is set first
  imageBroken: boolean;
  handleImageError: () => any;
}) => {
  const { avatarPath, base64Data, name, imageBroken, handleImageError } = props;

  const disableDrag = useDisableDrag();

  if ((!avatarPath && !base64Data) || imageBroken) {
    return null;
  }
  const dataToDisplay = base64Data ? `data:image/jpeg;base64,${base64Data}` : avatarPath;

  return (
    <img
      onError={handleImageError}
      onDragStart={disableDrag}
      alt={window.i18n('contactAvatarAlt', [name || 'avatar'])}
      src={dataToDisplay}
    />
  );
};

const AvatarInner = (props: Props) => {
  const { base64Data, size, pubkey, forcedAvatarPath, forcedName, dataTestId } = props;
  const [imageBroken, setImageBroken] = useState(false);

  const isClosedGroupAvatar = useIsClosedGroup(pubkey);

  const avatarPath = useAvatarPath(pubkey);
  const name = useConversationUsername(pubkey);

  // contentType is not important
  const { urlToLoad } = useEncryptedFileFetch(forcedAvatarPath || avatarPath || '', '', true);
  const handleImageError = () => {
    window.log.warn(
      'Avatar: Image failed to load; failing over to placeholder',
      urlToLoad,
      forcedAvatarPath || avatarPath
    );
    setImageBroken(true);
  };

  const hasImage = (base64Data || urlToLoad) && !imageBroken && !isClosedGroupAvatar;

  const isClickable = !!props.onAvatarClick;
  return (
    <div
      className={classNames(
        'module-avatar',
        `module-avatar--${size}`,
        hasImage ? 'module-avatar--with-image' : 'module-avatar--no-image',
        isClickable && 'module-avatar-clickable'
      )}
      onClick={e => {
        e.stopPropagation();
        props.onAvatarClick?.();
      }}
      role="button"
      data-testid={dataTestId}
    >
      {hasImage ? (
        <AvatarImage
          avatarPath={urlToLoad}
          base64Data={base64Data}
          imageBroken={imageBroken}
          name={forcedName || name}
          handleImageError={handleImageError}
        />
      ) : (
        <NoImage {...props} isClosedGroup={isClosedGroupAvatar} />
      )}
    </div>
  );
};

export const Avatar = React.memo(AvatarInner, _.isEqual);
