import React, { useState } from 'react';

import { ActionsPanel, SectionType } from './session/ActionsPanel';
import { LeftPaneMessageSection } from './session/LeftPaneMessageSection';

import { openConversationExternal } from '../state/ducks/conversations';
import { LeftPaneContactSection } from './session/LeftPaneContactSection';
import { LeftPaneSettingSection } from './session/LeftPaneSettingSection';
import { SessionTheme } from '../state/ducks/SessionTheme';
import { SessionExpiredWarning } from './session/network/SessionExpiredWarning';
import { getFocusedSection } from '../state/selectors/section';
import { useDispatch, useSelector } from 'react-redux';
import { getLeftPaneLists } from '../state/selectors/conversations';
import { getQuery, getSearchResults, isSearching } from '../state/selectors/search';
import { clearSearch, search, updateSearchTerm } from '../state/ducks/search';
import { getTheme } from '../state/selectors/theme';

// from https://github.com/bvaughn/react-virtualized/blob/fb3484ed5dcc41bffae8eab029126c0fb8f7abc0/source/List/types.js#L5
export type RowRendererParamsType = {
  index: number;
  isScrolling: boolean;
  isVisible: boolean;
  key: string;
  parent: Object;
  style: Object;
};

type Props = {
  isExpired: boolean;
};

const InnerLeftPaneMessageSection = (props: { isExpired: boolean }) => {
  const dispatch = useDispatch();

  const showSearch = useSelector(isSearching);
  const searchTerm = useSelector(getQuery);

  const searchResults = showSearch ? useSelector(getSearchResults) : undefined;

  const lists = showSearch ? undefined : useSelector(getLeftPaneLists);
  const theme = useSelector(getTheme);
  // tslint:disable: use-simple-attributes

  return (
    <>
      {props.isExpired && <SessionExpiredWarning />}
      <LeftPaneMessageSection
        theme={theme}
        openConversationExternal={(id, messageId) =>
          dispatch(openConversationExternal(id, messageId))
        }
        conversations={lists?.conversations || []}
        contacts={lists?.contacts || []}
        searchResults={searchResults}
        searchTerm={searchTerm}
        updateSearchTerm={query => dispatch(updateSearchTerm(query))}
        search={(query, options) => dispatch(search(query, options))}
        clearSearch={() => dispatch(clearSearch())}
      />
    </>
  );
};

const InnerLeftPaneContactSection = () => {
  const dispatch = useDispatch();
  const theme = useSelector(getTheme);
  const showSearch = useSelector(isSearching);

  const lists = showSearch ? undefined : useSelector(getLeftPaneLists);

  const directContacts = lists?.contacts || [];

  return (
    <>
      <LeftPaneContactSection
        openConversationExternal={(id, messageId) =>
          dispatch(openConversationExternal(id, messageId))
        }
        directContacts={directContacts}
        theme={theme}
      />
    </>
  );
};

const LeftPaneSection = (props: { isExpired: boolean }) => {
  const focusedSection = useSelector(getFocusedSection);

  if (focusedSection === SectionType.Message) {
    return <InnerLeftPaneMessageSection isExpired={props.isExpired} />;
  }

  if (focusedSection === SectionType.Contact) {
    return <InnerLeftPaneContactSection />;
  }
  if (focusedSection === SectionType.Settings) {
    return <LeftPaneSettingSection />;
  }
  return <></>;
};

export const LeftPane = (props: Props) => {
  const theme = useSelector(getTheme);

  return (
    <>
      <SessionTheme theme={theme}>
        <div className="module-left-pane-session">
          <ActionsPanel />

          <div className="module-left-pane">
            <LeftPaneSection isExpired={props.isExpired} />
          </div>
        </div>
      </SessionTheme>
    </>
  );
};
