import React from 'react';

import { SessionModal } from './SessionModal';
import { SessionButton } from './SessionButton';
import { ToastUtils } from '../../session/utils';
import { DefaultTheme, withTheme } from 'styled-components';
import { PasswordUtil } from '../../util';

interface Props {
  onClose: any;
  theme: DefaultTheme;
}

interface State {
  error: string;
  loadingPassword: boolean;
  loadingSeed: boolean;
  recoveryPhrase: string;
  hasPassword: boolean | null;
  passwordHash: string;
  passwordValid: boolean;
}

class SessionSeedModalInner extends React.Component<Props, State> {
  constructor(props: any) {
    super(props);

    this.state = {
      error: '',
      loadingPassword: true,
      loadingSeed: true,
      recoveryPhrase: '',
      hasPassword: null,
      passwordHash: '',
      passwordValid: false,
    };

    this.copyRecoveryPhrase = this.copyRecoveryPhrase.bind(this);
    this.getRecoveryPhrase = this.getRecoveryPhrase.bind(this);
    this.confirmPassword = this.confirmPassword.bind(this);
    this.checkHasPassword = this.checkHasPassword.bind(this);
    this.onEnter = this.onEnter.bind(this);
  }

  public componentDidMount() {
    setTimeout(() => ($('#seed-input-password') as any).focus(), 100);
  }

  public render() {
    const i18n = window.i18n;

    this.checkHasPassword();
    this.getRecoveryPhrase().ignore();

    const { onClose } = this.props;
    const { hasPassword, passwordValid } = this.state;
    const loading = this.state.loadingPassword || this.state.loadingSeed;

    return (
      <>
        {!loading && (
          <SessionModal
            title={i18n('showRecoveryPhrase')}
            onClose={onClose}
            theme={this.props.theme}
          >
            <div className="spacer-sm" />

            {hasPassword && !passwordValid ? (
              <>{this.renderPasswordView()}</>
            ) : (
              <>{this.renderSeedView()}</>
            )}
          </SessionModal>
        )}
      </>
    );
  }

  private renderPasswordView() {
    const maxPasswordLen = 64;
    const error = this.state.error;
    const i18n = window.i18n;
    const { onClose } = this.props;

    return (
      <>
        <p>{i18n('showRecoveryPhrasePasswordRequest')}</p>
        <input
          type="password"
          id="seed-input-password"
          placeholder={i18n('password')}
          onKeyUp={this.onEnter}
          maxLength={maxPasswordLen}
        />

        {error && (
          <>
            <div className="spacer-xs" />
            <div className="session-label danger">{error}</div>
          </>
        )}

        <div className="spacer-lg" />

        <div className="session-modal__button-group">
          <SessionButton text={i18n('ok')} onClick={this.confirmPassword} />

          <SessionButton text={i18n('cancel')} onClick={onClose} />
        </div>
      </>
    );
  }

  private renderSeedView() {
    const i18n = window.i18n;

    return (
      <>
        <div className="session-modal__centered text-center">
          <p className="session-modal__description">
            {i18n('recoveryPhraseSavePromptMain')}
          </p>
          <div className="spacer-xs" />

          <i className="session-modal__text-highlight">
            {this.state.recoveryPhrase}
          </i>
        </div>
        <div className="spacer-lg" />

        <div className="session-modal__button-group">
          <SessionButton
            text={i18n('copy')}
            onClick={() => {
              this.copyRecoveryPhrase(this.state.recoveryPhrase);
            }}
          />
        </div>
      </>
    );
  }

  private confirmPassword() {
    const passwordHash = this.state.passwordHash;
    const passwordValue = jQuery('#seed-input-password').val();
    const isPasswordValid = PasswordUtil.matchesHash(
      passwordValue as string,
      passwordHash
    );

    if (!passwordValue) {
      this.setState({
        error: window.i18n('noGivenPassword'),
      });

      return false;
    }

    if (passwordHash && !isPasswordValid) {
      this.setState({
        error: window.i18n('invalidPassword'),
      });

      return false;
    }

    this.setState({
      passwordValid: true,
      error: '',
    });

    window.removeEventListener('keyup', this.onEnter);

    return true;
  }

  private checkHasPassword() {
    if (!this.state.loadingPassword) {
      return;
    }

    const hashPromise = window.Signal.Data.getPasswordHash();

    hashPromise.then((hash: any) => {
      this.setState({
        hasPassword: !!hash,
        passwordHash: hash,
        loadingPassword: false,
      });
    });
  }

  private async getRecoveryPhrase() {
    if (this.state.recoveryPhrase) {
      return false;
    }

    const manager = await window.getAccountManager();
    const recoveryPhrase = manager.getCurrentRecoveryPhrase();

    this.setState({
      recoveryPhrase,
      loadingSeed: false,
    });

    return true;
  }

  private copyRecoveryPhrase(recoveryPhrase: string) {
    window.clipboard.writeText(recoveryPhrase);

    ToastUtils.pushCopiedToClipBoard();
    this.props.onClose();
  }

  private onEnter(event: any) {
    if (event.key === 'Enter') {
      this.confirmPassword();
    }
  }
}

export const SessionSeedModal = withTheme(SessionSeedModalInner);
