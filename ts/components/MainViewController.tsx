import React from 'react';
import ReactDOM from 'react-dom';

import {
  SessionSettingCategory,
  SettingsView,
} from './session/settings/SessionSettings';

export const MainViewController = {
  renderMessageView: () => {
    if (document.getElementById('main-view')) {
      ReactDOM.render(<MessageView />, document.getElementById('main-view'));
    }
  },

  renderSettingsView: (category: SessionSettingCategory) => {
    // tslint:disable-next-line: no-backbone-get-set-outside-model
    const isSecondaryDevice = !!window.textsecure.storage.get(
      'isSecondaryDevice'
    );
    if (document.getElementById('main-view')) {
      ReactDOM.render(
        <SettingsView
          category={category}
          isSecondaryDevice={isSecondaryDevice}
        />,
        document.getElementById('main-view')
      );
    }
  },
};

export class MessageView extends React.Component {
  public render() {
    return (
      <div className="conversation-stack">
        <div className="conversation placeholder">
          <div className="conversation-header" />
          <div className="container">
            <div className="content">
              <img
                src="images/session/full-logo.svg"
                className="session-full-logo"
                alt="full-brand-logo"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
