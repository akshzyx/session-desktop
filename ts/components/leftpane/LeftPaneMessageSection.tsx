import React from 'react';
import { AutoSizer, List, ListRowProps } from 'react-virtualized';
import {
  ConversationListItemProps,
  MemoConversationListItemWithDetails,
} from './conversation-list-item/ConversationListItem';
import { ReduxConversationType } from '../../state/ducks/conversations';
import { SearchResults, SearchResultsProps } from '../search/SearchResults';
import { LeftPaneSectionHeader } from './LeftPaneSectionHeader';
import autoBind from 'auto-bind';
import _ from 'lodash';
import { MessageRequestsBanner } from './MessageRequestsBanner';

import { SessionSearchInput } from '../SessionSearchInput';
import { OverlayCommunity } from './overlay/OverlayCommunity';
import { OverlayMessageRequest } from './overlay/OverlayMessageRequest';
import { OverlayMessage } from './overlay/OverlayMessage';
import { OverlayClosedGroup } from './overlay/OverlayClosedGroup';
import { LeftOverlayMode, setLeftOverlayMode } from '../../state/ducks/section';
import { OverlayChooseAction } from './overlay/choose-action/OverlayChooseAction';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { getLeftOverlayMode } from '../../state/selectors/section';
import { StyledLeftPaneList } from './LeftPaneList';

export interface Props {
  contacts: Array<ReduxConversationType>;
  conversations?: Array<ConversationListItemProps>;
  searchResults?: SearchResultsProps;

  messageRequestsEnabled?: boolean;
  leftOverlayMode: LeftOverlayMode | undefined;
}

const StyledLeftPaneContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
`;

const StyledConversationListContent = styled.div`
  background: var(--background-primary-color);
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  transition: none;
`;

const ClosableOverlay = () => {
  const leftOverlayMode = useSelector(getLeftOverlayMode);

  switch (leftOverlayMode) {
    case 'choose-action':
      return <OverlayChooseAction />;
    case 'open-group':
      return <OverlayCommunity />;
    case 'closed-group':
      return <OverlayClosedGroup />;
    case 'message':
      return <OverlayMessage />;
    case 'message-requests':
      return <OverlayMessageRequest />;
    default:
      return null;
  }
};

export class LeftPaneMessageSection extends React.Component<Props> {
  public constructor(props: Props) {
    super(props);

    autoBind(this);
  }

  public renderRow = ({ index, key, style }: ListRowProps): JSX.Element | null => {
    const { conversations } = this.props;

    //assume conversations that have been marked unapproved should be filtered out by selector.
    if (!conversations) {
      throw new Error('renderRow: Tried to render without conversations');
    }

    const conversation = conversations[index];
    if (!conversation) {
      throw new Error('renderRow: conversations selector returned element containing falsy value.');
    }

    return <MemoConversationListItemWithDetails key={key} style={style} {...conversation} />;
  };

  public renderList(): JSX.Element {
    const { conversations, searchResults } = this.props;

    if (searchResults) {
      return <SearchResults {...searchResults} />;
    }

    if (!conversations) {
      throw new Error('render: must provided conversations if no search results are provided');
    }

    const length = conversations.length;

    // Note: conversations is not a known prop for List, but it is required to ensure that
    //   it re-renders when our conversation data changes. Otherwise it would just render
    //   on startup and scroll.

    return (
      <StyledLeftPaneList key={0}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              className="module-left-pane__virtual-list"
              conversations={conversations}
              height={height}
              rowCount={length}
              rowHeight={64}
              rowRenderer={this.renderRow}
              width={width}
              autoHeight={false}
            />
          )}
        </AutoSizer>
      </StyledLeftPaneList>
    );
  }

  public render(): JSX.Element {
    const { leftOverlayMode } = this.props;

    return (
      <StyledLeftPaneContent>
        <LeftPaneSectionHeader />
        {leftOverlayMode ? <ClosableOverlay /> : this.renderConversations()}
      </StyledLeftPaneContent>
    );
  }

  public renderConversations() {
    return (
      <StyledConversationListContent>
        <SessionSearchInput />
        <MessageRequestsBanner
          handleOnClick={() => {
            window.inboxStore?.dispatch(setLeftOverlayMode('message-requests'));
          }}
        />
        {this.renderList()}
      </StyledConversationListContent>
    );
  }
}
