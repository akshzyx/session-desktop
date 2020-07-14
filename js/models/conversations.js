/* global
  $,
  _,
  log,
  i18n,
  Backbone,
  libsession,
  ConversationController,
  MessageController,
  storage,
  textsecure,
  Whisper,
  profileImages,
  clipboard,
  BlockedNumberController,
  lokiPublicChatAPI,
  JobQueue,
  StringView
*/

/* eslint-disable more/no-then */

// eslint-disable-next-line func-names
(function() {
  'use strict';

  window.Whisper = window.Whisper || {};

  const SEALED_SENDER = {
    UNKNOWN: 0,
    ENABLED: 1,
    DISABLED: 2,
    UNRESTRICTED: 3,
  };

  const { Util } = window.Signal;
  const {
    Conversation,
    Contact,
    Errors,
    Message,
    PhoneNumber,
  } = window.Signal.Types;
  const {
    upgradeMessageSchema,
    loadAttachmentData,
    getAbsoluteAttachmentPath,
    // eslint-disable-next-line no-unused-vars
    writeNewAttachmentData,
    deleteAttachmentData,
  } = window.Signal.Migrations;

  // Possible session reset states
  const SessionResetEnum = Object.freeze({
    // No ongoing reset
    none: 0,
    // we initiated the session reset
    initiated: 1,
    // we received the session reset
    request_received: 2,
  });

  const COLORS = [
    'red',
    'deep_orange',
    'brown',
    'pink',
    'purple',
    'indigo',
    'blue',
    'teal',
    'green',
    'light_green',
    'blue_grey',
  ];

  Whisper.Conversation = Backbone.Model.extend({
    storeName: 'conversations',
    defaults() {
      return {
        unreadCount: 0,
        verified: textsecure.storage.protocol.VerifiedStatus.DEFAULT,
        sessionResetStatus: SessionResetEnum.none,
        groupAdmins: [],
        isKickedFromGroup: false,
        isOnline: false,
        profileSharing: false,
      };
    },

    idForLogging() {
      if (this.isPrivate()) {
        return this.id;
      }

      return `group(${this.id})`;
    },

    handleMessageError(message, errors) {
      this.trigger('messageError', message, errors);
    },

    getContactCollection() {
      const collection = new Backbone.Collection();
      const collator = new Intl.Collator();
      collection.comparator = (left, right) => {
        const leftLower = left.getTitle().toLowerCase();
        const rightLower = right.getTitle().toLowerCase();
        return collator.compare(leftLower, rightLower);
      };
      return collection;
    },

    initialize() {
      this.ourNumber = textsecure.storage.user.getNumber();
      this.verifiedEnum = textsecure.storage.protocol.VerifiedStatus;

      // This may be overridden by ConversationController.getOrCreate, and signify
      //   our first save to the database. Or first fetch from the database.
      this.initialPromise = Promise.resolve();

      this.contactCollection = this.getContactCollection();
      this.messageCollection = new Whisper.MessageCollection([], {
        conversation: this,
      });

      this.messageCollection.on('change:errors', this.handleMessageError, this);
      this.messageCollection.on('send-error', this.onMessageError, this);

      this.throttledBumpTyping = _.throttle(this.bumpTyping, 300);
      const debouncedUpdateLastMessage = _.debounce(
        this.updateLastMessage.bind(this),
        200
      );
      this.listenTo(
        this.messageCollection,
        'add remove destroy',
        debouncedUpdateLastMessage
      );
      this.listenTo(this.messageCollection, 'sent', this.updateLastMessage);
      this.listenTo(
        this.messageCollection,
        'send-error',
        this.updateLastMessage
      );

      this.on('newmessage', this.onNewMessage);
      this.on('change:profileKey', this.onChangeProfileKey);

      // Listening for out-of-band data updates
      this.on('updateMessage', this.updateAndMerge);
      this.on('delivered', this.updateAndMerge);
      this.on('read', this.updateAndMerge);
      this.on('expiration-change', this.updateAndMerge);
      this.on('expired', this.onExpired);

      this.on('ourAvatarChanged', avatar =>
        this.updateAvatarOnPublicChat(avatar)
      );

      // Always share profile pics with public chats
      if (this.isPublic) {
        this.set('profileSharing', true);
      }

      const sealedSender = this.get('sealedSender');
      if (sealedSender === undefined) {
        this.set({ sealedSender: SEALED_SENDER.UNKNOWN });
      }
      this.unset('unidentifiedDelivery');
      this.unset('unidentifiedDeliveryUnrestricted');
      this.unset('hasFetchedProfile');
      this.unset('tokens');

      this.typingRefreshTimer = null;
      this.typingPauseTimer = null;

      this.messageSendQueue = new JobQueue();

      this.selectedMessages = new Set();

      // Keep props ready
      const generateProps = () => {
        this.cachedProps = this.getProps();
      };
      this.on('change', generateProps);
      generateProps();
    },

    isOnline() {
      return this.isMe() || this.get('isOnline');
    },
    isMe() {
      return this.isOurLocalDevice() || this.isOurPrimaryDevice();
    },
    isOurPrimaryDevice() {
      return this.id === window.storage.get('primaryDevicePubKey');
    },
    async isOurDevice() {
      if (this.isMe()) {
        return true;
      }

      return window.libsession.Protocols.MultiDeviceProtocol.isOurDevice(
        this.id
      );
    },
    isOurLocalDevice() {
      return this.id === this.ourNumber;
    },
    isPublic() {
      return !!(this.id && this.id.match(/^publicChat:/));
    },
    isClosedGroup() {
      return (
        this.get('type') === Message.GROUP && !this.isPublic() && !this.isRss()
      );
    },
    isClosable() {
      return !this.isRss() || this.get('closable');
    },
    isRss() {
      return !!(this.id && this.id.match(/^rss:/));
    },
    isBlocked() {
      if (!this.id || this.isMe()) {
        return false;
      }

      if (this.isClosedGroup()) {
        return BlockedNumberController.isGroupBlocked(this.id);
      }

      if (this.isPrivate()) {
        const primary = this.getPrimaryDevicePubKey();
        return BlockedNumberController.isBlocked(primary);
      }

      return false;
    },
    isMediumGroup() {
      return this.get('is_medium_group');
    },
    async block() {
      if (!this.id || this.isPublic() || this.isRss()) {
        return;
      }

      const promise = this.isPrivate()
        ? BlockedNumberController.block(this.id)
        : BlockedNumberController.blockGroup(this.id);
      await promise;
      this.trigger('change');
      this.messageCollection.forEach(m => m.trigger('change'));
      this.updateTextInputState();
    },
    async unblock() {
      if (!this.id || this.isPublic() || this.isRss()) {
        return;
      }
      const promise = this.isPrivate()
        ? BlockedNumberController.unblock(this.id)
        : BlockedNumberController.unblockGroup(this.id);
      await promise;
      this.trigger('change');
      this.messageCollection.forEach(m => m.trigger('change'));
      this.updateTextInputState();
    },
    setMessageSelectionBackdrop() {
      const messageSelected = this.selectedMessages.size > 0;

      if (messageSelected) {
        // Hide ellipses icon
        $('.title-wrapper .session-icon.ellipses').css({ opacity: 0 });

        $('.messages li, .messages > div').addClass('shadowed');
        $('.message-selection-overlay').addClass('overlay');
        $('.module-conversation-header').addClass('overlayed');

        let messageId;
        // eslint-disable-next-line no-restricted-syntax
        for (const item of this.selectedMessages) {
          messageId = item.propsForMessage.id;
          $(`#${messageId}`).removeClass('shadowed');
        }
      } else {
        // Hide ellipses icon
        $('.title-wrapper .session-icon.ellipses').css({ opacity: 1 });

        $('.messages li, .messages > div').removeClass('shadowed');
        $('.message-selection-overlay').removeClass('overlay');
        $('.module-conversation-header').removeClass('overlayed');
      }
    },

    addMessageSelection(id) {
      // If the selection is empty, then we chage the mode to
      // multiple selection by making it non-empty
      const modeChanged = this.selectedMessages.size === 0;
      this.selectedMessages.add(id);

      if (modeChanged) {
        this.messageCollection.forEach(m => m.trigger('change'));
      }

      this.trigger('message-selection-changed');
      this.setMessageSelectionBackdrop();
    },

    removeMessageSelection(id) {
      this.selectedMessages.delete(id);
      // If the selection is empty after the deletion then we
      // must have unselected the last one (we assume the id is valid)
      const modeChanged = this.selectedMessages.size === 0;

      if (modeChanged) {
        this.messageCollection.forEach(m => m.trigger('change'));
      }

      this.trigger('message-selection-changed');
      this.setMessageSelectionBackdrop();
    },

    resetMessageSelection() {
      this.selectedMessages.clear();
      this.messageCollection.forEach(m => {
        // on change for ALL messages without real changes is a really costly operation
        // -> cause refresh of the whole conversation view even if not a single message was selected
        if (m.selected) {
          // eslint-disable-next-line no-param-reassign
          m.selected = false;
          m.trigger('change');
        }
      });

      this.trigger('message-selection-changed');
      this.setMessageSelectionBackdrop();
    },

    async bumpTyping() {
      if (this.isPublic()) {
        window.console.debug('public conversation... No need to bumpTyping');
        return;
      }
      // We don't send typing messages if the setting is disabled or we do not have a session
      // or we blocked that user
      const devicePubkey = new libsession.Types.PubKey(this.id);
      const hasSession = await libsession.Protocols.SessionProtocol.hasSession(
        devicePubkey
      );

      if (
        !storage.get('typing-indicators-setting') ||
        !hasSession ||
        this.isBlocked()
      ) {
        return;
      }

      if (!this.typingRefreshTimer) {
        const isTyping = true;
        this.setTypingRefreshTimer();
        this.sendTypingMessage(isTyping);
      }

      this.setTypingPauseTimer();
    },

    setTypingRefreshTimer() {
      if (this.typingRefreshTimer) {
        clearTimeout(this.typingRefreshTimer);
      }
      this.typingRefreshTimer = setTimeout(
        this.onTypingRefreshTimeout.bind(this),
        10 * 1000
      );
    },

    onTypingRefreshTimeout() {
      const isTyping = true;
      this.sendTypingMessage(isTyping);

      // This timer will continue to reset itself until the pause timer stops it
      this.setTypingRefreshTimer();
    },

    setTypingPauseTimer() {
      if (this.typingPauseTimer) {
        clearTimeout(this.typingPauseTimer);
      }
      this.typingPauseTimer = setTimeout(
        this.onTypingPauseTimeout.bind(this),
        3 * 1000
      );
    },

    onTypingPauseTimeout() {
      const isTyping = false;
      this.sendTypingMessage(isTyping);

      this.clearTypingTimers();
    },

    clearTypingTimers() {
      if (this.typingPauseTimer) {
        clearTimeout(this.typingPauseTimer);
        this.typingPauseTimer = null;
      }
      if (this.typingRefreshTimer) {
        clearTimeout(this.typingRefreshTimer);
        this.typingRefreshTimer = null;
      }
    },

    sendTypingMessage(isTyping) {
      // Loki - Temporarily disable typing messages for groups
      if (!this.isPrivate()) {
        return;
      }

      const groupId = !this.isPrivate() ? this.id : null;
      const recipientId = this.isPrivate() ? this.id : null;

      // We don't want to send typing messages to our other devices, but we will
      //   in the group case.
      const primaryDevicePubkey = window.storage.get('primaryDevicePubKey');
      if (recipientId && primaryDevicePubkey === recipientId) {
        return;
      }

      if (!recipientId && !groupId) {
        throw new Error('Need to provide either recipientId or groupId!');
      }

      const typingParams = {
        timestamp: Date.now(),
        isTyping,
        typingTimestamp: Date.now(),
        groupId, // might be null
      };
      const typingMessage = new libsession.Messages.Outgoing.TypingMessage(
        typingParams
      );

      // send the message to a single recipient if this is a session chat
      if (this.isPrivate) {
        const device = new libsession.Types.PubKey(recipientId);
        libsession
          .getMessageQueue()
          .sendUsingMultiDevice(device, typingMessage)
          .catch(log.error);
      } else {
        // the recipients on the case of a group are found by the messageQueue using message.groupId
        libsession
          .getMessageQueue()
          .sendToGroup(typingMessage)
          .catch(log.error);
      }
    },

    async cleanup() {
      await window.Signal.Types.Conversation.deleteExternalFiles(
        this.attributes,
        {
          deleteAttachmentData,
        }
      );
      profileImages.removeImage(this.id);
    },

    async updateProfileAvatar() {
      if (this.isRss() || this.isPublic()) {
        return;
      }

      // Remove old identicons
      if (profileImages.hasImage(this.id)) {
        profileImages.removeImage(this.id);
        await this.setProfileAvatar(null);
      }
    },

    async updateAndMerge(message) {
      this.updateLastMessage();

      const mergeMessage = () => {
        const existing = this.messageCollection.get(message.id);
        if (!existing) {
          return;
        }

        existing.merge(message.attributes);
      };

      await this.inProgressFetch;
      mergeMessage();
    },

    async onExpired(message) {
      this.updateLastMessage();

      const removeMessage = () => {
        const { id } = message;
        const existing = this.messageCollection.get(id);
        if (!existing) {
          return;
        }

        window.log.info('Remove expired message from collection', {
          sentAt: existing.get('sent_at'),
        });

        this.messageCollection.remove(id);
        existing.trigger('expired');
      };

      // If a fetch is in progress, then we need to wait until that's complete to
      //   do this removal. Otherwise we could remove from messageCollection, then
      //   the async database fetch could include the removed message.

      await this.inProgressFetch;
      removeMessage();
    },

    // Get messages with the given timestamp
    _getMessagesWithTimestamp(pubKey, timestamp) {
      if (this.id !== pubKey) {
        return [];
      }

      // Go through our messages and find the one that we need to update
      return this.messageCollection.models.filter(
        m => m.get('sent_at') === timestamp
      );
    },

    async onCalculatingPoW(pubKey, timestamp) {
      const messages = this._getMessagesWithTimestamp(pubKey, timestamp);
      await Promise.all(messages.map(m => m.setCalculatingPoW()));
    },

    async onPublicMessageSent(pubKey, timestamp, serverId) {
      const messages = this._getMessagesWithTimestamp(pubKey, timestamp);
      await Promise.all(
        messages.map(message => [
          message.setIsPublic(true),
          message.setServerId(serverId),
        ])
      );
    },

    async onNewMessage(message) {
      await this.updateLastMessage();

      // Clear typing indicator for a given contact if we receive a message from them
      const identifier = message.get
        ? `${message.get('source')}.${message.get('sourceDevice')}`
        : `${message.source}.${message.sourceDevice}`;
      this.clearContactTypingTimer(identifier);
    },
    addSingleMessage(message, setToExpire = true) {
      const model = this.messageCollection.add(message, { merge: true });
      if (setToExpire) {
        model.setToExpire();
      }
      return model;
    },
    format() {
      return this.cachedProps;
    },
    getProps() {
      const { format } = PhoneNumber;
      const regionCode = storage.get('regionCode');
      const color = this.getColor();
      const typingKeys = Object.keys(this.contactTypingTimers || {});

      const result = {
        id: this.id,
        isArchived: this.get('isArchived'),
        activeAt: this.get('active_at'),
        avatarPath: this.getAvatarPath(),
        color,
        type: this.isPrivate() ? 'direct' : 'group',
        isMe: this.isMe(),
        isPublic: this.isPublic(),
        isRss: this.isRss(),
        isClosable: this.isClosable(),
        isTyping: typingKeys.length > 0,
        lastUpdated: this.get('timestamp'),
        name: this.getName(),
        profileName: this.getProfileName(),
        timestamp: this.get('timestamp'),
        title: this.getTitle(),
        unreadCount: this.get('unreadCount') || 0,
        mentionedUs: this.get('mentionedUs') || false,
        isBlocked: this.isBlocked(),
        isSecondary: !!this.get('secondaryStatus'),
        primaryDevice: this.getPrimaryDevicePubKey(),
        phoneNumber: format(this.id, {
          ourRegionCode: regionCode,
        }),
        lastMessage: {
          status: this.get('lastMessageStatus'),
          text: this.get('lastMessage'),
          isRss: this.isRss(),
        },
        isOnline: this.isOnline(),
        hasNickname: !!this.getNickname(),

        selectedMessages: this.selectedMessages,

        onClick: () => this.trigger('select', this),
        onBlockContact: () => this.block(),
        onUnblockContact: () => this.unblock(),
        onChangeNickname: () => this.changeNickname(),
        onClearNickname: () => this.setNickname(null),
        onCopyPublicKey: () => this.copyPublicKey(),
        onDeleteContact: () => this.deleteContact(),
        onDeleteMessages: () => this.deleteMessages(),
        onCloseOverlay: () => this.resetMessageSelection(),
      };

      return result;
    },

    onMessageError() {
      this.updateVerified();
    },
    safeGetVerified() {
      const promise = textsecure.storage.protocol.getVerified(this.id);
      return promise.catch(
        () => textsecure.storage.protocol.VerifiedStatus.DEFAULT
      );
    },
    async updateVerified() {
      if (this.isPrivate()) {
        await this.initialPromise;
        const verified = await this.safeGetVerified();

        this.set({ verified });

        // we don't await here because we don't need to wait for this to finish
        window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });

        return;
      }

      await this.fetchContacts();
      await Promise.all(
        this.contactCollection.map(async contact => {
          if (!contact.isMe()) {
            await contact.updateVerified();
          }
        })
      );

      this.onMemberVerifiedChange();
    },
    setVerifiedDefault(options) {
      const { DEFAULT } = this.verifiedEnum;
      return this.queueJob(() => this._setVerified(DEFAULT, options));
    },
    setVerified(options) {
      const { VERIFIED } = this.verifiedEnum;
      return this.queueJob(() => this._setVerified(VERIFIED, options));
    },
    setUnverified(options) {
      const { UNVERIFIED } = this.verifiedEnum;
      return this.queueJob(() => this._setVerified(UNVERIFIED, options));
    },
    async _setVerified(verified, providedOptions) {
      const options = providedOptions || {};
      _.defaults(options, {
        viaSyncMessage: false,
        viaContactSync: false,
        key: null,
      });

      const { VERIFIED, UNVERIFIED } = this.verifiedEnum;

      if (!this.isPrivate()) {
        throw new Error(
          'You cannot verify a group conversation. ' +
            'You must verify individual contacts.'
        );
      }

      const beginningVerified = this.get('verified');
      let keyChange;
      if (options.viaSyncMessage) {
        // handle the incoming key from the sync messages - need different
        // behavior if that key doesn't match the current key
        keyChange = await textsecure.storage.protocol.processVerifiedMessage(
          this.id,
          verified,
          options.key
        );
      } else {
        keyChange = await textsecure.storage.protocol.setVerified(
          this.id,
          verified
        );
      }

      this.set({ verified });
      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });

      // Three situations result in a verification notice in the conversation:
      //   1) The message came from an explicit verification in another client (not
      //      a contact sync)
      //   2) The verification value received by the contact sync is different
      //      from what we have on record (and it's not a transition to UNVERIFIED)
      //   3) Our local verification status is VERIFIED and it hasn't changed,
      //      but the key did change (Key1/VERIFIED to Key2/VERIFIED - but we don't
      //      want to show DEFAULT->DEFAULT or UNVERIFIED->UNVERIFIED)
      if (
        !options.viaContactSync ||
        (beginningVerified !== verified && verified !== UNVERIFIED) ||
        (keyChange && verified === VERIFIED)
      ) {
        await this.addVerifiedChange(this.id, verified === VERIFIED, {
          local: !options.viaSyncMessage,
        });
      }
      if (!options.viaSyncMessage) {
        await this.sendVerifySyncMessage(this.id, verified);
      }
    },
    async sendVerifySyncMessage(number, state) {
      // Because syncVerification sends a (null) message to the target of the verify and
      //   a sync message to our own devices, we need to send the accessKeys down for both
      //   contacts. So we merge their sendOptions.
      const { sendOptions } = ConversationController.prepareForSend(
        this.ourNumber,
        { syncMessage: true }
      );
      const options = Object.assign({}, sendOptions, {});

      const key = await textsecure.storage.protocol.loadIdentityKey(number);
      return textsecure.messaging.syncVerification(number, state, key, options);
    },
    isVerified() {
      if (this.isPrivate()) {
        return this.get('verified') === this.verifiedEnum.VERIFIED;
      }
      if (!this.contactCollection.length) {
        return false;
      }

      return this.contactCollection.every(contact => {
        if (contact.isMe()) {
          return true;
        }
        return contact.isVerified();
      });
    },
    async getPrimaryConversation() {
      if (!this.isSecondaryDevice()) {
        // This is already the primary conversation
        return this;
      }

      const device = window.libsession.Types.PubKey.from(this.id);
      if (device) {
        const primary = await window.libsession.Protocols.MultiDeviceProtocol.getPrimaryDevice(
          device
        );

        return ConversationController.getOrCreateAndWait(
          primary.key,
          'private'
        );
      }

      // Something funky has happened
      return this;
    },
    async updateTextInputState() {
      if (this.isRss()) {
        // or if we're an rss conversation, disable it
        this.trigger('disable:input', true);
        return;
      }
      if (this.isSecondaryDevice()) {
        // Or if we're a secondary device, update the primary device text input
        const primaryConversation = await this.getPrimaryConversation();
        primaryConversation.updateTextInputState();
        return;
      }
      if (this.get('isKickedFromGroup')) {
        this.trigger('disable:input', true);
        return;
      }
      if (!this.isPrivate() && this.get('left')) {
        this.trigger('disable:input', true);
        this.trigger('change:placeholder', 'left-group');
        return;
      }
      if (this.isBlocked()) {
        this.trigger('disable:input', true);
        this.trigger('change:placeholder', 'blocked-user');
        return;
      }
      // otherwise, enable the input and set default placeholder
      this.trigger('disable:input', false);
      this.trigger('change:placeholder', 'chat');
    },
    isSecondaryDevice() {
      return !!this.get('secondaryStatus');
    },
    getPrimaryDevicePubKey() {
      return this.get('primaryDevicePubKey') || this.id;
    },
    async setSecondaryStatus(newStatus, primaryDevicePubKey) {
      if (this.get('secondaryStatus') !== newStatus) {
        this.set({
          secondaryStatus: newStatus,
          primaryDevicePubKey,
        });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    async updateGroupAdmins(groupAdmins) {
      this.set({ groupAdmins });
      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });
    },
    isUnverified() {
      if (this.isPrivate()) {
        const verified = this.get('verified');
        return (
          verified !== this.verifiedEnum.VERIFIED &&
          verified !== this.verifiedEnum.DEFAULT
        );
      }
      if (!this.contactCollection.length) {
        return true;
      }

      return this.contactCollection.any(contact => {
        if (contact.isMe()) {
          return false;
        }
        return contact.isUnverified();
      });
    },
    getUnverified() {
      if (this.isPrivate()) {
        return this.isUnverified()
          ? new Backbone.Collection([this])
          : new Backbone.Collection();
      }
      return new Backbone.Collection(
        this.contactCollection.filter(contact => {
          if (contact.isMe()) {
            return false;
          }
          return contact.isUnverified();
        })
      );
    },
    setApproved() {
      if (!this.isPrivate()) {
        throw new Error(
          'You cannot set a group conversation as trusted. ' +
            'You must set individual contacts as trusted.'
        );
      }

      return textsecure.storage.protocol.setApproval(this.id, true);
    },
    safeIsUntrusted() {
      return textsecure.storage.protocol
        .isUntrusted(this.id)
        .catch(() => false);
    },
    isUntrusted() {
      if (this.isPrivate()) {
        return this.safeIsUntrusted();
      }
      if (!this.contactCollection.length) {
        return Promise.resolve(false);
      }

      return Promise.all(
        this.contactCollection.map(contact => {
          if (contact.isMe()) {
            return false;
          }
          return contact.safeIsUntrusted();
        })
      ).then(results => _.any(results, result => result));
    },
    getUntrusted() {
      // This is a bit ugly because isUntrusted() is async. Could do the work to cache
      //   it locally, but we really only need it for this call.
      if (this.isPrivate()) {
        return this.isUntrusted().then(untrusted => {
          if (untrusted) {
            return new Backbone.Collection([this]);
          }

          return new Backbone.Collection();
        });
      }
      return Promise.all(
        this.contactCollection.map(contact => {
          if (contact.isMe()) {
            return [false, contact];
          }
          return Promise.all([contact.isUntrusted(), contact]);
        })
      ).then(results => {
        const filtered = _.filter(results, result => {
          const untrusted = result[0];
          return untrusted;
        });
        return new Backbone.Collection(
          _.map(filtered, result => {
            const contact = result[1];
            return contact;
          })
        );
      });
    },
    onMemberVerifiedChange() {
      // If the verified state of a member changes, our aggregate state changes.
      // We trigger both events to replicate the behavior of Backbone.Model.set()
      this.trigger('change:verified', this);
      this.trigger('change', this);
    },
    toggleVerified() {
      if (this.isVerified()) {
        return this.setVerifiedDefault();
      }
      return this.setVerified();
    },

    async addKeyChange(keyChangedId) {
      window.log.info(
        'adding key change advisory for',
        this.idForLogging(),
        keyChangedId,
        this.get('timestamp')
      );

      const timestamp = Date.now();
      const message = {
        conversationId: this.id,
        type: 'keychange',
        sent_at: this.get('timestamp'),
        received_at: timestamp,
        key_changed: keyChangedId,
        unread: 1,
      };

      const id = await window.Signal.Data.saveMessage(message, {
        Message: Whisper.Message,
      });

      this.trigger(
        'newmessage',
        new Whisper.Message({
          ...message,
          id,
        })
      );
    },
    // Remove the message locally from our conversation
    async _removeMessage(id) {
      await window.Signal.Data.removeMessage(id, { Message: Whisper.Message });
      const existing = this.messageCollection.get(id);
      if (existing) {
        this.messageCollection.remove(id);
        existing.trigger('destroy');
      }
    },
    async addVerifiedChange(verifiedChangeId, verified, providedOptions) {
      const options = providedOptions || {};
      _.defaults(options, { local: true });

      if (this.isMe()) {
        window.log.info(
          'refusing to add verified change advisory for our own number'
        );
        return;
      }

      const lastMessage = this.get('timestamp') || Date.now();

      window.log.info(
        'adding verified change advisory for',
        this.idForLogging(),
        verifiedChangeId,
        lastMessage
      );

      const timestamp = Date.now();
      const message = {
        conversationId: this.id,
        type: 'verified-change',
        sent_at: lastMessage,
        received_at: timestamp,
        verifiedChanged: verifiedChangeId,
        verified,
        local: options.local,
        unread: 1,
      };

      const id = await window.Signal.Data.saveMessage(message, {
        Message: Whisper.Message,
      });

      this.trigger(
        'newmessage',
        new Whisper.Message({
          ...message,
          id,
        })
      );

      if (this.isPrivate()) {
        ConversationController.getAllGroupsInvolvingId(this.id).then(groups => {
          _.forEach(groups, group => {
            group.addVerifiedChange(this.id, verified, options);
          });
        });
      }
    },

    async onReadMessage(message, readAt) {
      // We mark as read everything older than this message - to clean up old stuff
      //   still marked unread in the database. If the user generally doesn't read in
      //   the desktop app, so the desktop app only gets read syncs, we can very
      //   easily end up with messages never marked as read (our previous early read
      //   sync handling, read syncs never sent because app was offline)

      // We queue it because we often get a whole lot of read syncs at once, and
      //   their markRead calls could very easily overlap given the async pull from DB.

      // Lastly, we don't send read syncs for any message marked read due to a read
      //   sync. That's a notification explosion we don't need.
      return this.queueJob(() =>
        this.markRead(message.get('received_at'), {
          sendReadReceipts: false,
          readAt,
        })
      );
    },

    getUnread() {
      return window.Signal.Data.getUnreadByConversation(this.id, {
        MessageCollection: Whisper.MessageCollection,
      });
    },

    validate(attributes) {
      const required = ['id', 'type'];
      const missing = _.filter(required, attr => !attributes[attr]);
      if (missing.length) {
        return `Conversation must have ${missing}`;
      }

      if (attributes.type !== 'private' && attributes.type !== 'group') {
        return `Invalid conversation type: ${attributes.type}`;
      }

      const error = this.validateNumber();
      if (error) {
        return error;
      }

      return null;
    },

    validateNumber() {
      if (!this.id) {
        return 'Invalid ID';
      }
      if (!this.isPrivate()) {
        return null;
      }

      // Check if it's hex
      const isHex = this.id.replace(/[\s]*/g, '').match(/^[0-9a-fA-F]+$/);
      if (!isHex) {
        return 'Invalid Hex ID';
      }

      // Check if the pubkey length is 33 and leading with 05 or of length 32
      const len = this.id.length;
      if ((len !== 33 * 2 || !/^05/.test(this.id)) && len !== 32 * 2) {
        return 'Invalid Pubkey Format';
      }

      this.set({ id: this.id });
      return null;
    },

    queueJob(callback) {
      const previous = this.pending || Promise.resolve();

      const taskWithTimeout = textsecure.createTaskWithTimeout(
        callback,
        `conversation ${this.idForLogging()}`
      );

      this.pending = previous.then(taskWithTimeout, taskWithTimeout);
      const current = this.pending;

      current.then(() => {
        if (this.pending === current) {
          delete this.pending;
        }
      });

      return current;
    },

    queueMessageSend(callback) {
      const taskWithTimeout = textsecure.createTaskWithTimeout(
        callback,
        `conversation ${this.idForLogging()}`
      );

      return this.messageSendQueue.add(taskWithTimeout);
    },

    getRecipients() {
      if (this.isPrivate()) {
        return [this.id];
      }
      const me = textsecure.storage.user.getNumber();
      return _.without(this.get('members'), me);
    },

    async getQuoteAttachment(attachments, preview) {
      if (attachments && attachments.length) {
        return Promise.all(
          attachments
            .filter(
              attachment =>
                attachment &&
                attachment.contentType &&
                !attachment.pending &&
                !attachment.error
            )
            .slice(0, 1)
            .map(async attachment => {
              const { fileName, thumbnail, contentType } = attachment;

              return {
                contentType,
                // Our protos library complains about this field being undefined, so we
                //   force it to null
                fileName: fileName || null,
                thumbnail: thumbnail
                  ? {
                      ...(await loadAttachmentData(thumbnail)),
                      objectUrl: getAbsoluteAttachmentPath(thumbnail.path),
                    }
                  : null,
              };
            })
        );
      }

      if (preview && preview.length) {
        return Promise.all(
          preview
            .filter(item => item && item.image)
            .slice(0, 1)
            .map(async attachment => {
              const { image } = attachment;
              const { contentType } = image;

              return {
                contentType,
                // Our protos library complains about this field being undefined, so we
                //   force it to null
                fileName: null,
                thumbnail: image
                  ? {
                      ...(await loadAttachmentData(image)),
                      objectUrl: getAbsoluteAttachmentPath(image.path),
                    }
                  : null,
              };
            })
        );
      }

      return [];
    },

    async makeQuote(quotedMessage) {
      const { getName } = Contact;
      const contact = quotedMessage.getContact();
      const attachments = quotedMessage.get('attachments');
      const preview = quotedMessage.get('preview');

      const body = quotedMessage.get('body');
      const embeddedContact = quotedMessage.get('contact');
      const embeddedContactName =
        embeddedContact && embeddedContact.length > 0
          ? getName(embeddedContact[0])
          : '';

      return {
        author: contact.id,
        id: quotedMessage.get('sent_at'),
        text: body || embeddedContactName,
        attachments: await this.getQuoteAttachment(attachments, preview),
      };
    },

    toOpenGroup() {
      if (!this.isPublic()) {
        return undefined;
      }

      return new libsession.Types.OpenGroup({
        server: this.get('server'),
        channel: this.get('channelId'),
        conversationId: this.id,
      });
    },

    async sendMessage(
      body,
      attachments,
      quote,
      preview,
      groupInvitation = null,
      otherOptions = {}
    ) {
      this.clearTypingTimers();

      const destination = this.id;
      const expireTimer = this.get('expireTimer');
      const recipients = this.getRecipients();

      this.queueJob(async () => {
        const now = Date.now();

        window.log.info(
          'Sending message to conversation',
          this.idForLogging(),
          'with timestamp',
          now
        );

        const conversationType = this.get('type');
        const messageWithSchema = await upgradeMessageSchema({
          type: 'outgoing',
          body,
          conversationId: destination,
          quote,
          preview,
          attachments,
          sent_at: now,
          received_at: now,
          expireTimer,
          recipients,
        });

        if (this.isPublic()) {
          // Public chats require this data to detect duplicates
          messageWithSchema.source = textsecure.storage.user.getNumber();
          messageWithSchema.sourceDevice = 1;
        } else {
          messageWithSchema.destination = destination;
        }

        const { sessionRestoration = false } = otherOptions;

        const attributes = {
          ...messageWithSchema,
          groupInvitation,
          sessionRestoration,
          id: window.getGuid(),
        };

        const model = this.addSingleMessage(attributes);
        const message = MessageController.register(model.id, model);

        await window.Signal.Data.saveMessage(message.attributes, {
          forceSave: true,
          Message: Whisper.Message,
        });

        if (this.isPrivate()) {
          message.set({ destination });
        }

        const id = await window.Signal.Data.saveMessage(message.attributes, {
          Message: Whisper.Message,
        });
        message.set({ id });

        this.set({
          lastMessage: model.getNotificationText(),
          lastMessageStatus: 'sending',
          active_at: now,
          timestamp: now,
          isArchived: false,
        });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });

        // We're offline!
        if (!textsecure.messaging) {
          const errors = this.contactCollection.map(contact => {
            const error = new Error('Network is not available');
            error.name = 'SendMessageNetworkError';
            error.number = contact.id;
            return error;
          });
          await message.saveErrors(errors);
          return null;
        }

        try {
          const uploads = await message.uploadData();

          const chatMessage = new libsession.Messages.Outgoing.ChatMessage({
            body: uploads.body,
            identifier: id,
            timestamp: now,
            attachments: uploads.attachments,
            expireTimer,
            preview: uploads.preview,
            quote: uploads.quote,
            lokiProfile: this.getOurProfile(),
          });

          if (this.isMe()) {
            return message.sendSyncMessageOnly(chatMessage);
          }
          const options = {};

          options.messageType = message.get('type');
          options.isPublic = this.isPublic();
          if (this.isPublic()) {
            const openGroup = this.toOpenGroup();

            const openGroupParams = {
              body,
              timestamp: now,
              group: openGroup,
              attachments: uploads.attachments,
              preview: uploads.preview,
              quote: uploads.quote,
              identifier: id,
            };
            const openGroupMessage = new libsession.Messages.Outgoing.OpenGroupMessage(
              openGroupParams
            );
            await libsession.getMessageQueue().sendToGroup(openGroupMessage);

            return null;
          }

          options.sessionRestoration = sessionRestoration;
          const destinationPubkey = new libsession.Types.PubKey(destination);
          // Handle Group Invitation Message
          if (groupInvitation) {
            if (conversationType !== Message.PRIVATE) {
              window.console.warning('Cannot send groupInvite to group chat');

              return null;
            }

            const groupInvitMessage = new libsession.Messages.Outgoing.GroupInvitationMessage(
              {
                identifier: id,
                timestamp: Date.now(),
                serverName: groupInvitation.name,
                channelId: groupInvitation.channelId,
                serverAddress: groupInvitation.address,
              }
            );

            return libsession
              .getMessageQueue()
              .sendUsingMultiDevice(destinationPubkey, groupInvitMessage);
          }

          if (conversationType === Message.PRIVATE) {
            return libsession
              .getMessageQueue()
              .sendUsingMultiDevice(destinationPubkey, chatMessage);
          }

          if (conversationType === Message.GROUP) {
            const members = this.get('members');
            if (this.isMediumGroup()) {
              const mediumGroupChatMessage = new libsession.Messages.Outgoing.MediumGroupChatMessage(
                {
                  chatMessage,
                  groupId: destination,
                }
              );

              await libsession
                .getMessageQueue()
                .send(destinationPubkey, mediumGroupChatMessage);
            } else {
              const closedGroupChatMessage = new libsession.Messages.Outgoing.ClosedGroupChatMessage(
                {
                  chatMessage,
                  groupId: destination,
                }
              );

              // Special-case the self-send case - we send only a sync message
              if (members.length === 1) {
                const isOurDevice = await libsession.Protocols.MultiDeviceProtocol.isOurDevice(
                  members[0]
                );
                if (isOurDevice) {
                  await message.sendSyncMessageOnly(closedGroupChatMessage);
                  return true;
                }
              }

              await libsession
                .getMessageQueue()
                .sendToGroup(closedGroupChatMessage);
            }
          } else {
            throw new TypeError(
              `Invalid conversation type: '${conversationType}'`
            );
          }

          return true;
        } catch (e) {
          await message.saveErrors(e);

          return null;
        }
      });
    },
    wrapSend(promise) {
      return promise.then(
        async result => {
          // success
          if (result) {
            await this.handleMessageSendResult({
              ...result,
              success: true,
            });
          }
          return result;
        },
        async result => {
          // failure
          if (result) {
            await this.handleMessageSendResult({
              ...result,
              success: false,
            });
          }
          throw result;
        }
      );
    },

    async updateAvatarOnPublicChat({ url, profileKey }) {
      if (!this.isPublic()) {
        return;
      }
      if (this.isRss()) {
        return;
      }
      if (!this.get('profileSharing')) {
        return;
      }

      if (profileKey && typeof profileKey !== 'string') {
        // eslint-disable-next-line no-param-reassign
        profileKey = window.Signal.Crypto.arrayBufferToBase64(profileKey);
      }
      const serverAPI = await lokiPublicChatAPI.findOrCreateServer(
        this.get('server')
      );
      await serverAPI.setAvatar(url, profileKey);
    },

    async handleMessageSendResult({ failoverNumbers, unidentifiedDeliveries }) {
      await Promise.all(
        (failoverNumbers || []).map(async number => {
          const conversation = ConversationController.get(number);

          if (
            conversation &&
            conversation.get('sealedSender') !== SEALED_SENDER.DISABLED
          ) {
            window.log.info(
              `Setting sealedSender to DISABLED for conversation ${conversation.idForLogging()}`
            );
            conversation.set({
              sealedSender: SEALED_SENDER.DISABLED,
            });
            await window.Signal.Data.updateConversation(
              conversation.id,
              conversation.attributes,
              { Conversation: Whisper.Conversation }
            );
          }
        })
      );

      await Promise.all(
        (unidentifiedDeliveries || []).map(async number => {
          const conversation = ConversationController.get(number);

          if (
            conversation &&
            conversation.get('sealedSender') === SEALED_SENDER.UNKNOWN
          ) {
            if (conversation.get('accessKey')) {
              window.log.info(
                `Setting sealedSender to ENABLED for conversation ${conversation.idForLogging()}`
              );
              conversation.set({
                sealedSender: SEALED_SENDER.ENABLED,
              });
            } else {
              window.log.info(
                `Setting sealedSender to UNRESTRICTED for conversation ${conversation.idForLogging()}`
              );
              conversation.set({
                sealedSender: SEALED_SENDER.UNRESTRICTED,
              });
            }
            await window.Signal.Data.updateConversation(
              conversation.id,
              conversation.attributes,
              { Conversation: Whisper.Conversation }
            );
          }
        })
      );
    },
    async updateLastMessage() {
      if (!this.id) {
        return;
      }

      const messages = await window.Signal.Data.getMessagesByConversation(
        this.id,
        { limit: 1, MessageCollection: Whisper.MessageCollection }
      );

      const lastMessageModel = messages.at(0);
      const lastMessageJSON = lastMessageModel
        ? lastMessageModel.toJSON()
        : null;
      const lastMessageStatusModel = lastMessageModel
        ? lastMessageModel.getMessagePropStatus()
        : null;
      const lastMessageUpdate = Conversation.createLastMessageUpdate({
        currentTimestamp: this.get('timestamp') || null,
        lastMessage: lastMessageJSON,
        lastMessageStatus: lastMessageStatusModel,
        lastMessageNotificationText: lastMessageModel
          ? lastMessageModel.getNotificationText()
          : null,
      });

      // Because we're no longer using Backbone-integrated saves, we need to manually
      //   clear the changed fields here so our hasChanged() check below is useful.
      this.changed = {};
      this.set(lastMessageUpdate);

      if (this.hasChanged()) {
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },

    async setArchived(isArchived) {
      this.set({ isArchived });
      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });
    },

    async updateExpirationTimer(
      providedExpireTimer,
      providedSource,
      receivedAt,
      options = {}
    ) {
      let expireTimer = providedExpireTimer;
      let source = providedSource;

      _.defaults(options, { fromSync: false, fromGroupUpdate: false });

      if (!expireTimer) {
        expireTimer = null;
      }
      if (
        this.get('expireTimer') === expireTimer ||
        (!expireTimer && !this.get('expireTimer'))
      ) {
        return null;
      }

      window.log.info("Update conversation 'expireTimer'", {
        id: this.idForLogging(),
        expireTimer,
        source,
      });

      source = source || textsecure.storage.user.getNumber();

      // When we add a disappearing messages notification to the conversation, we want it
      //   to be above the message that initiated that change, hence the subtraction.
      const timestamp = (receivedAt || Date.now()) - 1;

      this.set({ expireTimer });
      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });

      const message = this.messageCollection.add({
        // Even though this isn't reflected to the user, we want to place the last seen
        //   indicator above it. We set it to 'unread' to trigger that placement.
        unread: 1,
        conversationId: this.id,
        // No type; 'incoming' messages are specially treated by conversation.markRead()
        sent_at: timestamp,
        received_at: timestamp,
        flags: textsecure.protobuf.DataMessage.Flags.EXPIRATION_TIMER_UPDATE,
        expirationTimerUpdate: {
          expireTimer,
          source,
          fromSync: options.fromSync,
          fromGroupUpdate: options.fromGroupUpdate,
        },
      });

      message.set({ destination: this.id });

      if (message.isOutgoing()) {
        message.set({ recipients: this.getRecipients() });
      }

      const id = await window.Signal.Data.saveMessage(message.attributes, {
        Message: Whisper.Message,
      });
      message.set({ id });

      // if change was made remotely, don't send it to the number/group
      if (receivedAt) {
        return message;
      }

      let profileKey;
      if (this.get('profileSharing')) {
        profileKey = storage.get('profileKey');
      }

      const expireUpdate = {
        identifier: id,
        timestamp: message.get('sent_at'),
        expireTimer,
        profileKey,
      };

      if (this.isMe()) {
        const expirationTimerMessage = new libsession.Messages.Outgoing.ExpirationTimerUpdateMessage(
          expireUpdate
        );
        return message.sendSyncMessageOnly(expirationTimerMessage);
      }

      if (this.get('type') === 'private') {
        const expirationTimerMessage = new libsession.Messages.Outgoing.ExpirationTimerUpdateMessage(
          expireUpdate
        );
        const pubkey = new libsession.Types.PubKey(this.get('id'));
        await libsession
          .getMessageQueue()
          .sendUsingMultiDevice(pubkey, expirationTimerMessage);
      } else {
        expireUpdate.groupId = this.get('id');
        const expirationTimerMessage = new libsession.Messages.Outgoing.ExpirationTimerUpdateMessage(
          expireUpdate
        );
        // special case when we are the only member of a closed group
        const ourNumber = textsecure.storage.user.getNumber();
        const primary = await libsession.Protocols.MultiDeviceProtocol.getPrimaryDevice(
          ourNumber
        );
        if (
          this.get('members').length === 1 &&
          this.get('members')[0] === primary.key
        ) {
          return message.sendSyncMessageOnly(expirationTimerMessage);
        }
        await libsession.getMessageQueue().sendToGroup(expirationTimerMessage);
      }
      return message;
    },

    isSearchable() {
      return !this.get('left');
    },
    async setSessionResetStatus(newStatus) {
      // Ensure that the new status is a valid SessionResetEnum value
      if (!(newStatus in Object.values(SessionResetEnum))) {
        return;
      }
      if (this.get('sessionResetStatus') !== newStatus) {
        this.set({ sessionResetStatus: newStatus });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    async onSessionResetInitiated() {
      await this.setSessionResetStatus(SessionResetEnum.initiated);
    },
    async onSessionResetReceived() {
      await this.setSessionResetStatus(SessionResetEnum.request_received);
      // send empty message, this will trigger the new session to propagate
      // to the reset initiator.
      const user = new libsession.Types.PubKey(this.id);

      const sessionEstablished = new window.libsession.Messages.Outgoing.SessionEstablishedMessage(
        { timestamp: Date.now() }
      );
      await libsession.getMessageQueue().send(user, sessionEstablished);
    },

    isSessionResetReceived() {
      return (
        this.get('sessionResetStatus') === SessionResetEnum.request_received
      );
    },

    isSessionResetOngoing() {
      return this.get('sessionResetStatus') !== SessionResetEnum.none;
    },

    async createAndStoreEndSessionMessage(attributes) {
      const now = Date.now();
      const message = this.messageCollection.add({
        conversationId: this.id,
        type: 'outgoing',
        sent_at: now,
        received_at: now,
        destination: this.id,
        recipients: this.getRecipients(),
        flags: textsecure.protobuf.DataMessage.Flags.END_SESSION,
        ...attributes,
      });

      const id = await window.Signal.Data.saveMessage(message.attributes, {
        Message: Whisper.Message,
      });
      message.set({ id });
      return message;
    },

    async onNewSessionAdopted() {
      if (this.get('sessionResetStatus') === SessionResetEnum.initiated) {
        // send empty message to confirm that we have adopted the new session
        const user = new libsession.Types.PubKey(this.id);

        const sessionEstablished = new window.libsession.Messages.Outgoing.SessionEstablishedMessage(
          { timestamp: Date.now() }
        );
        await libsession.getMessageQueue().send(user, sessionEstablished);
      }
      await this.createAndStoreEndSessionMessage({
        type: 'incoming',
        endSessionType: 'done',
      });
      await this.setSessionResetStatus(SessionResetEnum.none);
    },

    async endSession() {
      if (this.isPrivate()) {
        // Only create a new message if *we* initiated the session reset.
        // On the receiver side, the actual message containing the END_SESSION flag
        // will ensure the "session reset" message will be added to their conversation.
        if (
          this.get('sessionResetStatus') !== SessionResetEnum.request_received
        ) {
          await this.onSessionResetInitiated();
          const message = await this.createAndStoreEndSessionMessage({
            type: 'outgoing',
            endSessionType: 'ongoing',
          });
          window.log.info('resetting secure session');
          const device = new libsession.Types.PubKey(this.id);
          const preKeyBundle = await window.libloki.storage.getPreKeyBundleForContact(
            device.key
          );
          const endSessionMessage = new libsession.Messages.Outgoing.EndSessionMessage(
            {
              timestamp: message.get('sent_at'),
              preKeyBundle,
            }
          );

          await libsession.getMessageQueue().send(device, endSessionMessage);
          // TODO handle errors to reset session reset status with the new pipeline
          if (message.hasErrors()) {
            await this.setSessionResetStatus(SessionResetEnum.none);
          }
        }
      }
    },

    async saveChangesToDB() {
      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });
    },

    async updateGroup(providedGroupUpdate) {
      let groupUpdate = providedGroupUpdate;

      if (this.isPrivate()) {
        throw new Error('Called update group on private conversation');
      }
      if (groupUpdate === undefined) {
        groupUpdate = this.pick(['name', 'avatar', 'members']);
      }
      const now = Date.now();

      const message = this.messageCollection.add({
        conversationId: this.id,
        type: 'outgoing',
        sent_at: now,
        received_at: now,
        group_update: _.pick(groupUpdate, [
          'name',
          'members',
          'avatar',
          'admins',
        ]),
      });

      const messageId = await window.Signal.Data.saveMessage(
        message.attributes,
        {
          Message: Whisper.Message,
        }
      );
      message.set({ id: messageId });

      // TODO: if I added members, it is my responsibility to generate ratchet keys for them

      // Difference between `recipients` and `members` is that `recipients` includes the members which were removed in this update
      const { id, name, members, avatar, recipients } = groupUpdate;

      if (groupUpdate.is_medium_group) {
        const { secretKey, senderKeys } = groupUpdate;

        const membersBin = members.map(
          pkHex => new Uint8Array(StringView.hexToArrayBuffer(pkHex))
        );
        const adminsBin = this.get('groupAdmins').map(
          pkHex => new Uint8Array(StringView.hexToArrayBuffer(pkHex))
        );

        const createParams = {
          timestamp: now,
          groupId: id,
          identifier: messageId,
          groupSecretKey: secretKey,
          members: membersBin,
          groupName: name,
          admins: adminsBin,
          senderKeys,
        };

        const mediumGroupCreateMessage = new libsession.Messages.Outgoing.MediumGroupCreateMessage(
          createParams
        );

        members.forEach(async member => {
          const memberPubKey = new libsession.Types.PubKey(member);
          libsession
            .getMessageQueue()
            .sendUsingMultiDevice(memberPubKey, mediumGroupCreateMessage);
        });

        return;
      }

      const updateParams = {
        // if we do set an identifier here, be sure to not sync the message two times in msg.handleMessageSentSuccess()
        identifier: messageId,
        timestamp: now,
        groupId: id,
        name: name || this.getName(),
        avatar,
        members,
        admins: this.get('groupAdmins'),
      };
      const groupUpdateMessage = new libsession.Messages.Outgoing.ClosedGroupUpdateMessage(
        updateParams
      );

      await this.sendClosedGroupMessage(
        groupUpdateMessage,
        recipients,
        message
      );

      if (groupUpdate.joined && groupUpdate.joined.length) {
        const expireUpdate = {
          timestamp: Date.now(),
          expireTimer: this.get('expireTimer'),
          groupId: this.get('id'),
        };

        const expirationTimerMessage = new libsession.Messages.Outgoing.ExpirationTimerUpdateMessage(
          expireUpdate
        );
        await Promise.all(
          groupUpdate.joined.map(async join => {
            const device = new libsession.Types.PubKey(join);
            await libsession
              .getMessageQueue()
              .sendUsingMultiDevice(device, expirationTimerMessage)
              .catch(log.error);
          })
        );
      }
    },

    async sendGroupInfo(recipient) {
      // Only send group info if we're a closed group and we haven't left
      if (this.isClosedGroup() && !this.get('left')) {
        const updateParams = {
          timestamp: Date.now(),
          groupId: this.id,
          name: this.get('name'),
          avatar: this.get('avatar'),
          members: this.get('members'),
          admins: this.get('groupAdmins'),
        };
        const groupUpdateMessage = new libsession.Messages.Outgoing.ClosedGroupUpdateMessage(
          updateParams
        );
        const recipientPubKey = new libsession.Types.PubKey(recipient);
        if (!recipientPubKey) {
          window.console.warn('sendGroupInfo invalid pubkey:', recipient);
          return;
        }

        try {
          await libsession
            .getMessageQueue()
            .send(recipientPubKey, groupUpdateMessage);

          const expireUpdate = {
            timestamp: Date.now(),
            expireTimer: this.get('expireTimer'),
            groupId: this.get('id'),
          };

          const expirationTimerMessage = new libsession.Messages.Outgoing.ExpirationTimerUpdateMessage(
            expireUpdate
          );

          await libsession
            .getMessageQueue()
            .sendUsingMultiDevice(recipientPubKey, expirationTimerMessage);
        } catch (e) {
          log.error('Failed to send groupInfo:', e);
        }
      }
    },

    async leaveGroup() {
      const now = Date.now();

      if (this.isMediumGroup()) {
        // NOTE: we should probably remove sender keys for groupId,
        // and its secret key, but it is low priority

        // TODO: need to reset everyone's sender keys
        window.SwarmPolling.removePubkey(this.id);
      }

      if (this.get('type') === 'group') {
        this.set({ left: true });

        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });

        const message = this.messageCollection.add({
          group_update: { left: 'You' },
          conversationId: this.id,
          type: 'outgoing',
          sent_at: now,
          received_at: now,
        });

        const id = await window.Signal.Data.saveMessage(message.attributes, {
          Message: Whisper.Message,
        });
        message.set({ id });

        // FIXME what about public groups?
        const quitGroup = {
          identifier: id,
          timestamp: now,
          groupId: this.id,
          // if we do set an identifier here, be sure to not sync it a second time in handleMessageSentSuccess()
        };
        const quitGroupMessage = new libsession.Messages.Outgoing.ClosedGroupLeaveMessage(
          quitGroup
        );

        await this.sendClosedGroupMessage(quitGroupMessage, undefined, message);

        this.updateTextInputState();
      }
    },

    async sendClosedGroupMessage(message, recipients, dbMessage) {
      const {
        ClosedGroupMessage,
        ClosedGroupChatMessage,
      } = libsession.Messages.Outgoing;
      if (!(message instanceof ClosedGroupMessage)) {
        throw new Error('Invalid closed group message.');
      }

      // Sync messages for Chat Messages need to be constructed after confirming send was successful.
      if (message instanceof ClosedGroupChatMessage) {
        throw new Error(
          'ClosedGroupChatMessage should be constructed manually and sent'
        );
      }

      const members = recipients || this.get('members');

      try {
        // Exclude our device from members and send them the message
        const ourNumber = textsecure.storage.user.getNumber();
        const primary = await libsession.Protocols.MultiDeviceProtocol.getPrimaryDevice(
          ourNumber
        );
        const otherMembers = (members || []).filter(
          member => !primary.isEqual(member)
        );
        // we are the only member in here
        if (members.length === 1 && members[0] === primary.key) {
          dbMessage.sendSyncMessageOnly(message);
          return;
        }
        const sendPromises = otherMembers.map(member => {
          const memberPubKey = libsession.Types.PubKey.cast(member);
          return libsession
            .getMessageQueue()
            .sendUsingMultiDevice(memberPubKey, message);
        });
        await Promise.all(sendPromises);
      } catch (e) {
        window.log.error(e);
      }
    },

    async markRead(newestUnreadDate, providedOptions) {
      const options = providedOptions || {};
      _.defaults(options, { sendReadReceipts: true });

      const conversationId = this.id;
      Whisper.Notifications.remove(
        Whisper.Notifications.where({
          conversationId,
        })
      );

      let unreadMessages = await this.getUnread();
      const oldUnread = unreadMessages.filter(
        message => message.get('received_at') <= newestUnreadDate
      );

      let read = await Promise.all(
        _.map(oldUnread, async providedM => {
          const m = MessageController.register(providedM.id, providedM);

          if (!this.messageCollection.get(m.id)) {
            window.log.warn(
              'Marked a message as read in the database, but ' +
                'it was not in messageCollection.'
            );
          }

          await m.markRead(options.readAt);
          const errors = m.get('errors');
          return {
            sender: m.get('source'),
            timestamp: m.get('sent_at'),
            hasErrors: Boolean(errors && errors.length),
          };
        })
      );

      // Some messages we're marking read are local notifications with no sender
      read = _.filter(read, m => Boolean(m.sender));
      unreadMessages = unreadMessages.filter(m => Boolean(m.isIncoming()));

      const unreadCount = unreadMessages.length - read.length;
      this.set({ unreadCount });

      const mentionRead = (() => {
        const stillUnread = unreadMessages.filter(
          m => m.get('received_at') > newestUnreadDate
        );
        const ourNumber = textsecure.storage.user.getNumber();
        return !stillUnread.some(
          m =>
            m.propsForMessage &&
            m.propsForMessage.text &&
            m.propsForMessage.text.indexOf(`@${ourNumber}`) !== -1
        );
      })();

      if (mentionRead) {
        this.set({ mentionedUs: false });
      }

      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });

      // If a message has errors, we don't want to send anything out about it.
      //   read syncs - let's wait for a client that really understands the message
      //      to mark it read. we'll mark our local error read locally, though.
      //   read receipts - here we can run into infinite loops, where each time the
      //      conversation is viewed, another error message shows up for the contact
      read = read.filter(item => !item.hasErrors);

      if (this.isPublic()) {
        window.console.debug(
          'public conversation... No need to send read receipt'
        );
        return;
      }

      const devicePubkey = new libsession.Types.PubKey(this.id);
      const hasSession = await libsession.Protocols.SessionProtocol.hasSession(
        devicePubkey
      );
      if (!hasSession) {
        return;
      }

      if (this.isPrivate() && read.length && options.sendReadReceipts) {
        window.log.info(`Sending ${read.length} read receipts`);
        // Because syncReadMessages sends to our other devices, and sendReadReceipts goes
        //   to a contact, we need accessKeys for both.
        const { sendOptions } = ConversationController.prepareForSend(
          this.ourNumber,
          { syncMessage: true }
        );
        await textsecure.messaging.syncReadMessages(read, sendOptions);

        // FIXME AUDRIC
        // if (storage.get('read-receipt-setting')) {
        //   await Promise.all(
        //     _.map(_.groupBy(read, 'sender'), async (receipts, sender) => {
        //       const timestamps = _.map(receipts, 'timestamp');
        //       const receiptMessage = new libsession.Messages.Outgoing.ReadReceiptMessage(
        //         {
        //           timestamp: Date.now(),
        //           timestamps,
        //         }
        //       );

        //       const device = new libsession.Types.PubKey(sender);
        //       await libsession
        //         .getMessageQueue()
        //         .sendUsingMultiDevice(device, receiptMessage);
        //     })
        //   );
        // }
      }
    },

    // LOKI PROFILES
    async setNickname(nickname) {
      const trimmed = nickname && nickname.trim();
      if (this.get('nickname') === trimmed) {
        return;
      }

      this.set({ nickname: trimmed });
      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });

      await this.updateProfileName();
    },
    async setLokiProfile(newProfile) {
      if (!_.isEqual(this.get('profile'), newProfile)) {
        this.set({ profile: newProfile });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }

      // if set to null, it will show a jazzIcon
      await this.setProfileAvatar({ path: newProfile.avatar });

      await this.updateProfileName();
    },
    async updateProfileName() {
      // Prioritise nickname over the profile display name
      const nickname = this.getNickname();
      const profile = this.getLokiProfile();
      const displayName = profile && profile.displayName;

      const profileName = nickname || displayName || null;
      await this.setProfileName(profileName);
    },
    getLokiProfile() {
      return this.get('profile');
    },
    getNickname() {
      return this.get('nickname');
    },
    getRssSettings() {
      if (!this.isRss()) {
        return null;
      }
      return {
        RSS_FEED: this.get('rssFeed'),
        CONVO_ID: this.id,
        title: this.get('name'),
        closeable: this.get('closable'),
      };
    },
    // maybe "Backend" instead of "Source"?
    async setPublicSource(newServer, newChannelId) {
      if (!this.isPublic()) {
        log.warn(
          `trying to setPublicSource on non public chat conversation ${this.id}`
        );
        return;
      }
      if (
        this.get('server') !== newServer ||
        this.get('channelId') !== newChannelId
      ) {
        // mark active so it's not in the contacts list but in the conversation list
        this.set({
          server: newServer,
          channelId: newChannelId,
          active_at: Date.now(),
        });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    getPublicSource() {
      if (!this.isPublic()) {
        log.warn(
          `trying to getPublicSource on non public chat conversation ${this.id}`
        );
        return null;
      }
      return {
        server: this.get('server'),
        channelId: this.get('channelId'),
        conversationId: this.get('id'),
      };
    },
    async getPublicSendData() {
      const channelAPI = await lokiPublicChatAPI.findOrCreateChannel(
        this.get('server'),
        this.get('channelId'),
        this.id
      );
      return channelAPI;
    },
    getLastRetrievedMessage() {
      if (!this.isPublic()) {
        return null;
      }
      const lastMessageId = this.get('lastPublicMessage') || 0;
      return lastMessageId;
    },
    async setLastRetrievedMessage(newLastMessageId) {
      if (!this.isPublic()) {
        return;
      }
      if (this.get('lastPublicMessage') !== newLastMessageId) {
        this.set({ lastPublicMessage: newLastMessageId });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    isModerator(pubKey) {
      if (!this.isPublic()) {
        return false;
      }
      const moderators = this.get('moderators');
      return Array.isArray(moderators) && moderators.includes(pubKey);
    },
    async setModerators(moderators) {
      if (!this.isPublic()) {
        return;
      }
      // TODO: compare array properly
      if (!_.isEqual(this.get('moderators'), moderators)) {
        this.set({ moderators });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },

    // SIGNAL PROFILES

    onChangeProfileKey() {
      if (this.isPrivate()) {
        this.getProfiles();
      }
    },

    getProfiles() {
      // request all conversation members' keys
      let ids = [];
      if (this.isPrivate()) {
        ids = [this.id];
      } else {
        ids = this.get('members');
      }
      return Promise.all(_.map(ids, this.getProfile));
    },

    // This function is wrongly named by signal
    // This is basically an `update` function and thus we have overwritten it with such
    async getProfile(id) {
      const c = await ConversationController.getOrCreateAndWait(id, 'private');

      // We only need to update the profile as they are all stored inside the conversation
      await c.updateProfileName();
    },
    async setProfileName(name) {
      const profileName = this.get('profileName');
      if (profileName !== name) {
        this.set({ profileName: name });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    async setGroupName(name) {
      const profileName = this.get('name');
      if (profileName !== name) {
        this.set({ name });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    async setSubscriberCount(count) {
      this.set({ subscriberCount: count });
      // Not sure if we care about updating the database
    },
    async setGroupNameAndAvatar(name, avatarPath) {
      const currentName = this.get('name');
      const profileAvatar = this.get('profileAvatar');
      if (profileAvatar !== avatarPath || currentName !== name) {
        // only update changed items
        if (profileAvatar !== avatarPath) {
          this.set({ profileAvatar: avatarPath });
        }
        if (currentName !== name) {
          this.set({ name });
        }
        // save
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    async setProfileAvatar(avatar) {
      const profileAvatar = this.get('profileAvatar');
      if (profileAvatar !== avatar) {
        this.set({ profileAvatar: avatar });
        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },
    async setProfileKey(profileKey) {
      // profileKey is a string so we can compare it directly
      if (this.get('profileKey') !== profileKey) {
        window.log.info(
          `Setting sealedSender to UNKNOWN for conversation ${this.idForLogging()}`
        );
        this.set({
          profileKey,
          accessKey: null,
          sealedSender: SEALED_SENDER.UNKNOWN,
        });

        await this.deriveAccessKeyIfNeeded();

        await window.Signal.Data.updateConversation(this.id, this.attributes, {
          Conversation: Whisper.Conversation,
        });
      }
    },

    async deriveAccessKeyIfNeeded() {
      const profileKey = this.get('profileKey');
      if (!profileKey) {
        return;
      }
      if (this.get('accessKey')) {
        return;
      }

      const profileKeyBuffer = window.Signal.Crypto.base64ToArrayBuffer(
        profileKey
      );
      const accessKeyBuffer = await window.Signal.Crypto.deriveAccessKey(
        profileKeyBuffer
      );
      const accessKey = window.Signal.Crypto.arrayBufferToBase64(
        accessKeyBuffer
      );
      this.set({ accessKey });
    },

    async upgradeMessages(messages) {
      for (let max = messages.length, i = 0; i < max; i += 1) {
        const message = messages.at(i);
        const { attributes } = message;
        const { schemaVersion } = attributes;

        if (schemaVersion < Message.VERSION_NEEDED_FOR_DISPLAY) {
          // Yep, we really do want to wait for each of these
          // eslint-disable-next-line no-await-in-loop
          const upgradedMessage = await upgradeMessageSchema(attributes);
          message.set(upgradedMessage);
          // eslint-disable-next-line no-await-in-loop
          await window.Signal.Data.saveMessage(upgradedMessage, {
            Message: Whisper.Message,
          });
        }
      }
    },

    async fetchMessages() {
      if (!this.id) {
        throw new Error('This conversation has no id!');
      }
      if (this.inProgressFetch) {
        window.log.warn('Attempting to start a parallel fetchMessages() call');
        return;
      }

      this.inProgressFetch = this.messageCollection.fetchConversation(
        this.id,
        undefined,
        this.get('unreadCount')
      );

      await this.inProgressFetch;

      try {
        // We are now doing the work to upgrade messages before considering the load from
        //   the database complete. Note that we do save messages back, so it is a
        //   one-time hit. We do this so we have guarantees about message structure.
        await this.upgradeMessages(this.messageCollection);
      } catch (error) {
        window.log.error(
          'fetchMessages: failed to upgrade messages',
          Errors.toLogFormat(error)
        );
      }

      this.inProgressFetch = null;
    },

    hasMember(number) {
      return _.contains(this.get('members'), number);
    },
    fetchContacts() {
      if (this.isPrivate()) {
        this.contactCollection.reset([this]);
        return Promise.resolve();
      }
      const members = this.get('members') || [];
      const promises = members.map(number =>
        ConversationController.getOrCreateAndWait(number, 'private')
      );

      return Promise.all(promises).then(contacts => {
        _.forEach(contacts, contact => {
          this.listenTo(
            contact,
            'change:verified',
            this.onMemberVerifiedChange
          );
        });

        this.contactCollection.reset(contacts);
      });
    },

    copyPublicKey() {
      clipboard.writeText(this.id);

      const isGroup = this.getProps().type === 'group';
      const copiedMessage = isGroup
        ? i18n('copiedChatId')
        : i18n('copiedPublicKey');

      window.pushToast({
        title: copiedMessage,
        type: 'success',
        id: 'copiedPublicKey',
      });
    },

    changeNickname() {
      window.Whisper.events.trigger('showNicknameDialog', {
        pubKey: this.id,
        nickname: this.getNickname(),
        onOk: newName => this.setNickname(newName),
      });
    },

    deleteContact() {
      let title = i18n('deleteContact');
      let message = i18n('deleteContactConfirmation');

      if (this.isPublic()) {
        title = i18n('deletePublicChannel');
        message = i18n('deletePublicChannelConfirmation');
      } else if (this.isClosedGroup()) {
        title = i18n('leaveClosedGroup');
        message = i18n('leaveClosedGroupConfirmation');
      }

      window.confirmationDialog({
        title,
        message,
        resolve: () => {
          ConversationController.deleteContact(this.id);
        },
      });
    },

    async deletePublicMessages(messages) {
      const channelAPI = await this.getPublicSendData();
      if (!channelAPI) {
        return false;
      }

      const invalidMessages = messages.filter(m => !m.getServerId());
      const pendingMessages = messages.filter(m => m.getServerId());

      let deletedServerIds = [];
      let ignoredServerIds = [];

      if (pendingMessages.length > 0) {
        const result = await channelAPI.deleteMessages(
          pendingMessages.map(m => m.getServerId())
        );
        deletedServerIds = result.deletedIds;
        ignoredServerIds = result.ignoredIds;
      }

      const toDeleteLocallyServerIds = _.union(
        deletedServerIds,
        ignoredServerIds
      );
      let toDeleteLocally = messages.filter(m =>
        toDeleteLocallyServerIds.includes(m.getServerId())
      );
      toDeleteLocally = _.union(toDeleteLocally, invalidMessages);

      toDeleteLocally.forEach(m => this.removeMessage(m.id));

      return toDeleteLocally;
    },

    removeMessage(messageId) {
      const message = this.messageCollection.models.find(
        msg => msg.id === messageId
      );
      if (message) {
        message.trigger('unload');
        this.messageCollection.remove(messageId);
      }
    },

    deleteMessages() {
      this.resetMessageSelection();

      let params;
      if (this.isPublic()) {
        params = {
          title: i18n('deleteMessages'),
          message: i18n('deletePublicConversationConfirmation'),
          resolve: () => ConversationController.deleteContact(this.id),
        };
      } else {
        params = {
          title: i18n('deleteMessages'),
          message: i18n('deleteConversationConfirmation'),
          resolve: () => this.destroyMessages(),
        };
      }

      window.confirmationDialog(params);
    },

    async destroyMessages() {
      await window.Signal.Data.removeAllMessagesInConversation(this.id, {
        MessageCollection: Whisper.MessageCollection,
      });

      this.messageCollection.reset([]);

      // let's try to keep the RSS conversation open just empty...
      if (this.isRss()) {
        this.set({
          lastMessage: null,
        });
      } else {
        // this will remove the conversation from conversation lists...
        this.set({
          lastMessage: null,
          timestamp: null,
          active_at: null,
        });
      }

      await window.Signal.Data.updateConversation(this.id, this.attributes, {
        Conversation: Whisper.Conversation,
      });
    },

    getName() {
      if (this.isPrivate()) {
        return this.get('name');
      }
      return this.get('name') || i18n('unknownGroup');
    },

    getTitle() {
      if (this.isPrivate()) {
        const profileName = this.getProfileName();
        const number = this.getNumber();
        const name = profileName ? `${profileName} (${number})` : number;
        return this.get('name') || name;
      }
      return this.get('name') || 'Unknown group';
    },

    getProfileName() {
      if (this.isPrivate() && !this.get('name')) {
        return this.get('profileName');
      }
      return null;
    },

    getDisplayName() {
      if (!this.isPrivate()) {
        return this.getTitle();
      }

      const name = this.get('name');
      if (name) {
        return name;
      }

      const profileName = this.get('profileName');
      if (profileName) {
        return `${this.getNumber()} ~${profileName}`;
      }

      return this.getNumber();
    },
    /**
     * Returns
     *   displayName: string;
     *   avatarPointer: string;
     *   profileKey: Uint8Array;
     */
    getOurProfile() {
      try {
        // Secondary devices have their profile stored
        // in their primary device's conversation
        const ourNumber = window.storage.get('primaryDevicePubKey');
        const ourConversation = window.ConversationController.get(ourNumber);
        let profileKey = null;
        if (this.get('profileSharing')) {
          profileKey = new Uint8Array(storage.get('profileKey'));
        }
        const avatarPointer = ourConversation.get('avatarPointer');
        const { displayName } = ourConversation.getLokiProfile();
        return { displayName, avatarPointer, profileKey };
      } catch (e) {
        window.log.error(`Failed to get our profile: ${e}`);
        return null;
      }
    },

    getNumber() {
      if (!this.isPrivate()) {
        return '';
      }
      return this.id;
    },

    getInitials(name) {
      if (!name) {
        return null;
      }

      const cleaned = name.replace(/[^A-Za-z\s]+/g, '').replace(/\s+/g, ' ');
      const parts = cleaned.split(' ');
      const initials = parts.map(part => part.trim()[0]);
      if (!initials.length) {
        return null;
      }

      return initials.slice(0, 2).join('');
    },

    isPrivate() {
      return this.get('type') === 'private';
    },

    getColor() {
      if (!this.isPrivate()) {
        return 'signal-blue';
      }

      const { migrateColor } = Util;
      return migrateColor(this.get('color'));
    },
    getAvatarPath() {
      const avatar = this.get('avatar') || this.get('profileAvatar');

      if (typeof avatar === 'string') {
        return avatar;
      }

      if (avatar && avatar.path && typeof avatar.path === 'string') {
        return getAbsoluteAttachmentPath(avatar.path);
      }

      return null;
    },
    getAvatar() {
      const title = this.get('name');
      const color = this.getColor();
      const url = this.getAvatarPath();

      if (url) {
        return { url, color };
      } else if (this.isPrivate()) {
        const symbol = this.isValid() ? '#' : '!';
        return {
          color,
          content: this.getInitials(title) || symbol,
        };
      }
      return { url: 'images/group_default.png', color };
    },

    getNotificationIcon() {
      return new Promise(resolve => {
        const avatar = this.getAvatar();
        if (avatar.url) {
          resolve(avatar.url);
        } else {
          resolve(new Whisper.IdenticonSVGView(avatar).getDataUrl());
        }
      });
    },

    notify(message) {
      if (!message.isIncoming()) {
        return Promise.resolve();
      }
      const conversationId = this.id;

      return ConversationController.getOrCreateAndWait(
        message.get('source'),
        'private'
      ).then(sender =>
        sender.getNotificationIcon().then(iconUrl => {
          const messageJSON = message.toJSON();
          const messageSentAt = messageJSON.sent_at;
          const messageId = message.id;
          const isExpiringMessage = Message.hasExpiration(messageJSON);

          // window.log.info('Add notification', {
          //   conversationId: this.idForLogging(),
          //   isExpiringMessage,
          //   messageSentAt,
          // });
          Whisper.Notifications.add({
            conversationId,
            iconUrl,
            isExpiringMessage,
            message: message.getNotificationText(),
            messageId,
            messageSentAt,
            title: sender.getTitle(),
          });
        })
      );
    },
    notifyTyping(options = {}) {
      const { isTyping, sender, senderDevice } = options;

      // We don't do anything with typing messages from our other devices
      if (sender === this.ourNumber) {
        return;
      }

      // For groups, block typing messages from non-members (e.g. from kicked members)
      if (this.get('type') === 'group') {
        const knownMembers = this.get('members');

        if (knownMembers) {
          const fromMember = knownMembers.includes(sender);

          if (!fromMember) {
            window.log.warn(
              'Blocking typing messages from a non-member: ',
              sender
            );
            return;
          }
        }
      }

      const identifier = `${sender}.${senderDevice}`;

      this.contactTypingTimers = this.contactTypingTimers || {};
      const record = this.contactTypingTimers[identifier];

      if (record) {
        clearTimeout(record.timer);
      }

      // Note: We trigger two events because:
      //   'typing-update' is a surgical update ConversationView does for in-convo bubble
      //   'change' causes a re-render of this conversation's list item in the left pane

      if (isTyping) {
        this.contactTypingTimers[identifier] = this.contactTypingTimers[
          identifier
        ] || {
          timestamp: Date.now(),
          sender,
          senderDevice,
        };

        this.contactTypingTimers[identifier].timer = setTimeout(
          this.clearContactTypingTimer.bind(this, identifier),
          15 * 1000
        );
        if (!record) {
          // User was not previously typing before. State change!
          this.trigger('typing-update');
          this.trigger('change', this);
        }
      } else {
        delete this.contactTypingTimers[identifier];
        if (record) {
          // User was previously typing, and is no longer. State change!
          this.trigger('typing-update');
          this.trigger('change', this);
        }
      }
    },

    clearContactTypingTimer(identifier) {
      this.contactTypingTimers = this.contactTypingTimers || {};
      const record = this.contactTypingTimers[identifier];

      if (record) {
        clearTimeout(record.timer);
        delete this.contactTypingTimers[identifier];

        // User was previously typing, but timed out or we received message. State change!
        this.trigger('typing-update');
        this.trigger('change', this);
      }
    },
  });

  Whisper.ConversationCollection = Backbone.Collection.extend({
    model: Whisper.Conversation,

    comparator(m) {
      return -m.get('timestamp');
    },

    async destroyAll() {
      await Promise.all(
        this.models.map(conversation =>
          window.Signal.Data.removeConversation(conversation.id, {
            Conversation: Whisper.Conversation,
          })
        )
      );
      this.reset([]);
    },
  });

  Whisper.Conversation.COLORS = COLORS.concat(['grey', 'default']).join(' ');
})();
