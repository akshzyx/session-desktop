import React, { useState } from 'react';

import { SessionModal } from '../session/SessionModal';
import { SessionButton, SessionButtonColor } from '../session/SessionButton';
import { ContactType, SessionMemberListItem } from '../session/SessionMemberListItem';
import { DefaultTheme } from 'styled-components';
import { ConversationController } from '../../session/conversations';
import { ToastUtils, UserUtils } from '../../session/utils';
import { initiateGroupUpdate } from '../../session/group';
import { ConversationModel, ConversationTypeEnum } from '../../models/conversation';
import { getCompleteUrlForV2ConvoId } from '../../interactions/conversation';
import _ from 'lodash';
import { VALIDATION } from '../../session/constants';
import { SessionWrapperModal } from '../session/SessionWrapperModal';


interface Props {
  // contactList: Array<any>;
  onClose: any;
  theme: DefaultTheme;
  convo: ConversationModel;
}

interface State {
  contactList: Array<ContactType>;
}


const InviteContactsDialogInner = (props: Props) => {

  const { convo, onClose, theme } = props;

  let contacts = ConversationController.getInstance().getConversations().filter(
    d => !!d && !d.isBlocked() && d.isPrivate() && !d.isMe() && !!d.get('active_at')
  );
  if (!convo.isPublic()) {
    // filter our zombies and current members from the list of contact we can add

    const members = convo.get('members') || [];
    const zombies = convo.get('zombies') || [];
    contacts = contacts.filter(
      d => !members.includes(d.id) && !zombies.includes(d.id)
    );
  }

  const chatName = convo.get('name');
  const isPublicConvo = convo.isPublic();

  const [contactList, setContactList] = useState(
    contacts.map((d: ConversationModel) => {
      const lokiProfile = d.getLokiProfile();
      const nickname = d.getNickname();
      const name = nickname
        ? nickname
        : lokiProfile
          ? lokiProfile.displayName
          : window.i18n('anonymous');

      // TODO: should take existing members into account
      const existingMember = false;

      return {
        id: d.id,
        authorPhoneNumber: d.id,
        authorProfileName: name,
        authorAvatarPath: d?.getAvatarPath() || '',
        selected: false,
        authorName: name,
        checkmarked: false,
        existingMember,
      };
    })
  )


  const closeDialog = () => {
    window.removeEventListener('keyup', onKeyUp);
    onClose();
  }

  const onClickOK = () => {
    const selectedContacts = contactList.filter((d: ContactType) => d.checkmarked).map((d: ContactType) => d.id);

    if (selectedContacts.length > 0) {
      if (isPublicConvo) {
        void submitForOpenGroup(selectedContacts);
      } else {
        void submitForClosedGroup(selectedContacts);
      }
    }

    closeDialog();
  }

  const onKeyUp = (event: any) => {
    switch (event.key) {
      case 'Enter':
        onClickOK();
        break;
      case 'Esc':
      case 'Escape':
        closeDialog();
        break;
      default:
    }
  }
  window.addEventListener('keyup', onKeyUp);

  const titleText = `${window.i18n('addingContacts')} ${chatName}`;
  const cancelText = window.i18n('cancel');
  const okText = window.i18n('ok');

  const hasContacts = contactList.length !== 0;

  const submitForOpenGroup = async (pubkeys: Array<string>) => {
    const { convo } = props;

    const completeUrl = await getCompleteUrlForV2ConvoId(convo.id);
    const groupInvitation = {
      serverAddress: completeUrl,
      serverName: convo.getName(),
    };
    pubkeys.forEach(async pubkeyStr => {
      const privateConvo = await ConversationController.getInstance().getOrCreateAndWait(
        pubkeyStr,
        ConversationTypeEnum.PRIVATE
      );

      if (privateConvo) {
        void privateConvo.sendMessage('', null, null, null, groupInvitation);
      }
    });
  }

  const submitForClosedGroup = async (pubkeys: Array<string>) => {

    // closed group chats
    const ourPK = UserUtils.getOurPubKeyStrFromCache();
    // we only care about real members. If a member is currently a zombie we have to be able to add him back
    let existingMembers = convo.get('members') || [];
    // at least make sure it's an array
    if (!Array.isArray(existingMembers)) {
      existingMembers = [];
    }
    existingMembers = _.compact(existingMembers);
    const existingZombies = convo.get('zombies') || [];
    const newMembers = pubkeys.filter(d => !existingMembers.includes(d));

    if (newMembers.length > 0) {
      // Do not trigger an update if there is too many members
      // be sure to include current zombies in this count
      if (
        newMembers.length + existingMembers.length + existingZombies.length >
        VALIDATION.CLOSED_GROUP_SIZE_LIMIT
      ) {
        ToastUtils.pushTooManyMembers();
        return;
      }

      const allMembers = _.concat(existingMembers, newMembers, [ourPK]);
      const uniqMembers = _.uniq(allMembers);

      const groupId = convo.get('id');
      const groupName = convo.get('name');

      await initiateGroupUpdate(
        groupId,
        groupName || window.i18n('unknown'),
        uniqMembers,
        undefined
      );
    }
  }


  const renderMemberList = () => {
    const members = contactList;
    const selectedContacts = contactList.filter((d: ContactType) => d.checkmarked).map((d: ContactType) => d.id);

    return members.map((member: ContactType, index: number) => (
      <SessionMemberListItem
        member={member}
        key={index}
        index={index}
        isSelected={selectedContacts.some(m => m === member.id)}
        onSelect={(selectedMember: ContactType) => {
          onMemberClicked(selectedMember);
        }}
        onUnselect={(selectedMember: ContactType) => {
          onMemberClicked(selectedMember);
        }}
        theme={theme}
      />
    ));
  }


  const onMemberClicked = (clickedMember: ContactType) => {
    const updatedContacts = contactList.map((member: ContactType) => {
      if (member.id === clickedMember.id) {
        return { ...member, checkmarked: !member.checkmarked };
      } else {
        return member;
      }
    });
    setContactList(updatedContacts);
  }


  return (
    <SessionWrapperModal title={titleText} onClose={closeDialog} theme={props.theme}>
      <div className="spacer-lg" />

      <div className="contact-selection-list">{renderMemberList()}</div>
      {hasContacts ? null : (
        <>
          <div className="spacer-lg" />
          <p className="no-contacts">{window.i18n('noContactsToAdd')}</p>
          <div className="spacer-lg" />
        </>
      )}

      <div className="spacer-lg" />

      <div className="session-modal__button-group">
        <SessionButton text={cancelText} onClick={closeDialog} />
        <SessionButton
          text={okText}
          disabled={!hasContacts}
          onClick={onClickOK}
          buttonColor={SessionButtonColor.Green}
        />
      </div>
    </SessionWrapperModal>
  );

}

export const InviteContactsDialog = InviteContactsDialogInner;
