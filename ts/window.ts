import { LocalizerType } from './types/Util';

interface Window {
  seedNodeList: any;

  WebAPI: any;
  LokiSnodeAPI: any;
  SenderKeyAPI: any;
  LokiMessageAPI: any;
  StubMessageAPI: any;
  StubAppDotNetApi: any;
  LokiPublicChatAPI: any;
  LokiAppDotNetServerAPI: any;
  LokiFileServerAPI: any;
  LokiRssAPI: any;

  CONSTANTS: any;
  versionInfo: any;

  Events: any;
  Lodash: any;
  clearLocalData: any;
  getAccountManager: any;
  getConversations: any;
  getFriendsFromContacts: any;
  mnemonic: any;
  clipboard: any;
  attemptConnection: any;

  passwordUtil: any;
  userConfig: any;
  shortenPubkey: any;

  dcodeIO: any;
  libsignal: any;
  libloki: any;
  displayNameRegex: any;

  Signal: any;
  Whisper: any;
  ConversationController: any;

  onLogin: any;
  setPassword: any;
  textsecure: any;
  Session: any;
  log: any;
  i18n: LocalizerType;
  friends: any;
  generateID: any;
  storage: any;
  pushToast: any;

  confirmationDialog: any;
  showQRDialog: any;
  showSeedDialog: any;
  showPasswordDialog: any;
  showEditProfileDialog: any;

  deleteAccount: any;

  toggleTheme: any;
  toggleMenuBar: any;
  toggleSpellCheck: any;
  toggleLinkPreview: any;
  toggleMediaPermissions: any;

  getSettingValue: any;
  setSettingValue: any;
  lokiFeatureFlags: any;

  resetDatabase: any;
}

declare const window: Window;

// Utilities
export const WebAPI = window.WebAPI;
export const Events = window.Events;
export const Signal = window.Signal;
export const Whisper = window.Whisper;
export const ConversationController = window.ConversationController;
export const passwordUtil = window.passwordUtil;

// Values
export const CONSTANTS = window.CONSTANTS;
export const versionInfo = window.versionInfo;
export const mnemonic = window.mnemonic;
export const lokiFeatureFlags = window.lokiFeatureFlags;

// Getters
export const getAccountManager = window.getAccountManager;
export const getConversations = window.getConversations;
export const getFriendsFromContacts = window.getFriendsFromContacts;
export const getSettingValue = window.getSettingValue;

// Setters
export const setPassword = window.setPassword;
export const setSettingValue = window.setSettingValue;

// UI Events
export const pushToast = window.pushToast;
export const confirmationDialog = window.confirmationDialog;

export const showQRDialog = window.showQRDialog;
export const showSeedDialog = window.showSeedDialog;
export const showPasswordDialog = window.showPasswordDialog;
export const showEditProfileDialog = window.showEditProfileDialog;

export const toggleTheme = window.toggleTheme;
export const toggleMenuBar = window.toggleMenuBar;
export const toggleSpellCheck = window.toggleSpellCheck;
export const toggleLinkPreview = window.toggleLinkPreview;
export const toggleMediaPermissions = window.toggleMediaPermissions;

// Actions
export const clearLocalData = window.clearLocalData;
export const deleteAccount = window.deleteAccount;
export const resetDatabase = window.resetDatabase;
export const attemptConnection = window.attemptConnection;
