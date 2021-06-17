import React from 'react';
import { DefaultTheme } from 'styled-components';
import { ConversationModel } from '../../models/conversation';
import { ApiV2 } from '../../opengroup/opengroupV2';
import { ConversationController } from '../../session/conversations';
import { PubKey } from '../../session/types';
import { ToastUtils } from '../../session/utils';
import { Flex } from '../basic/Flex';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../session/SessionButton';
import { ContactType, SessionMemberListItem } from '../session/SessionMemberListItem';
import { SessionModal } from '../session/SessionModal';
import { SessionSpinner } from '../session/SessionSpinner';
import _ from 'lodash';
import { SessionWrapperModal } from '../session/SessionWrapperModal';
interface Props {
  convo: ConversationModel;
  onClose: any;
  theme: DefaultTheme;
}

interface State {
  modList: Array<ContactType>;
  removingInProgress: boolean;
  firstLoading: boolean;
}

export class RemoveModeratorsDialog extends React.Component<Props, State> {
  constructor(props: any) {
    super(props);

    this.onModClicked = this.onModClicked.bind(this);
    this.closeDialog = this.closeDialog.bind(this);
    this.removeThem = this.removeThem.bind(this);

    this.state = {
      modList: [],
      removingInProgress: false,
      firstLoading: true,
    };
  }

  public componentDidMount() {
    this.refreshModList();
  }

  public render() {
    const { i18n } = window;
    const { removingInProgress, firstLoading } = this.state;
    const hasMods = this.state.modList.length !== 0;

    const chatName = this.props.convo.get('name');

    const title = `${i18n('removeModerators')}: ${chatName}`;

    const renderContent = !firstLoading;

    return (
      <SessionWrapperModal title={title} onClose={this.closeDialog} theme={this.props.theme}>
        <Flex container={true} flexDirection="column" alignItems="center">
          {renderContent && (
            <>
              <p>Existing moderators:</p>
              <div className="contact-selection-list">{this.renderMemberList()}</div>

              {hasMods ? null : <p>{i18n('noModeratorsToRemove')}</p>}
              <SessionSpinner loading={removingInProgress} />

              <div className="session-modal__button-group">
                <SessionButton
                  buttonType={SessionButtonType.Brand}
                  buttonColor={SessionButtonColor.Green}
                  onClick={this.removeThem}
                  disabled={removingInProgress}
                  text={i18n('ok')}
                />
                <SessionButton
                  buttonType={SessionButtonType.Brand}
                  buttonColor={SessionButtonColor.Primary}
                  onClick={this.closeDialog}
                  disabled={removingInProgress}
                  text={i18n('cancel')}
                />
              </div>
            </>
          )}

          <SessionSpinner loading={firstLoading} />
        </Flex>
      </SessionWrapperModal>
    );
  }

  private closeDialog() {
    this.props.onClose();
  }

  private renderMemberList() {
    const members = this.state.modList;
    const selectedContacts = members.filter(d => d.checkmarked).map(d => d.id);

    return members.map((member: ContactType, index: number) => (
      <SessionMemberListItem
        member={member}
        key={index}
        index={index}
        isSelected={selectedContacts.some(m => m === member.id)}
        onSelect={(selectedMember: ContactType) => {
          this.onModClicked(selectedMember);
        }}
        onUnselect={(selectedMember: ContactType) => {
          this.onModClicked(selectedMember);
        }}
        theme={this.props.theme}
      />
    ));
  }

  private onModClicked(selected: ContactType) {
    const updatedContacts = this.state.modList.map(member => {
      if (member.id === selected.id) {
        return { ...member, checkmarked: !member.checkmarked };
      } else {
        return member;
      }
    });

    this.setState(state => {
      return {
        ...state,
        modList: updatedContacts,
      };
    });
  }

  private refreshModList() {
    let modPubKeys: Array<string> = [];
    modPubKeys = this.props.convo.getGroupAdmins() || [];

    const convos = ConversationController.getInstance().getConversations();
    const moderatorsConvos = modPubKeys
      .map(
        pubKey =>
          convos.find(c => c.id === pubKey) || {
            id: pubKey, // memberList need a key
            authorPhoneNumber: pubKey,
          }
      )
      .filter(c => !!c);

    const mods = moderatorsConvos.map((d: any) => {
      let name = '';
      if (d.getLokiProfile) {
        const lokiProfile = d.getLokiProfile();
        name = lokiProfile ? lokiProfile.displayName : 'Anonymous';
      }
      // TODO: should take existing members into account
      const existingMember = false;

      return {
        id: d.id,
        authorPhoneNumber: d.id,
        authorProfileName: name,
        selected: false,
        authorAvatarPath: '',
        authorName: name,
        checkmarked: true,
        existingMember,
      };
    });
    this.setState({
      modList: mods,
      firstLoading: false,
      removingInProgress: false,
    });
  }

  private async removeThem() {
    const removedMods = this.state.modList.filter(d => !d.checkmarked).map(d => d.id);

    if (removedMods.length === 0) {
      window?.log?.info('No moderators removed. Nothing todo');
      return;
    }
    window?.log?.info(`asked to remove moderator: ${removedMods}`);

    try {
      this.setState({
        removingInProgress: true,
      });
      let res;
      const roomInfos = this.props.convo.toOpenGroupV2();
      const modsToRemove = _.compact(removedMods.map(m => PubKey.from(m)));
      res = await Promise.all(
        modsToRemove.map(async m => {
          return ApiV2.removeModerator(m, roomInfos);
        })
      );
      // all moderators are removed means all promise resolved with bool= true
      res = res.every(r => !!r);

      if (!res) {
        window?.log?.warn('failed to remove moderators:', res);

        ToastUtils.pushUserNeedsToHaveJoined();
      } else {
        window?.log?.info(`${removedMods} removed from moderators...`);
        ToastUtils.pushUserRemovedFromModerators();
      }
    } catch (e) {
      window?.log?.error('Got error while adding moderator:', e);
    } finally {
      this.refreshModList();
    }
  }
}
