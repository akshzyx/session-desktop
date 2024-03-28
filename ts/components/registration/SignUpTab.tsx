import React, { useContext, useEffect, useState } from 'react';
import { Flex } from '../basic/Flex';
import { SessionButton } from '../basic/SessionButton';
import { SessionIdEditable } from '../basic/SessionIdEditable';
import { SessionIconButton } from '../icon';
import { RegistrationContext, RegistrationPhase, signUp } from './RegistrationStages';
import { RegistrationUserDetails } from './RegistrationUserDetails';
import { sanitizeDisplayNameOrToast, SignInMode } from './SignInTab';
import { TermsAndConditions } from './TermsAndConditions';
import { Noop } from '../../types/Util';

export enum SignUpMode {
  Default,
  SessionIDShown,
  EnterDetails,
}

const CreateSessionIdButton = ({ createSessionID }: { createSessionID: any }) => {
  return <SessionButton onClick={createSessionID} text={window.i18n('onboardingAccountCreate')} />;
};

const ContinueSignUpButton = ({ continueSignUp }: { continueSignUp: any }) => {
  return <SessionButton onClick={continueSignUp} text={window.i18n('continue')} />;
};

const SignUpDefault = (props: { createSessionID: Noop }) => {
  return (
    <div className="session-registration__content">
      <CreateSessionIdButton createSessionID={props.createSessionID} />
    </div>
  );
};

export const GoBackMainMenuButton = () => {
  const { setRegistrationPhase, setSignInMode, setSignUpMode } = useContext(RegistrationContext);
  return (
    <SessionIconButton
      iconSize="huge"
      iconType="arrow"
      iconPadding="5px"
      onClick={() => {
        setRegistrationPhase(RegistrationPhase.Start);
        setSignInMode(SignInMode.Default);
        setSignUpMode(SignUpMode.Default);
      }}
    />
  );
};

const SignUpSessionIDShown = (props: { continueSignUp: Noop }) => {
  return (
    <div className="session-registration__content">
      <Flex flexDirection="row" container={true} alignItems="center">
        <GoBackMainMenuButton />

        <div className="session-registration__unique-session-id">
          {/** TODO: String localization - remove */}
          {window.i18n('yourUniqueSessionID')}
        </div>
      </Flex>
      <SessionIdEditable editable={false} placeholder={undefined} dataTestId="session-id-signup" />
      {/** TODO: String localization - remove */}
      <div className="session-description-long">{window.i18n('allUsersAreRandomly...')}</div>
      <ContinueSignUpButton continueSignUp={props.continueSignUp} />
      <TermsAndConditions />
    </div>
  );
};

export const SignUpTab = () => {
  const {
    signUpMode,
    setRegistrationPhase,
    generatedRecoveryPhrase,
    hexGeneratedPubKey,
    setSignUpMode,
  } = useContext(RegistrationContext);
  const [displayName, setDisplayName] = useState('');
  const [displayNameError, setDisplayNameError] = useState<undefined | string>('');

  useEffect(() => {
    if (signUpMode === SignUpMode.SessionIDShown) {
      window.Session.setNewSessionID(hexGeneratedPubKey);
    }
  }, [signUpMode, hexGeneratedPubKey]);

  if (signUpMode === SignUpMode.Default) {
    return (
      <SignUpDefault
        createSessionID={() => {
          setSignUpMode(SignUpMode.SessionIDShown);
          setRegistrationPhase(RegistrationPhase.SignUp);
        }}
      />
    );
  }

  if (signUpMode === SignUpMode.SessionIDShown) {
    return (
      <SignUpSessionIDShown
        continueSignUp={() => {
          setSignUpMode(SignUpMode.EnterDetails);
        }}
      />
    );
  }

  // can only be the EnterDetails step

  // Display name is required
  const displayNameOK = !displayNameError && !!displayName;

  const enableCompleteSignUp = displayNameOK;
  const signUpWithDetails = async () => {
    await signUp({
      displayName,
      generatedRecoveryPhrase,
    });
  };

  return (
    <div className="session-registration__content">
      <Flex flexDirection="row" container={true} alignItems="center">
        <GoBackMainMenuButton />
        <Flex className="session-registration__welcome-session" padding="20px">
          {/** TODO: String localization - remove */}
          {window.i18n('welcomeToYourSession')}
        </Flex>
      </Flex>
      <RegistrationUserDetails
        showDisplayNameField={true}
        showSeedField={false}
        displayName={displayName}
        handlePressEnter={signUpWithDetails}
        onDisplayNameChanged={(name: string) => {
          sanitizeDisplayNameOrToast(name, setDisplayName, setDisplayNameError);
        }}
        stealAutoFocus={true}
      />
      <SessionButton
        onClick={signUpWithDetails}
        // TODO: String localization - remove
        text={window.i18n('getStarted')}
        disabled={!enableCompleteSignUp}
      />
      <TermsAndConditions />
    </div>
  );
};
