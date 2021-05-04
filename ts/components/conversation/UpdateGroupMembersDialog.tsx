import React from 'react';
import classNames from 'classnames';

import { SessionModal } from '../session/SessionModal';
import { SessionButton, SessionButtonColor } from '../session/SessionButton';
import { ContactType, SessionMemberListItem } from '../session/SessionMemberListItem';
import { DefaultTheme } from 'styled-components';
import { ToastUtils } from '../../session/utils';

interface Props {
  titleText: string;
  okText: string;
  isPublic: boolean;
  cancelText: string;
  // contacts not in the group
  contactList: Array<any>;
  isAdmin: boolean;
  existingMembers: Array<String>;
  admins: Array<String>; // used for closed group

  i18n: any;
  onSubmit: any;
  onClose: any;
  theme: DefaultTheme;
}

interface State {
  contactList: Array<ContactType>;
  errorDisplayed: boolean;
  errorMessage: string;
}

export class UpdateGroupMembersDialog extends React.Component<Props, State> {
  constructor(props: any) {
    super(props);

    this.onMemberClicked = this.onMemberClicked.bind(this);
    this.onClickOK = this.onClickOK.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.closeDialog = this.closeDialog.bind(this);

    let contacts = this.props.contactList;
    contacts = contacts.map(d => {
      const lokiProfile = d.getLokiProfile();
      const name = lokiProfile ? lokiProfile.displayName : 'Anonymous';

      const existingMember = this.props.existingMembers.includes(d.id);

      return {
        id: d.id,
        authorPhoneNumber: d.id,
        authorProfileName: name,
        authorAvatarPath: d?.getAvatarPath(),
        selected: false,
        authorName: name, // different from ProfileName?
        checkmarked: false,
        existingMember,
      };
    });

    this.state = {
      contactList: contacts,
      errorDisplayed: false,
      errorMessage: '',
    };

    window.addEventListener('keyup', this.onKeyUp);
  }

  public onClickOK() {
    const members = this.getWouldBeMembers(this.state.contactList).map(d => d.id);

    this.props.onSubmit(members);

    this.closeDialog();
  }

  public render() {
    const { okText, cancelText, contactList, titleText } = this.props;

    const showNoMembersMessage = contactList.length === 0;

    const errorMsg = this.state.errorMessage;
    const errorMessageClasses = classNames(
      'error-message',
      this.state.errorDisplayed ? 'error-shown' : 'error-faded'
    );

    return (
      <SessionModal
        title={titleText}
        // tslint:disable-next-line: no-void-expression
        onClose={() => this.closeDialog()}
        theme={this.props.theme}
      >
        <div className="spacer-md" />

        <p className={errorMessageClasses}>{errorMsg}</p>
        <div className="spacer-md" />

        <div className="group-member-list__selection">{this.renderMemberList()}</div>
        {showNoMembersMessage && <p>{window.i18n('noMembersInThisGroup')}</p>}

        <div className="spacer-lg" />

        <div className="session-modal__button-group">
          <SessionButton text={cancelText} onClick={this.closeDialog} />
          <SessionButton
            text={okText}
            onClick={this.onClickOK}
            buttonColor={SessionButtonColor.Green}
          />
        </div>
      </SessionModal>
    );
  }

  private renderMemberList() {
    const members = this.state.contactList;

    return members.map((member: ContactType, index: number) => (
      <SessionMemberListItem
        member={member}
        index={index}
        isSelected={!member.checkmarked}
        onSelect={this.onMemberClicked}
        onUnselect={this.onMemberClicked}
        key={member.id}
        theme={this.props.theme}
      />
    ));
  }

  private onKeyUp(event: any) {
    switch (event.key) {
      case 'Enter':
        this.onClickOK();
        break;
      case 'Esc':
      case 'Escape':
        this.closeDialog();
        break;
      default:
    }
  }

  // Return members that would comprise the group given the
  // current state in `users`
  private getWouldBeMembers(users: Array<ContactType>) {
    return users.filter(d => {
      return (d.existingMember && !d.checkmarked) || (!d.existingMember && d.checkmarked);
    });
  }

  private closeDialog() {
    window.removeEventListener('keyup', this.onKeyUp);

    this.props.onClose();
  }

  private onMemberClicked(selected: any) {
    const { isAdmin, admins } = this.props;
    const { contactList } = this.state;

    if (selected.existingMember && !isAdmin) {
      window.log.warn('Only group admin can remove members!');
      return;
    }

    if (selected.existingMember && admins.includes(selected.id)) {
      window.log.warn(
        `User ${selected.id} cannot be removed as they are the creator of the closed group.`
      );
      ToastUtils.pushCannotRemoveCreatorFromGroup();
      return;
    }

    const updatedContacts = contactList.map(member => {
      if (member.id === selected.id) {
        return { ...member, checkmarked: !member.checkmarked };
      } else {
        return member;
      }
    });

    this.setState(state => {
      return {
        ...state,
        contactList: updatedContacts,
      };
    });
  }
}
