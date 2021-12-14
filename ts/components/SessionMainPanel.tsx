import React from 'react';
import { useSelector } from 'react-redux';
import { useAppIsFocused } from '../hooks/useAppFocused';
import { getFocusedSettingsSection } from '../state/selectors/section';

import { SmartSessionConversation } from '../state/smart/SessionConversation';
import { SessionSettingsView } from './settings/SessionSettings';

const FilteredSettingsView = SessionSettingsView as any;

export const SessionMainPanel = () => {
  const focusedSettingsSection = useSelector(getFocusedSettingsSection);
  const isSettingsView = focusedSettingsSection !== undefined;

  // even if it looks like this does nothing, this does update the redux store.
  useAppIsFocused();

  if (isSettingsView) {
    return <FilteredSettingsView category={focusedSettingsSection} />;
  }
  return (
    <div className="session-conversation">
      <SmartSessionConversation />
    </div>
  );
};
