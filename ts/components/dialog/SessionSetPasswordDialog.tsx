/* eslint-disable @typescript-eslint/no-misused-promises */

import autoBind from 'auto-bind';
import { Component } from 'react';
import { ToastUtils } from '../../session/utils';
import { sessionPassword } from '../../state/ducks/modalDialog';
import { LocalizerKeys } from '../../types/LocalizerKeys';
import type { PasswordAction } from '../../types/ReduxTypes';
import { LocalizerToken } from '../../types/Localizer';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SessionWrapperModal } from '../SessionWrapperModal';
import { matchesHash, validatePassword } from '../../util/passwordUtils';
import { assertUnreachable } from '../../types/sqlSharedTypes';
import { matchesHash, validatePassword } from '../../util/passwordUtils';
import { getPasswordHash } from '../../util/storage';
import { SessionWrapperModal } from '../SessionWrapperModal';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SpacerSM } from '../basic/Text';

interface Props {
  passwordAction: PasswordAction;
  onOk: () => void;
}

interface State {
  error: string | null;
  currentPasswordEntered: string | null;
  currentPasswordConfirmEntered: string | null;
  currentPasswordRetypeEntered: string | null;
}

export class SessionSetPasswordDialog extends Component<Props, State> {
  private passportInput: HTMLInputElement | null = null;

  constructor(props: any) {
    super(props);

    this.state = {
      error: null,
      currentPasswordEntered: null,
      currentPasswordConfirmEntered: null,
      currentPasswordRetypeEntered: null,
    };

    autoBind(this);
  }

  public componentDidMount() {
    document.addEventListener('keyup', this.onEnterPressed);

    setTimeout(() => {
      this.passportInput?.focus();
    }, 1);
  }

  public componentWillUnmount() {
    document.removeEventListener('keyup', this.onEnterPressed);
  }

  public render() {
    const { passwordAction } = this.props;
    let placeholders: Array<string> = [];
    switch (passwordAction) {
      case 'change':
        placeholders = [
          window.i18n('passwordEnterCurrent'),
          window.i18n('passwordEnterNew'),
          window.i18n('passwordConfirm'),
        ];
        break;
      case 'remove':
        placeholders = [window.i18n('passwordCreate')];
        break;
      case 'enter':
        placeholders = [window.i18n('passwordCreate')];
        break;
      default:
        placeholders = [window.i18n('createPassword'), window.i18n('passwordConfirm')];
    }

    const confirmButtonText =
      passwordAction === 'remove' ? window.i18n('remove') : window.i18n('done');
    // do this separately so typescript's compiler likes it
    const localizedKeyAction: LocalizerToken =
      passwordAction === 'change'
        ? 'passwordChange'
        : passwordAction === 'remove'
        ? 'passwordRemove'
        : passwordAction === 'enter'
        ? 'passwordEnter'
        : 'passwordSet';

    return (
      <SessionWrapperModal title={window.i18n(localizedKeyAction)} onClose={this.closeDialog}>
        <SpacerSM />

        <div className="session-modal__input-group">
          <input
            type="password"
            id="password-modal-input"
            ref={input => {
              this.passportInput = input;
            }}
            placeholder={placeholders[0]}
            onChange={this.onPasswordInput}
            onPaste={this.onPasswordInput}
            data-testid="password-input"
          />
          {passwordAction !== 'enter' && passwordAction !== 'remove' && (
            <input
              type="password"
              id="password-modal-input-confirm"
              placeholder={placeholders[1]}
              onChange={this.onPasswordConfirmInput}
              onPaste={this.onPasswordConfirmInput}
              data-testid="password-input-confirm"
            />
          )}
          {passwordAction === 'change' && (
            <input
              type="password"
              id="password-modal-input-reconfirm"
              placeholder={placeholders[2]}
              onPaste={this.onPasswordRetypeInput}
              onChange={this.onPasswordRetypeInput}
              data-testid="password-input-reconfirm"
            />
          )}
        </div>

        <SpacerSM />

        <div className="session-modal__button-group">
          <SessionButton
            text={confirmButtonText}
            buttonColor={passwordAction === 'remove' ? SessionButtonColor.Danger : undefined}
            buttonType={SessionButtonType.Simple}
            onClick={this.setPassword}
          />
          {passwordAction !== 'enter' && (
            <SessionButton
              text={window.i18n('cancel')}
              buttonColor={passwordAction !== 'remove' ? SessionButtonColor.Danger : undefined}
              buttonType={SessionButtonType.Simple}
              onClick={this.closeDialog}
            />
          )}
        </div>
      </SessionWrapperModal>
    );
  }

  public validatePasswordHash(password: string | null) {
    // Check if the password matches the hash we have stored
    const hash = getPasswordHash();
    if (hash && !matchesHash(password, hash)) {
      return false;
    }

    return true;
  }

  private showError() {
    if (this.state.error) {
      ToastUtils.pushToastError('enterPasswordErrorToast', this.state.error);
    }
  }

  /**
   * Returns false and set the state error field in the input is not a valid password
   * or returns true
   */
  private validatePassword(firstPassword: string) {
    // if user did not fill the first password field, we can't do anything
    const errorFirstInput = validatePassword(firstPassword);
    if (errorFirstInput !== null) {
      this.setState({
        error: errorFirstInput,
      });
      this.showError();
      return false;
    }
    return true;
  }

  private async handleActionSet(enteredPassword: string, enteredPasswordConfirm: string) {
    // be sure both password are valid
    if (!this.validatePassword(enteredPassword)) {
      return;
    }
    // no need to validate second password. we just need to check that enteredPassword is valid, and that both password matches

    if (enteredPassword !== enteredPasswordConfirm) {
      this.setState({
        error: window.i18n('passwordErrorMatch'),
      });
      this.showError();
      return;
    }
    await window.setPassword(enteredPassword, null);
    ToastUtils.pushToastSuccess(
      'setPasswordSuccessToast',
      window.i18n('passwordSet'),
      window.i18n('passwordSetDescription')
    );

    this.props.onOk();
    this.closeDialog();
  }

  private async handleActionChange(
    oldPassword: string,
    newPassword: string,
    newConfirmedPassword: string
  ) {
    // We don't validate oldPassword on change: this is validate on the validatePasswordHash below
    // we only validate the newPassword here
    if (!this.validatePassword(newPassword)) {
      return;
    }

    // Check the retyped password matches the new password
    if (newPassword !== newConfirmedPassword) {
      this.setState({
        error: window.i18n('passwordErrorMatch'),
      });
      this.showError();
      return;
    }

    const isValidWithStoredInDB = this.validatePasswordHash(oldPassword);
    if (!isValidWithStoredInDB) {
      this.setState({
        error: window.i18n('passwordCurrentIncorrect'),
      });
      this.showError();
      return;
    }
    await window.setPassword(newPassword, oldPassword);

    ToastUtils.pushToastSuccess(
      'setPasswordSuccessToast',
      window.i18n('passwordChangedDescription')
    );

    this.props.onOk();
    this.closeDialog();
  }

  private async handleActionRemove(oldPassword: string) {
    // We don't validate oldPassword on change: this is validate on the validatePasswordHash below
    const isValidWithStoredInDB = this.validatePasswordHash(oldPassword);
    if (!isValidWithStoredInDB) {
      this.setState({
        error: window.i18n('passwordIncorrect'),
      });
      this.showError();
      return;
    }
    await window.setPassword(null, oldPassword);

    ToastUtils.pushToastWarning(
      'setPasswordSuccessToast',
      window.i18n('passwordRemovedDescription')
    );

    this.props.onOk();
    this.closeDialog();
  }

  private async onEnterPressed(event: any) {
    if (event.key === 'Enter') {
      event.stopPropagation();
      await this.setPassword();
    }
  }

  private async handleActionEnter(enteredPassword: string) {
    // be sure the password is valid
    if (!this.validatePassword(enteredPassword)) {
      return;
    }

    const isValidWithStoredInDB = this.validatePasswordHash(enteredPassword);
    if (!isValidWithStoredInDB) {
      this.setState({
        error: window.i18n('passwordIncorrect'),
      });
      this.showError();
      return;
    }

    this.props.onOk();
    this.closeDialog();
  }

  private async setPassword() {
    const { passwordAction } = this.props;
    const { currentPasswordEntered, currentPasswordConfirmEntered, currentPasswordRetypeEntered } =
      this.state;

    // Trim leading / trailing whitespace for UX
    const firstPasswordEntered = (currentPasswordEntered || '').trim();
    const secondPasswordEntered = (currentPasswordConfirmEntered || '').trim();
    const thirdPasswordEntered = (currentPasswordRetypeEntered || '').trim();

    switch (passwordAction) {
      case 'set': {
        await this.handleActionSet(firstPasswordEntered, secondPasswordEntered);
        return;
      }
      case 'change': {
        await this.handleActionChange(
          firstPasswordEntered,
          secondPasswordEntered,
          thirdPasswordEntered
        );
        return;
      }
      case 'remove': {
        await this.handleActionRemove(firstPasswordEntered);
        return;
      }
      case 'enter': {
        await this.handleActionEnter(firstPasswordEntered);
        return;
      }
      default:
        assertUnreachable(passwordAction, 'passwordAction');
    }
  }

  private closeDialog() {
    window.inboxStore?.dispatch(sessionPassword(null));
  }

  private onPasswordInput(event: any) {
    const currentPasswordEntered = event.target.value;
    this.setState({ currentPasswordEntered });
  }

  private onPasswordConfirmInput(event: any) {
    const currentPasswordConfirmEntered = event.target.value;
    this.setState({ currentPasswordConfirmEntered });
  }

  private onPasswordRetypeInput(event: any) {
    const currentPasswordRetypeEntered = event.target.value;
    this.setState({ currentPasswordRetypeEntered });
  }
}
