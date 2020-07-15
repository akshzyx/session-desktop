import React from 'react';

import { SessionIconButton, SessionIconSize, SessionIconType } from './icon';
import { SessionToggle } from './SessionToggle';
import { SessionIdEditable } from './SessionIdEditable';
import { UserSearchDropdown } from './UserSearchDropdown';
import { ContactType, SessionMemberListItem } from './SessionMemberListItem';
import { ConversationType } from '../../state/ducks/conversations';
import {
  SessionButton,
  SessionButtonColor,
  SessionButtonType,
} from './SessionButton';
import { SessionSpinner } from './SessionSpinner';
import { PillDivider } from './PillDivider';
import classNames from 'classnames';

export enum SessionClosableOverlayType {
  Contact = 'contact',
  Message = 'message',
  OpenGroup = 'open-group',
  ClosedGroup = 'closed-group',
}

interface Props {
  overlayMode: SessionClosableOverlayType;
  onChangeSessionID: any;
  onCloseClick: any;
  onButtonClick: any;
  contacts?: Array<ConversationType>;
  searchTerm?: string;
  searchResults?: any;
  updateSearch?: any;
  showSpinner?: boolean;
}

interface State {
  groupName: string;
  selectedMembers: Array<ContactType>;
  senderKeys: boolean;
}

export class SessionClosableOverlay extends React.Component<Props, State> {
  private readonly inputRef: React.RefObject<SessionIdEditable>;

  public constructor(props: Props) {
    super(props);

    this.state = {
      groupName: '',
      selectedMembers: [],
      senderKeys: false,
    };

    this.inputRef = React.createRef();
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onGroupNameChanged = this.onGroupNameChanged.bind(this);

    window.addEventListener('keyup', this.onKeyUp);
  }

  public componentDidMount() {
    if (this.inputRef.current) {
      this.inputRef.current.focus();
    }
  }

  public getContacts() {
    const { overlayMode } = this.props;
    const contactsList = this.props.contacts ?? [];
    // Depending on the rendered overlay type we have to filter the contact list.
    let filteredContactsList = contactsList;
    const isClosedGroupView =
      overlayMode === SessionClosableOverlayType.ClosedGroup;
    if (isClosedGroupView) {
      filteredContactsList = filteredContactsList.filter(
        c => c.type === 'direct' && !c.isMe
      );
    }

    return filteredContactsList.map((d: any) => {
      // TODO: should take existing members into account
      const existingMember = false;
      // if it has a profilename, use it and the shortened pubkey will be added automatically
      // if no profile name, Anonymous and the shortened pubkey will be added automatically
      let title;
      if (d.profileName) {
        title = `${d.profileName}`;
      } else {
        title = `${window.i18n('anonymous')}`;
      }

      return {
        id: d.id,
        authorPhoneNumber: d.id,
        authorProfileName: title,
        selected: false,
        authorName: name,
        authorColor: d.color,
        checkmarked: false,
        existingMember,
      };
    });
  }

  // tslint:disable-next-line max-func-body-length */
  public render(): JSX.Element {
    const {
      overlayMode,
      onCloseClick,
      onChangeSessionID,
      showSpinner,
      searchTerm,
      updateSearch,
      searchResults,
      onButtonClick,
    } = this.props;

    const isAddContactView = overlayMode === SessionClosableOverlayType.Contact;
    const isMessageView = overlayMode === SessionClosableOverlayType.Message;
    const isOpenGroupView =
      overlayMode === SessionClosableOverlayType.OpenGroup;
    const isClosedGroupView =
      overlayMode === SessionClosableOverlayType.ClosedGroup;

    let title;
    let buttonText;
    let descriptionLong;
    let subtitle;
    let placeholder;
    switch (overlayMode) {
      case 'message':
        title = window.i18n('newSession');
        buttonText = window.i18n('next');
        descriptionLong = window.i18n('usersCanShareTheir...');
        subtitle = window.i18n('enterSessionID');
        placeholder = window.i18n('pasteSessionIDRecipient');
        break;
      case 'contact':
        title = window.i18n('addContact');
        buttonText = window.i18n('next');
        descriptionLong = window.i18n('usersCanShareTheir...');
        subtitle = window.i18n('enterSessionID');
        placeholder = window.i18n('pasteSessionIDRecipient');
        break;
      case 'open-group':
        title = window.i18n('addChannel');
        buttonText = window.i18n('joinChannel');
        descriptionLong = window.i18n('addChannelDescription');
        subtitle = window.i18n('enterChannelURL');
        placeholder = window.i18n('channelUrlPlaceholder');
        break;
      case 'closed-group':
        title = window.i18n('newClosedGroup');
        buttonText = window.i18n('createClosedGroup');
        descriptionLong = window.i18n('createClosedGroupDescription');
        subtitle = window.i18n('createClosedGroupNamePrompt');
        placeholder = window.i18n('createClosedGroupPlaceholder');
        break;
      default:
    }

    const { groupName, selectedMembers, senderKeys } = this.state;
    const ourSessionID = window.textsecure.storage.user.getNumber();

    const contacts = this.getContacts();

    const noContactsForClosedGroup =
      overlayMode === SessionClosableOverlayType.ClosedGroup &&
      contacts.length === 0;

    return (
      <div className="module-left-pane-overlay">
        <div className="exit">
          <SessionIconButton
            iconSize={SessionIconSize.Small}
            iconType={SessionIconType.Exit}
            onClick={onCloseClick}
          />
        </div>

        <div className="spacer-md" />

        <h2>{title}</h2>

        <h3>
          {subtitle}
          <hr className="green-border" />
        </h3>
        <hr className="white-border" />

        {isOpenGroupView || isClosedGroupView ? (
          <div className="create-group-name-input">
            <SessionIdEditable
              ref={this.inputRef}
              editable={!noContactsForClosedGroup}
              placeholder={placeholder}
              value={groupName}
              isGroup={true}
              maxLength={window.CONSTANTS.MAX_GROUPNAME_LENGTH}
              onChange={this.onGroupNameChanged}
              onPressEnter={() => onButtonClick(groupName, selectedMembers)}
            />
          </div>
        ) : (
          <SessionIdEditable
            ref={this.inputRef}
            editable={true}
            placeholder={placeholder}
            onChange={onChangeSessionID}
          />
        )}

        {showSpinner && <SessionSpinner />}

        {isClosedGroupView && (
          <>
            <div className="spacer-lg" />
            <div className="group-member-list__container">
              {noContactsForClosedGroup ? (
                <div className="group-member-list__no-contacts">
                  {window.i18n('noContactsForGroup')}
                </div>
              ) : (
                <div className="group-member-list__selection">
                  {this.renderMemberList(contacts)}
                </div>
              )}
            </div>

            <div className="spacer-lg" />
          </>
        )}

        <div className="session-description-long">{descriptionLong}</div>
        {isMessageView && <h4>{window.i18n('or')}</h4>}

        {isMessageView && (
          <UserSearchDropdown
            searchTerm={searchTerm || ''}
            updateSearch={updateSearch}
            placeholder={window.i18n('searchByIDOrDisplayName')}
            searchResults={searchResults}
          />
        )}

        {isAddContactView && (
          <PillDivider text={window.i18n('yourPublicKey')} />
        )}

        {isAddContactView && (
          <SessionIdEditable
            editable={false}
            placeholder=""
            text={ourSessionID}
          />
        )}

        {isClosedGroupView && window.lokiFeatureFlags.enableSenderKeys && (
          <div className="sealed-sender-toggle">
            <SessionToggle
              active={Boolean(false)}
              onClick={() => {
                const value = this.state.senderKeys;
                this.setState({ senderKeys: !value });
              }}
            />

            <span
              className={classNames(
                'session-settings-item__description',
                'sender-keys-description'
              )}
            >
              {window.i18n('useSenderKeys')}
            </span>
          </div>
        )}

        <SessionButton
          buttonColor={SessionButtonColor.Green}
          buttonType={SessionButtonType.BrandOutline}
          text={buttonText}
          disabled={noContactsForClosedGroup}
          onClick={() => onButtonClick(groupName, selectedMembers, senderKeys)}
        />
      </div>
    );
  }

  private renderMemberList(members: any) {
    return members.map((member: ContactType, index: number) => (
      <SessionMemberListItem
        member={member}
        index={index}
        isSelected={false}
        key={member.id}
        onSelect={(selectedMember: ContactType) => {
          this.handleSelectMember(selectedMember);
        }}
        onUnselect={(selectedMember: ContactType) => {
          this.handleUnselectMember(selectedMember);
        }}
      />
    ));
  }

  private handleSelectMember(member: ContactType) {
    if (this.state.selectedMembers.includes(member)) {
      return;
    }

    this.setState({
      selectedMembers: [...this.state.selectedMembers, member],
    });
  }

  private handleUnselectMember(member: ContactType) {
    this.setState({
      selectedMembers: this.state.selectedMembers.filter(selectedMember => {
        return selectedMember.id !== member.id;
      }),
    });
  }

  private onGroupNameChanged(event: any) {
    this.setState({
      groupName: event,
    });
  }

  private onKeyUp(event: any) {
    if (event.key === 'Escape') {
      window.removeEventListener('keyup', this.onKeyUp);
      this.props.onCloseClick();
    }
  }
}
