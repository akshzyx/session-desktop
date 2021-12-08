import classNames from 'classnames';
import React from 'react';
import { SessionInput } from '../basic/SessionInput';
import { MAX_USERNAME_LENGTH } from './RegistrationStages';

const DisplayNameInput = (props: {
  stealAutoFocus?: boolean;
  displayName: string;
  onDisplayNameChanged: (val: string) => any;
  handlePressEnter: () => any;
}) => {
  return (
    // tslint:disable-next-line: use-simple-attributes
    <SessionInput
      autoFocus={props.stealAutoFocus || false}
      label={window.i18n('displayName')}
      type="text"
      placeholder={window.i18n('enterDisplayName')}
      value={props.displayName}
      maxLength={MAX_USERNAME_LENGTH}
      onValueChanged={props.onDisplayNameChanged}
      onEnterPressed={props.handlePressEnter}
      inputDataTestId="display-name-input"
    />
  );
};

const RecoveryPhraseInput = (props: {
  recoveryPhrase: string;
  onSeedChanged: (val: string) => any;
  handlePressEnter: () => any;
  stealAutoFocus?: boolean;
}) => {
  return (
    // tslint:disable-next-line: use-simple-attributes
    <SessionInput
      label={window.i18n('recoveryPhrase')}
      type="password"
      value={props.recoveryPhrase}
      autoFocus={props.stealAutoFocus || false}
      placeholder={window.i18n('enterRecoveryPhrase')}
      enableShowHide={true}
      onValueChanged={props.onSeedChanged}
      onEnterPressed={props.handlePressEnter}
      inputDataTestId="recovery-phrase-input"
    />
  );
};

export interface Props {
  // tslint:disable: react-unused-props-and-state
  showDisplayNameField: boolean;
  showSeedField: boolean;
  stealAutoFocus?: boolean;
  recoveryPhrase?: string;
  displayName: string;
  handlePressEnter: () => any;
  onSeedChanged?: (val: string) => any;
  onDisplayNameChanged: (val: string) => any;
}

export const RegistrationUserDetails = (props: Props) => {
  if (props.showSeedField && (props.recoveryPhrase === undefined || !props.onSeedChanged)) {
    throw new Error('if show seed is true, we need callback + value');
  }
  return (
    <div className={classNames('session-registration__entry-fields')}>
      {props.showSeedField && (
        <RecoveryPhraseInput
          recoveryPhrase={props.recoveryPhrase as string}
          handlePressEnter={props.handlePressEnter}
          onSeedChanged={props.onSeedChanged as any}
          stealAutoFocus={props.stealAutoFocus}
        />
      )}
      <div className="inputfields">
        {props.showDisplayNameField && (
          // tslint:disable-next-line: use-simple-attributes
          <DisplayNameInput
            stealAutoFocus={!props.showSeedField && props.stealAutoFocus}
            displayName={props.displayName}
            handlePressEnter={props.handlePressEnter}
            onDisplayNameChanged={props.onDisplayNameChanged}
          />
        )}
      </div>
    </div>
  );
};
