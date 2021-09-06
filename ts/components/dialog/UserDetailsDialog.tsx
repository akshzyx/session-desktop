import React, { useState } from 'react';
// tslint:disable no-submodule-imports

import useCopyToClipboard from 'react-use/lib/useCopyToClipboard';

import useKey from 'react-use/lib/useKey';
import { ConversationTypeEnum } from '../../models/conversation';
import { getConversationController } from '../../session/conversations';
import { openConversationWithMessages } from '../../state/ducks/conversations';
import { updateUserDetailsModal } from '../../state/ducks/modalDialog';
import { Avatar, AvatarSize } from '../Avatar';
import { SpacerLG } from '../basic/Text';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../session/SessionButton';
import { SessionIdEditable } from '../session/SessionIdEditable';
import { SessionWrapperModal } from '../session/SessionWrapperModal';
type Props = {
  conversationId: string;
  authorAvatarPath: string | null;
  userName: string;
};

export const UserDetailsDialog = (props: Props) => {
  const [isEnlargedImageShown, setIsEnlargedImageShown] = useState(false);
  const convo = getConversationController().get(props.conversationId);

  const size = isEnlargedImageShown ? AvatarSize.HUGE : AvatarSize.XL;
  const userName = props.userName || props.conversationId;

  const [_, copyToClipboard] = useCopyToClipboard();

  function closeDialog() {
    window.inboxStore?.dispatch(updateUserDetailsModal(null));
  }

  async function onClickStartConversation() {
    const conversation = await getConversationController().getOrCreateAndWait(
      convo.id,
      ConversationTypeEnum.PRIVATE
    );

    await openConversationWithMessages({ conversationKey: conversation.id });
    closeDialog();
  }

  useKey(
    'Enter',
    () => {
      void onClickStartConversation();
    },
    undefined,
    [props.conversationId]
  );

  return (
    <SessionWrapperModal title={props.userName} onClose={closeDialog} showExitIcon={true}>
      <div className="avatar-center">
        <div className="avatar-center-inner">
          <Avatar
            avatarPath={props.authorAvatarPath}
            name={userName}
            size={size}
            onAvatarClick={() => {
              setIsEnlargedImageShown(!isEnlargedImageShown);
            }}
            pubkey={props.conversationId}
          />
        </div>
      </div>

      <SpacerLG />
      <SessionIdEditable editable={false} text={convo.id} />

      <div className="session-modal__button-group__center">
        <SessionButton
          text={window.i18n('copy')}
          buttonType={SessionButtonType.Default}
          buttonColor={SessionButtonColor.Primary}
          onClick={() => {
            copyToClipboard(props.conversationId);
          }}
        />
        <SessionButton
          text={window.i18n('startConversation')}
          buttonType={SessionButtonType.Default}
          buttonColor={SessionButtonColor.Green}
          onClick={onClickStartConversation}
        />
      </div>
    </SessionWrapperModal>
  );
};
