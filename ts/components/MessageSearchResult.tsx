import React from 'react';
import classNames from 'classnames';

import { Avatar, AvatarSize } from './Avatar';
import { MessageBodyHighlight } from './MessageBodyHighlight';
import { Timestamp } from './conversation/Timestamp';
import { ContactName } from './conversation/ContactName';

import { LocalizerType } from '../types/Util';
import { DefaultTheme, withTheme } from 'styled-components';

export type MessageSearchResultProps = {
  id: string;
  conversationId: string;
  receivedAt: number;

  snippet: string;

  from: {
    phoneNumber: string;
    isMe?: boolean;
    name?: string;
    color?: string;
    profileName?: string;
    avatarPath?: string;
  };

  to: {
    groupName?: string;
    phoneNumber: string;
    isMe?: boolean;
    name?: string;
    profileName?: string;
  };
};

type PropsHousekeeping = {
  isSelected?: boolean;
  theme: DefaultTheme;
  i18n: LocalizerType;
  onClick: (conversationId: string, messageId?: string) => void;
};

type Props = MessageSearchResultProps & PropsHousekeeping;

class MessageSearchResultInner extends React.PureComponent<Props> {
  public renderFromName() {
    const { from, i18n, to } = this.props;

    if (from.isMe && to.isMe) {
      return (
        <span className="module-message-search-result__header__name">{i18n('noteToSelf')}</span>
      );
    }
    if (from.isMe) {
      return <span className="module-message-search-result__header__name">{i18n('you')}</span>;
    }

    return (
      <ContactName
        phoneNumber={from.phoneNumber}
        name={from.name}
        profileName={from.profileName}
        i18n={i18n}
        module="module-message-search-result__header__name"
        shouldShowPubkey={false}
      />
    );
  }

  public renderFrom() {
    const { i18n, to } = this.props;
    const fromName = this.renderFromName();

    if (!to.isMe) {
      return (
        <div className="module-message-search-result__header__from">
          {fromName} {i18n('to')}{' '}
          <span className="module-mesages-search-result__header__group">
            <ContactName
              phoneNumber={to.phoneNumber}
              name={to.name}
              profileName={to.profileName}
              i18n={i18n}
              shouldShowPubkey={false}
            />
          </span>
        </div>
      );
    }

    return <div className="module-message-search-result__header__from">{fromName}</div>;
  }

  public renderAvatar() {
    const { from } = this.props;
    const userName = from.profileName || from.phoneNumber;

    return (
      <Avatar
        avatarPath={from.avatarPath}
        name={userName}
        size={AvatarSize.S}
        pubkey={from.phoneNumber}
      />
    );
  }

  public render() {
    const {
      from,
      i18n,
      id,
      isSelected,
      conversationId,
      onClick,
      receivedAt,
      snippet,
      to,
    } = this.props;

    if (!from || !to) {
      return null;
    }

    return (
      <div
        role="button"
        onClick={() => {
          if (onClick) {
            onClick(conversationId, id);
          }
        }}
        className={classNames(
          'module-message-search-result',
          isSelected ? 'module-message-search-result--is-selected' : null
        )}
      >
        {this.renderAvatar()}
        <div className="module-message-search-result__text">
          <div className="module-message-search-result__header">
            {this.renderFrom()}
            <div className="module-message-search-result__header__timestamp">
              <Timestamp timestamp={receivedAt} theme={this.props.theme} />
            </div>
          </div>
          <div className="module-message-search-result__body">
            <MessageBodyHighlight text={snippet} i18n={i18n} />
          </div>
        </div>
      </div>
    );
  }
}

export const MessageSearchResult = withTheme(MessageSearchResultInner);
