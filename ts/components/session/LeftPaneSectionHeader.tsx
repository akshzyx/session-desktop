import React from 'react';
import styled from 'styled-components';
import { SessionButton, SessionButtonType } from './SessionButton';
import { useDispatch, useSelector } from 'react-redux';
import { disableRecoveryPhrasePrompt } from '../../state/ducks/userConfig';
import { getShowRecoveryPhrasePrompt } from '../../state/selectors/userConfig';
import { recoveryPhraseModal } from '../../state/ducks/modalDialog';
import { Flex } from '../basic/Flex';
import { getFocusedSection } from '../../state/selectors/section';
import { SectionType } from '../../state/ducks/section';
import { UserUtils } from '../../session/utils';
import { SessionIcon } from './icon';

const SectionTitle = styled.h1`
  padding: 0 var(--margins-sm);
  flex-grow: 1;
  color: var(--color-text);
`;

export const LeftPaneSectionHeader = (props: { buttonClicked?: any }) => {
  const showRecoveryPhrasePrompt = useSelector(getShowRecoveryPhrasePrompt);
  const focusedSection = useSelector(getFocusedSection);

  let label: string | undefined;

  const isMessageSection = focusedSection === SectionType.Message;

  switch (focusedSection) {
    case SectionType.Contact:
      label = window.i18n('contactsHeader');
      break;
    case SectionType.Settings:
      label = window.i18n('settingsHeader');
      break;
    case SectionType.Message:
      label = window.i18n('messagesHeader');
      break;
    default:
  }

  return (
    <Flex flexDirection="column">
      <div className="module-left-pane__header">
        <SectionTitle>{label}</SectionTitle>
        {isMessageSection && (
          <SessionButton onClick={props.buttonClicked}>
            <SessionIcon iconType="plus" iconSize="small" iconColor="white" />
          </SessionButton>
        )}
      </div>
      {showRecoveryPhrasePrompt && <LeftPaneBanner />}
    </Flex>
  );
};

const BannerInner = () => {
  const dispatch = useDispatch();

  const showRecoveryPhraseModal = () => {
    dispatch(disableRecoveryPhrasePrompt());
    dispatch(recoveryPhraseModal({}));
  };

  return (
    <StyledBannerInner>
      <p>{window.i18n('recoveryPhraseRevealMessage')}</p>
      <SessionButton
        buttonType={SessionButtonType.Default}
        text={window.i18n('recoveryPhraseRevealButtonText')}
        onClick={showRecoveryPhraseModal}
        dataTestId="reveal-recovery-phrase"
      />
    </StyledBannerInner>
  );
};

export const LeftPaneBanner = () => {
  const section = useSelector(getFocusedSection);
  const isSignInWithRecoveryPhrase = UserUtils.isSignWithRecoveryPhrase();

  if (section !== SectionType.Message || isSignInWithRecoveryPhrase) {
    return null;
  }

  return (
    <StyledLeftPaneBanner>
      <StyledProgressBarContainer>
        <StyledProgressBarInner />
      </StyledProgressBarContainer>
      <StyledBannerTitle>
        {window.i18n('recoveryPhraseSecureTitle')} <span>90%</span>
      </StyledBannerTitle>
      <Flex flexDirection="column" justifyContent="space-between" padding={'var(--margins-sm)'}>
        <BannerInner />
      </Flex>
    </StyledLeftPaneBanner>
  );
};

const StyledProgressBarContainer = styled.div`
  width: 100%;
  height: 5px;
  flex-direction: row;
  background: var(--color-session-border);
`;

const StyledProgressBarInner = styled.div`
  background: var(--color-accent);
  width: 90%;
  transition: width 0.5s ease-in;
  height: 100%;
`;

export const StyledBannerTitle = styled.div`
  line-height: 1.3;
  font-size: var(--font-size-md);
  font-weight: bold;
  margin: var(--margins-sm) var(--margins-sm) 0 var(--margins-sm);

  span {
    color: var(--color-text-accent);
  }
`;

export const StyledLeftPaneBanner = styled.div`
  background: var(--color-recovery-phrase-banner-background);
  display: flex;
  flex-direction: column;
  border-bottom: var(--session-border);
`;

const StyledBannerInner = styled.div`
  p {
    margin: 0;
  }

  .left-pane-banner___phrase {
    margin-top: var(--margins-md);
  }

  .session-button {
    margin-top: var(--margins-sm);
  }
`;
