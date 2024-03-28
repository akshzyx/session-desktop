import React, { ReactElement, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { Data } from '../../../../data/data';
import { PubKey } from '../../../../session/types/PubKey';
import { isDarkTheme } from '../../../../state/selectors/theme';
import { LocalizerToken } from '../../../../types/Localizer';
import { nativeEmojiData } from '../../../../util/emoji';
import { findAndFormatContact } from '../../../../models/message';

export type TipPosition = 'center' | 'left' | 'right';

export const POPUP_WIDTH = 216; // px

export const StyledPopupContainer = styled.div<{ tooltipPosition: TipPosition }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: ${POPUP_WIDTH}px;
  height: 72px;
  z-index: 5;

  background-color: var(--message-bubbles-received-background-color);
  color: var(--message-bubbles-received-text-color);
  box-shadow: 0px 0px 13px rgba(0, 0, 0, 0.51);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: break-word;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;

  &:after {
    content: '';
    position: absolute;
    top: calc(100% - 19px);
    left: ${props => {
      switch (props.tooltipPosition) {
        case 'left':
          return '24px';
        case 'right':
          return 'calc(100% - 78px)';
        case 'center':
        default:
          return 'calc(100% - 118px)';
      }
    }};
    width: 22px;
    height: 22px;
    background-color: var(--message-bubbles-received-background-color);
    transform: rotate(45deg);
    border-radius: 3px;
    transform: scaleY(1.4) rotate(45deg);
    clip-path: polygon(100% 100%, 7.2px 100%, 100% 7.2px);
  }
`;

const StyledEmoji = styled.span`
  font-size: 36px;
  margin-left: 8px;
`;

const StyledContacts = styled.span`
  word-break: break-all;
  span {
    word-break: keep-all;
  }
`;

const StyledOthers = styled.span<{ darkMode: boolean }>`
  color: ${props => (props.darkMode ? 'var(--primary-color)' : 'var(--text-primary-color)')};
`;

const generateContactsString = async (
  messageId: string,
  senders: Array<string>
): Promise<Array<string> | null> => {
  let results = [];
  const message = await Data.getMessageById(messageId);
  if (message) {
    let meIndex = -1;
    results = senders.map((sender, index) => {
      const contact = findAndFormatContact(sender);
      if (contact.isMe) {
        meIndex = index;
      }
      return contact?.profileName || contact?.name || PubKey.shorten(sender);
    });
    if (meIndex >= 0) {
      results.splice(meIndex, 1);
      results = [window.i18n('onionRoutingPathYou'), ...results];
    }
    if (results && results.length > 0) {
      return results;
    }
  }
  return null;
};

const Contacts = (contacts: Array<string>, count: number) => {
  const darkMode = useSelector(isDarkTheme);

  if (!(contacts?.length > 0)) {
    return null;
  }

  const reactors = contacts.length;

  let reactionPopupKey: LocalizerToken;
  switch (reactors) {
    case 1:
      reactionPopupKey = 'reactionPopupOne';
      break;
    case 2:
      reactionPopupKey = 'reactionPopupTwo';
      break;
    case 3:
      reactionPopupKey = 'reactionPopupThree';
      break;
    default:
      reactionPopupKey = 'reactionPopupMany';
  }

  return (
    <StyledContacts>
      {window.i18n(reactionPopupKey, {
        name: contacts[0],
        name2: contacts[1],
        name3: contacts[2],
      })}{' '}
      {reactors > 3 ? (
        <StyledOthers darkMode={darkMode}>
          {window.i18n(reactors === 4 ? 'otherSingular' : 'otherPlural', {
            number: `${count - 3}`,
          })}
        </StyledOthers>
      ) : null}
      <span>{window.i18n('reactionPopup')}</span>
    </StyledContacts>
  );
};

type Props = {
  messageId: string;
  emoji: string;
  count: number;
  senders: Array<string>;
  tooltipPosition?: TipPosition;
  onClick: (...args: Array<any>) => void;
};

export const ReactionPopup = (props: Props): ReactElement => {
  const { messageId, emoji, count, senders, tooltipPosition = 'center', onClick } = props;

  const [contacts, setContacts] = useState<Array<string>>([]);

  useEffect(() => {
    let isCancelled = false;
    // eslint-disable-next-line more/no-then
    generateContactsString(messageId, senders)
      .then(async results => {
        if (isCancelled) {
          return;
        }
        if (results) {
          setContacts(results);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [count, messageId, senders]);

  return (
    <StyledPopupContainer tooltipPosition={tooltipPosition} onClick={onClick}>
      {Contacts(contacts, count)}
      <StyledEmoji role={'img'} aria-label={nativeEmojiData?.ariaLabels?.[emoji]}>
        {emoji}
      </StyledEmoji>
    </StyledPopupContainer>
  );
};
