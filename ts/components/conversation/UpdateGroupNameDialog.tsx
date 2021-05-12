import React from 'react';
import classNames from 'classnames';

import { SessionModal } from '../session/SessionModal';
import { SessionButton, SessionButtonColor } from '../session/SessionButton';
import { Avatar, AvatarSize } from '../Avatar';
import { DefaultTheme, withTheme } from 'styled-components';

interface Props {
  titleText: string;
  pubkey: string;
  isPublic: boolean;
  groupName: string;
  okText: string;
  cancelText: string;
  isAdmin: boolean;
  i18n: any;
  onSubmit: any;
  onClose: any;
  // avatar stuff
  avatarPath: string;
  theme: DefaultTheme;
}

interface State {
  groupName: string;
  errorDisplayed: boolean;
  errorMessage: string;
  avatar: string;
}

class UpdateGroupNameDialogInner extends React.Component<Props, State> {
  private readonly inputEl: any;

  constructor(props: any) {
    super(props);

    this.onClickOK = this.onClickOK.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.closeDialog = this.closeDialog.bind(this);
    this.onFileSelected = this.onFileSelected.bind(this);
    this.onGroupNameChanged = this.onGroupNameChanged.bind(this);

    this.state = {
      groupName: this.props.groupName,
      errorDisplayed: false,
      errorMessage: 'placeholder',
      avatar: this.props.avatarPath,
    };
    this.inputEl = React.createRef();
    window.addEventListener('keyup', this.onKeyUp);
  }

  public onClickOK() {
    const { i18n, onSubmit } = this.props;
    if (!this.state.groupName.trim()) {
      this.onShowError(i18n('emptyGroupNameError'));

      return;
    }

    const avatar = this?.inputEl?.current?.files?.length > 0 ? this.inputEl.current.files[0] : null; // otherwise use the current avatar

    onSubmit(this.state.groupName, avatar);

    this.closeDialog();
  }

  public render() {
    const { okText, cancelText } = this.props;

    const titleText = `${this.props.titleText}`;

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
        {this.renderAvatar()}
        <div className="spacer-md" />

        <input
          type="text"
          className="profile-name-input"
          value={this.state.groupName}
          placeholder={this.props.i18n('groupNamePlaceholder')}
          onChange={this.onGroupNameChanged}
          tabIndex={0}
          required={true}
          aria-required={true}
          autoFocus={true}
          disabled={!this.props.isAdmin}
        />

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

  private onShowError(msg: string) {
    if (this.state.errorDisplayed) {
      return;
    }

    this.setState({
      errorDisplayed: true,
      errorMessage: msg,
    });

    setTimeout(() => {
      this.setState({
        errorDisplayed: false,
      });
    }, 3000);
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

  private closeDialog() {
    window.removeEventListener('keyup', this.onKeyUp);

    this.props.onClose();
  }

  private onGroupNameChanged(event: any) {
    const groupName = event.target.value;
    this.setState(state => {
      return {
        ...state,
        groupName,
      };
    });
  }

  private renderAvatar() {
    const avatarPath = this.state.avatar;
    const isPublic = this.props.isPublic;

    if (!isPublic) {
      return undefined;
    }

    return (
      <div className="avatar-center">
        <div className="avatar-center-inner">
          <Avatar avatarPath={avatarPath} size={AvatarSize.XL} pubkey={this.props.pubkey} />
          <div
            className="image-upload-section"
            role="button"
            onClick={() => {
              const el = this.inputEl.current;
              if (el) {
                el.click();
              }
            }}
          />
          <input
            type="file"
            ref={this.inputEl}
            className="input-file"
            placeholder="input file"
            name="name"
            onChange={this.onFileSelected}
          />
        </div>
      </div>
    );
  }

  private onFileSelected() {
    const file = this.inputEl.current.files[0];
    const url = window.URL.createObjectURL(file);

    this.setState({
      avatar: url,
    });
  }
}

export const UpdateGroupNameDialog = withTheme(UpdateGroupNameDialogInner);
