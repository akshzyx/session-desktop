// eslint-disable-next-line import/no-unresolved
import {} from 'styled-components/cssprop';

import { Store } from 'redux';
import { ConversationCollection } from './models/conversation';
import type { StateType } from './state/reducer';
import { PrimaryColorStateType, ThemeStateType } from './themes/constants/colors';
import type { GetMessageArgs, LocalizerDictionary, LocalizerToken } from './types/Localizer';
import type { Locale } from './util/i18n';

export interface LibTextsecure {
  messaging: boolean;
}

/*
We declare window stuff here instead of global.d.ts because we are importing other declarations.
If you import anything in global.d.ts, the type system won't work correctly.
*/

declare global {
  interface Window {
    Events: any;
    Session: any;
    Whisper: any;
    clearLocalData: () => Promise<void>;
    clipboard: any;
    getSettingValue: (id: string, comparisonValue?: any) => any;
    setSettingValue: (id: string, value: any) => Promise<void>;
    /**
     * Retrieves a localized message string, substituting variables where necessary.
     *
     * @param token - The token identifying the message to retrieve.
     * @param args - An optional record of substitution variables and their replacement values. This is required if the string has dynamic variables.
     *
     * @returns The localized message string with substitutions applied.
     *
     * @link [i18n](./util/i18n.ts)
     *
     * @example
     * // The string greeting is 'Hello, {name}!' in the current locale
     * window.i18n('greeting', { name: 'Alice' });
     * // => 'Hello, Alice!'
     */
    i18n: <T extends LocalizerToken, R extends LocalizerDictionary[T]>(
      ...[token, args]: GetMessageArgs<T>
    ) => R;
    getLocale: () => Locale;
    log: any;
    sessionFeatureFlags: {
      useOnionRequests: boolean;
      useTestNet: boolean;
      useClosedGroupV3: boolean;
      integrationTestEnv: boolean;
      replaceLocalizedStringsWithKeys: boolean;
      debug: {
        debugLogging: boolean;
        debugLibsessionDumps: boolean;
        debugFileServerRequests: boolean;
        debugNonSnodeRequests: boolean;
        debugOnionRequests: boolean;
      };
    };
    onLogin: (pw: string) => Promise<void>;
    persistStore?: Persistor;
    restart: () => void;
    getSeedNodeList: () => Array<string> | undefined;
    setPassword: (newPassword: string | null, oldPassword: string | null) => Promise<void>;
    isOnline: boolean;
    toggleMediaPermissions: () => Promise<void>;
    toggleCallMediaPermissionsTo: (enabled: boolean) => Promise<void>;
    getCallMediaPermissions: () => boolean;
    toggleMenuBar: () => void;
    toggleSpellCheck: () => void;
    primaryColor: PrimaryColorStateType;
    theme: ThemeStateType;
    setTheme: (newTheme: string) => Promise<void>;
    userConfig: any;
    versionInfo: any;
    getConversations: () => ConversationCollection;
    readyForUpdates: () => void;
    drawAttention: () => void;
    MediaRecorder: any;

    platform: string;
    openFromNotification: (convoId: string) => void;
    getEnvironment: () => string;
    getNodeVersion: () => string;

    showWindow: () => void;
    setCallMediaPermissions: (val: boolean) => void;
    setMediaPermissions: (val: boolean) => void;
    askForMediaAccess: () => void;
    getMediaPermissions: () => boolean;
    nodeSetImmediate: any;
    globalOnlineStatus: boolean;

    getTitle: () => string;
    getAppInstance: () => string;
    getCommitHash: () => string | undefined;
    getVersion: () => string;
    setAutoHideMenuBar: (val: boolean) => void;
    setMenuBarVisibility: (val: boolean) => void;
    contextMenuShown: boolean;
    inboxStore?: Store;
    openConversationWithMessages: (args: {
      conversationKey: string;
      messageId: string | null;
    }) => Promise<void>;
    LokiPushNotificationServer: any;
    getGlobalOnlineStatus: () => boolean;
    confirmationDialog: any;
    setStartInTray: (val: boolean) => Promise<void>;
    getStartInTray: () => Promise<boolean>;
    getOpengroupPruning: () => Promise<boolean>;
    setOpengroupPruning: (val: boolean) => Promise<void>;
    closeAbout: () => void;
    closeDebugLog: () => void;
    getAutoUpdateEnabled: () => boolean;
    setAutoUpdateEnabled: (enabled: boolean) => void;
    setZoomFactor: (newZoom: number) => void;
    updateZoomFactor: () => void;

    Signal: any;
  }
}
