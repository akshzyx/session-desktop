import React from 'react';
import classNames from 'classnames';

import { MessageBodyHighlight } from './MessageBodyHighlight';

import { MessageDirection } from '../../models/messageType';
import { getOurPubKeyStrFromCache } from '../../session/utils/User';
import {
  FindAndFormatContactType,
  openConversationWithMessages,
} from '../../state/ducks/conversations';
import { ContactName } from '../conversation/ContactName';
import { Avatar, AvatarSize } from '../avatar/Avatar';
import { Timestamp } from '../conversation/Timestamp';

type PropsHousekeeping = {
  isSelected?: boolean;
};

export type PropsForSearchResults = {
  from: FindAndFormatContactType;
  to: FindAndFormatContactType;
  id: string;
  conversationId: string;
  destination: string;
  source: string;

  direction?: string;
  snippet?: string; //not sure about the type of snippet
  receivedAt?: number;
};

type Props = PropsForSearchResults & PropsHousekeeping;

const FromName = (props: { source: string; destination: string }) => {
  const { source, destination } = props;

  const isNoteToSelf = destination === getOurPubKeyStrFromCache() && source === destination;

  if (isNoteToSelf) {
    return (
      <span className="module-message-search-result__header__name">
        {window.i18n('noteToSelf')}
      </span>
    );
  }

  if (source === getOurPubKeyStrFromCache()) {
    return <span className="module-message-search-result__header__name">{window.i18n('you')}</span>;
  }

  return (
    // tslint:disable: use-simple-attributes
    <ContactName
      pubkey={source}
      module="module-message-search-result__header__name"
      shouldShowPubkey={false}
    />
  );
};

const From = (props: { source: string; destination: string }) => {
  const { source, destination } = props;
  const fromName = <FromName source={source} destination={destination} />;

  const ourKey = getOurPubKeyStrFromCache();

  // TODO: ww maybe add useConversationUsername hook within contact name
  if (destination !== ourKey) {
    return (
      <div className="module-message-search-result__header__from">
        {fromName} {window.i18n('to')}
        <span className="module-mesages-search-result__header__group">
          <ContactName pubkey={destination} shouldShowPubkey={true} />
          {/* <ContactName pubkey={destination} shouldShowPubkey={false} /> */}
        </span>
      </div>
    );
  }

  return <div className="module-message-search-result__header__from">{fromName}</div>;
};

const AvatarItem = (props: { source: string }) => {
  const { source } = props;
  return <Avatar size={AvatarSize.S} pubkey={source} />;
};

export const MessageSearchResult = (props: Props) => {
  const {
    isSelected,
    id,
    conversationId,
    receivedAt,
    snippet,
    destination,
    source,
    direction,
  } = props;

  const sourceOrDestinationDerivable =
    (destination && direction === MessageDirection.outgoing) ||
    !destination ||
    !source ||
    (source && direction === MessageDirection.incoming);

  if (!sourceOrDestinationDerivable) {
    return null;
  }

  const effectiveSource =
    !source && direction === MessageDirection.outgoing ? getOurPubKeyStrFromCache() : source;
  const effectiveDestination =
    !destination && direction === MessageDirection.incoming
      ? getOurPubKeyStrFromCache()
      : destination;

  return (
    <div
      role="button"
      onClick={() => {
        openConversationWithMessages({
          conversationKey: conversationId,
          messageId: id,
        });
      }}
      className={classNames(
        'module-message-search-result',
        isSelected ? 'module-message-search-result--is-selected' : null
      )}
    >
      <AvatarItem source={effectiveSource} />
      <div className="module-message-search-result__text">
        <div className="module-message-search-result__header">
          <From source={effectiveSource} destination={effectiveDestination} />
          <div className="module-message-search-result__header__timestamp">
            <Timestamp timestamp={receivedAt} />
          </div>
        </div>
        <div className="module-message-search-result__body">
          <MessageBodyHighlight text={snippet || ''} />
        </div>
      </div>
    </div>
  );
};
