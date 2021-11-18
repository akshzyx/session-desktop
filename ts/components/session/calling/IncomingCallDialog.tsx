import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';

import styled from 'styled-components';
import _ from 'underscore';
import { useAvatarPath, useConversationUsername } from '../../../hooks/useParamSelector';
import { ed25519Str } from '../../../session/onions/onionPath';
import { CallManager } from '../../../session/utils';
import { getHasIncomingCall, getHasIncomingCallFrom } from '../../../state/selectors/conversations';
import { Avatar, AvatarSize } from '../../Avatar';
import { SessionButton, SessionButtonColor } from '../SessionButton';
import { SessionWrapperModal } from '../SessionWrapperModal';

export const CallWindow = styled.div`
  position: absolute;
  z-index: 9;
  padding: 1rem;
  top: 50vh;
  left: 50vw;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  background-color: var(--color-modal-background);
  border: var(--session-border);
`;

const IncomingCallAvatatContainer = styled.div`
  padding: 0 0 2rem 0;
`;

const timeoutMs = 60000;

export const IncomingCallDialog = () => {
  const hasIncomingCall = useSelector(getHasIncomingCall);
  const incomingCallFromPubkey = useSelector(getHasIncomingCallFrom);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (incomingCallFromPubkey) {
      timeout = global.setTimeout(async () => {
        if (incomingCallFromPubkey) {
          window.log.info(
            `call missed with ${ed25519Str(
              incomingCallFromPubkey
            )} as dialog was not interacted with for ${timeoutMs} ms`
          );
          await CallManager.USER_rejectIncomingCallRequest(incomingCallFromPubkey);
        }
      }, timeoutMs);
    }

    return () => {
      if (timeout) {
        global.clearTimeout(timeout);
      }
    };
  }, [incomingCallFromPubkey]);

  //#region input handlers
  const handleAcceptIncomingCall = async () => {
    if (incomingCallFromPubkey) {
      await CallManager.USER_acceptIncomingCallRequest(incomingCallFromPubkey);
    }
  };

  const handleDeclineIncomingCall = async () => {
    // close the modal
    if (incomingCallFromPubkey) {
      await CallManager.USER_rejectIncomingCallRequest(incomingCallFromPubkey);
    }
  };
  const from = useConversationUsername(incomingCallFromPubkey);
  const incomingAvatar = useAvatarPath(incomingCallFromPubkey);
  if (!hasIncomingCall) {
    return null;
  }

  if (hasIncomingCall) {
    return (
      <SessionWrapperModal title={window.i18n('incomingCallFrom', from)}>
        <IncomingCallAvatatContainer>
          <Avatar
            size={AvatarSize.XL}
            avatarPath={incomingAvatar}
            name={from}
            pubkey={incomingCallFromPubkey}
          />
        </IncomingCallAvatatContainer>
        <div className="session-modal__button-group">
          <SessionButton
            text={window.i18n('decline')}
            buttonColor={SessionButtonColor.Danger}
            onClick={handleDeclineIncomingCall}
          />
          <SessionButton
            text={window.i18n('accept')}
            onClick={handleAcceptIncomingCall}
            buttonColor={SessionButtonColor.Green}
          />
        </div>
      </SessionWrapperModal>
    );
  }
  // display spinner while connecting
  return null;
};
