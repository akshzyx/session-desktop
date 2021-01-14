/* global window, textsecure, libsession */
/* eslint-disable no-bitwise */

// eslint-disable-next-line func-names
(function() {
  window.libloki = window.libloki || {};

  const DebugFlagsEnum = {
    GROUP_SYNC_MESSAGES: 1,
    CONTACT_SYNC_MESSAGES: 2,
    SESSION_BACKGROUND_MESSAGE: 32,
    GROUP_REQUEST_INFO: 64,
    // If you add any new flag, be sure it is bitwise safe! (unique and 2 multiples)
    ALL: 65535,
  };

  const debugFlags = DebugFlagsEnum.ALL;

  const debugLogFn = (...args) => {
    if (window.lokiFeatureFlags.debugMessageLogs) {
      window.log.warn(...args);
    }
  };

  function logGroupSync(...args) {
    if (debugFlags & DebugFlagsEnum.GROUP_SYNC_MESSAGES) {
      debugLogFn(...args);
    }
  }

  function logGroupRequestInfo(...args) {
    if (debugFlags & DebugFlagsEnum.GROUP_REQUEST_INFO) {
      debugLogFn(...args);
    }
  }

  function logContactSync(...args) {
    if (debugFlags & DebugFlagsEnum.CONTACT_SYNC_MESSAGES) {
      debugLogFn(...args);
    }
  }

  function logBackgroundMessage(...args) {
    if (debugFlags & DebugFlagsEnum.SESSION_BACKGROUND_MESSAGE) {
      debugLogFn(...args);
    }
  }

  async function createContactSyncMessage(sessionContacts) {
    if (sessionContacts.length === 0) {
      return null;
    }

    const rawContacts = await Promise.all(
      sessionContacts.map(async conversation => {
        const profile = conversation.getLokiProfile();
        const name = profile
          ? profile.displayName
          : conversation.getProfileName();
        const status = await conversation.safeGetVerified();

        return {
          name,
          number: conversation.getNumber(),
          nickname: conversation.getNickname(),
          blocked: conversation.isBlocked(),
          expireTimer: conversation.get('expireTimer'),
          verifiedStatus: status,
        };
      })
    );

    return new libsession.Messages.Outgoing.ContactSyncMessage({
      timestamp: Date.now(),
      rawContacts,
    });
  }

  function createGroupSyncMessage(sessionGroup) {
    // We are getting a single open group here

    const rawGroup = {
      id: sessionGroup.id,
      name: sessionGroup.get('name'),
      members: sessionGroup.get('members') || [],
      blocked: sessionGroup.isBlocked(),
      expireTimer: sessionGroup.get('expireTimer'),
      admins: sessionGroup.get('groupAdmins') || [],
    };

    return new libsession.Messages.Outgoing.ClosedGroupSyncMessage({
      timestamp: Date.now(),
      rawGroup,
    });
  }

  const debug = {
    logContactSync,
    logGroupSync,
    logBackgroundMessage,
    logGroupRequestInfo,
  };

  window.libloki.api = {
    createContactSyncMessage,
    createGroupSyncMessage,
    debug,
  };
})();
