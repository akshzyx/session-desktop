import React from 'react';
import { connect } from 'react-redux';
import { SessionIconButton, SessionIconSize, SessionIconType } from './icon';
import { Avatar } from '../Avatar';
import { removeItemById } from '../../../js/modules/data';
import { darkTheme, lightTheme } from '../../state/ducks/SessionTheme';
import { SessionToastContainer } from './SessionToastContainer';
import { mapDispatchToProps } from '../../state/actions';
import { ConversationType } from '../../state/ducks/conversations';
import { noop } from 'lodash';
import { DefaultTheme } from 'styled-components';
import { StateType } from '../../state/reducer';
import { UserUtil } from '../../util';
import { ConversationController } from '../../session/conversations';
import { getFocusedSection } from '../../state/selectors/section';
import { getTheme } from '../../state/selectors/theme';
import { getOurNumber } from '../../state/selectors/user';
// tslint:disable-next-line: no-import-side-effect no-submodule-imports

export enum SectionType {
  Profile,
  Message,
  Contact,
  Channel,
  Settings,
  Moon,
}

interface Props {
  onSectionSelected: any;
  selectedSection: SectionType;
  unreadMessageCount: number;
  ourPrimaryConversation: ConversationType;
  ourNumber: string;
  applyTheme?: any;
  theme: DefaultTheme;
}

class ActionsPanelPrivate extends React.Component<Props> {
  constructor(props: Props) {
    super(props);

    this.editProfileHandle = this.editProfileHandle.bind(this);
    // we consider people had the time to upgrade, so remove this id from the db
    // it was used to display a dialog when we added the light mode auto-enabled
    void removeItemById('hasSeenLightModeDialog');
  }

  // fetch the user saved theme from the db, and apply it on mount.
  public componentDidMount() {
    const theme = window.Events.getThemeSetting();
    window.setTheme(theme);

    const newThemeObject = theme === 'dark' ? darkTheme : lightTheme;
    this.props.applyTheme(newThemeObject);

    void this.showResetSessionIDDialogIfNeeded();

    // remove existing prekeys, sign prekeys and sessions
    void window.getAccountManager().clearSessionsAndPreKeys();
  }

  public Section = ({
    isSelected,
    onSelect,
    type,
    avatarPath,
    notificationCount,
  }: {
    isSelected: boolean;
    onSelect?: (event: SectionType) => void;
    type: SectionType;
    avatarPath?: string;
    notificationCount?: number;
  }) => {
    const { ourNumber } = this.props;
    const handleClick = onSelect
      ? () => {
          /* tslint:disable:no-void-expression */
          if (type === SectionType.Profile) {
            this.editProfileHandle();
          } else if (type === SectionType.Moon) {
            const theme = window.Events.getThemeSetting();
            const updatedTheme = theme === 'dark' ? 'light' : 'dark';
            window.setTheme(updatedTheme);

            const newThemeObject =
              updatedTheme === 'dark' ? darkTheme : lightTheme;
            this.props.applyTheme(newThemeObject);
          } else {
            onSelect(type);
          }
          /* tslint:enable:no-void-expression */
        }
      : undefined;

    if (type === SectionType.Profile) {
      const conversation = ConversationController.getInstance().get(ourNumber);

      const profile = conversation?.getLokiProfile();
      const userName = (profile && profile.displayName) || ourNumber;
      return (
        <Avatar
          avatarPath={avatarPath}
          size={28}
          onAvatarClick={handleClick}
          name={userName}
          pubkey={ourNumber}
        />
      );
    }

    let iconType: SessionIconType;
    switch (type) {
      case SectionType.Message:
        iconType = SessionIconType.ChatBubble;
        break;
      case SectionType.Contact:
        iconType = SessionIconType.Users;
        break;
      case SectionType.Channel:
        iconType = SessionIconType.Globe;
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
      <SessionIconButton
        iconSize={SessionIconSize.Medium}
        iconType={iconType}
        notificationCount={notificationCount}
        onClick={handleClick}
        isSelected={isSelected}
        theme={this.props.theme}
      />
    );
  };

  public editProfileHandle() {
    window.showEditProfileDialog(noop);
  }

  public render(): JSX.Element {
    const { selectedSection, unreadMessageCount } = this.props;

    const isProfilePageSelected = selectedSection === SectionType.Profile;
    const isMessagePageSelected = selectedSection === SectionType.Message;
    const isContactPageSelected = selectedSection === SectionType.Contact;
    const isSettingsPageSelected = selectedSection === SectionType.Settings;
    const isMoonPageSelected = selectedSection === SectionType.Moon;

    return (
      <div className="module-left-pane__sections-container">
        <this.Section
          type={SectionType.Profile}
          avatarPath={this.props.ourPrimaryConversation?.avatarPath}
          isSelected={isProfilePageSelected}
          onSelect={this.handleSectionSelect}
        />
        <this.Section
          type={SectionType.Message}
          isSelected={isMessagePageSelected}
          onSelect={this.handleSectionSelect}
          notificationCount={unreadMessageCount}
        />
        <this.Section
          type={SectionType.Contact}
          isSelected={isContactPageSelected}
          onSelect={this.handleSectionSelect}
        />
        <this.Section
          type={SectionType.Settings}
          isSelected={isSettingsPageSelected}
          onSelect={this.handleSectionSelect}
        />

        <SessionToastContainer />
        <this.Section
          type={SectionType.Moon}
          isSelected={isMoonPageSelected}
          onSelect={this.handleSectionSelect}
        />
      </div>
    );
  }

  private readonly handleSectionSelect = (section: SectionType): void => {
    this.props.onSectionSelected(section);
  };

  private async showResetSessionIDDialogIfNeeded() {
    const userED25519KeyPairHex = await UserUtil.getUserED25519KeyPair();
    if (userED25519KeyPairHex) {
      return;
    }

    window.showResetSessionIdDialog();
  }
}

const mapStateToProps = (state: StateType) => {
  return {
    section: getFocusedSection(state),
    theme: getTheme(state),
    ourNumber: getOurNumber(state),
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);

export const ActionsPanel = smart(ActionsPanelPrivate);
