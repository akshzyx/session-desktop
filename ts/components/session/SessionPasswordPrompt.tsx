import React from 'react';
import classNames from 'classnames';

import { SessionIcon, SessionIconType } from './icon';
import { SessionButton, SessionButtonColor, SessionButtonType } from './SessionButton';
import { Constants } from '../../session';
import { DefaultTheme, withTheme } from 'styled-components';
import autoBind from 'auto-bind';

interface State {
  error: string;
  errorCount: number;
  clearDataView: boolean;
}

export const MAX_LOGIN_TRIES = 3;

class SessionPasswordPromptInner extends React.PureComponent<{ theme: DefaultTheme }, State> {
  private inputRef?: any;

  constructor(props: any) {
    super(props);

    this.state = {
      error: '',
      errorCount: 0,
      clearDataView: false,
    };

    autoBind(this);
  }

  public componentDidMount() {
    console.warn('this.inputRef', this.inputRef);
    setTimeout(() => {
      this.inputRef?.focus();
    }, 100);
  }

  public render() {
    const showResetElements = this.state.errorCount >= MAX_LOGIN_TRIES;

    const wrapperClass = this.state.clearDataView
      ? 'clear-data-wrapper'
      : 'password-prompt-wrapper';
    const containerClass = this.state.clearDataView
      ? 'clear-data-container'
      : 'password-prompt-container';
    const infoAreaClass = this.state.clearDataView ? 'warning-info-area' : 'password-info-area';
    const infoTitle = this.state.clearDataView
      ? window.i18n('clearAllData')
      : window.i18n('passwordViewTitle');
    const buttonGroup = this.state.clearDataView
      ? this.renderClearDataViewButtons()
      : this.renderPasswordViewButtons();
    const featureElement = this.state.clearDataView ? (
      <p className="text-center">{window.i18n('deleteAccountWarning')}</p>
    ) : (
      <input
        id="password-prompt-input"
        type="password"
        defaultValue=""
        placeholder={' '}
        onKeyUp={this.onKeyUp}
        ref={input => {
          this.inputRef = input;
        }}
      />
    );
    const infoIcon = this.state.clearDataView ? (
      <SessionIcon
        iconType={SessionIconType.Warning}
        iconSize={35}
        iconColor="#ce0000"
        theme={this.props.theme}
      />
    ) : (
      <SessionIcon
        iconType={SessionIconType.Lock}
        iconSize={35}
        iconColor={Constants.UI.COLORS.GREEN}
        theme={this.props.theme}
      />
    );
    const errorSection = !this.state.clearDataView && (
      <div className="password-prompt-error-section">
        {this.state.error && (
          <>
            {showResetElements ? (
              <div className="session-label warning">{window.i18n('maxPasswordAttempts')}</div>
            ) : (
              <div className="session-label primary">{this.state.error}</div>
            )}
          </>
        )}
      </div>
    );

    return (
      <div className={wrapperClass}>
        <div className={containerClass}>
          <div className={infoAreaClass}>
            {infoIcon}

            <h1>{infoTitle}</h1>
          </div>

          {featureElement}
          {errorSection}
          {buttonGroup}
        </div>
      </div>
    );
  }

  public async onKeyUp(event: any) {
    switch (event.key) {
      case 'Enter':
        await this.initLogin();
        break;
      default:
    }
    event.preventDefault();
  }

  public async onLogin(passPhrase: string) {
    const passPhraseTrimmed = passPhrase.trim();

    try {
      await window.onLogin(passPhraseTrimmed);
    } catch (error) {
      // Increment the error counter and show the button if necessary
      this.setState({
        errorCount: this.state.errorCount + 1,
      });

      this.setState({ error });
    }
  }

  private async initLogin() {
    const passPhrase = String((this.inputRef as HTMLInputElement).value);
    await this.onLogin(passPhrase);
  }

  private initClearDataView() {
    this.setState({
      error: '',
      errorCount: 0,
      clearDataView: true,
    });
  }

  private renderPasswordViewButtons(): JSX.Element {
    const showResetElements = this.state.errorCount >= MAX_LOGIN_TRIES;

    return (
      <div className={classNames(showResetElements && 'button-group')}>
        {showResetElements && (
          <>
            <SessionButton
              text="Reset Database"
              buttonType={SessionButtonType.BrandOutline}
              buttonColor={SessionButtonColor.Danger}
              onClick={this.initClearDataView}
            />
          </>
        )}
        <SessionButton
          text={window.i18n('unlock')}
          buttonType={SessionButtonType.BrandOutline}
          buttonColor={SessionButtonColor.Green}
          onClick={this.initLogin}
        />
      </div>
    );
  }

  private renderClearDataViewButtons(): JSX.Element {
    return (
      <div className="button-group">
        <SessionButton
          text={window.i18n('cancel')}
          buttonType={SessionButtonType.Default}
          buttonColor={SessionButtonColor.Primary}
          onClick={() => {
            this.setState({ clearDataView: false });
          }}
        />

        <SessionButton
          text={window.i18n('clearAllData')}
          buttonType={SessionButtonType.Default}
          buttonColor={SessionButtonColor.Danger}
          onClick={window.clearLocalData}
        />
      </div>
    );
  }
}

export const SessionPasswordPrompt = withTheme(SessionPasswordPromptInner);
