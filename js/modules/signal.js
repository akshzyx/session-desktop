// The idea with this file is to make it webpackable for the style guide

const Crypto = require('./crypto');
const Data = require('../../ts/data/data');
const Emoji = require('../../ts/util/emoji');
const Notifications = require('../../ts/notifications');
const OS = require('../../ts/OS');
const Settings = require('./settings');
const Util = require('../../ts/util');
const LinkPreviews = require('./link_previews');
const { Message } = require('../../ts/components/conversation/Message');

// Components
const { SessionRegistrationView } = require('../../ts/components/session/SessionRegistrationView');

const { SessionInboxView } = require('../../ts/components/session/SessionInboxView');

// Types
const AttachmentType = require('./types/attachment');
const VisualAttachment = require('./types/visual_attachment');
const Contact = require('../../ts/types/Contact');
const Conversation = require('./types/conversation');
const Errors = require('./types/errors');
const MessageType = require('./types/message');
const MIME = require('../../ts/types/MIME');
const SettingsType = require('../../ts/types/Settings');

// Views
const Initialization = require('./views/initialization');

function initializeMigrations({ userDataPath, Attachments, Type, VisualType, logger }) {
  if (!Attachments) {
    return null;
  }
  const {
    getPath,
    createReader,
    createAbsolutePathGetter,
    createWriterForNew,
    createWriterForExisting,
  } = Attachments;
  const {
    makeObjectUrl,
    revokeObjectUrl,
    getImageDimensions,
    makeImageThumbnail,
    makeVideoScreenshot,
  } = VisualType;

  const attachmentsPath = getPath(userDataPath);
  const readAttachmentData = createReader(attachmentsPath);
  const loadAttachmentData = Type.loadData(readAttachmentData);
  const loadPreviewData = MessageType.loadPreviewData(loadAttachmentData);
  const loadQuoteData = MessageType.loadQuoteData(loadAttachmentData);
  const getAbsoluteAttachmentPath = createAbsolutePathGetter(attachmentsPath);
  const deleteOnDisk = Attachments.createDeleter(attachmentsPath);
  const writeNewAttachmentData = createWriterForNew(attachmentsPath);

  return {
    attachmentsPath,
    deleteAttachmentData: deleteOnDisk,
    deleteExternalMessageFiles: MessageType.deleteAllExternalFiles({
      deleteAttachmentData: Type.deleteData(deleteOnDisk),
      deleteOnDisk,
    }),
    getAbsoluteAttachmentPath,
    loadAttachmentData,
    loadMessage: MessageType.createAttachmentLoader(loadAttachmentData),
    loadPreviewData,
    loadQuoteData,
    readAttachmentData,
    processNewAttachment: attachment =>
      MessageType.processNewAttachment(attachment, {
        writeNewAttachmentData,
        getAbsoluteAttachmentPath,
        makeObjectUrl,
        revokeObjectUrl,
        getImageDimensions,
        makeImageThumbnail,
        makeVideoScreenshot,
        logger,
      }),
    upgradeMessageSchema: (message, options = {}) => {
      const { maxVersion } = options;

      return MessageType.upgradeSchema(message, {
        writeNewAttachmentData,
        getAbsoluteAttachmentPath,
        makeObjectUrl,
        revokeObjectUrl,
        getImageDimensions,
        makeImageThumbnail,
        makeVideoScreenshot,
        logger,
        maxVersion,
      });
    },
    writeMessageAttachments: MessageType.createAttachmentDataWriter({
      writeExistingAttachmentData: createWriterForExisting(attachmentsPath),
      logger,
    }),
    writeNewAttachmentData: createWriterForNew(attachmentsPath),
    writeAttachment: ({ data, path }) => createWriterForExisting(attachmentsPath)({ data, path }),
  };
}

exports.setup = (options = {}) => {
  const { Attachments, userDataPath, logger } = options;

  Data.init();

  const Migrations = initializeMigrations({
    userDataPath,
    Attachments,
    Type: AttachmentType,
    VisualType: VisualAttachment,
    logger,
  });

  const Components = {
    SessionInboxView,
    SessionRegistrationView,
    Message,
  };

  const Types = {
    Attachment: AttachmentType,
    Contact,
    Conversation,
    Errors,
    Message: MessageType,
    MIME,
    Settings: SettingsType,
    VisualAttachment,
  };

  const Views = {
    Initialization,
  };

  return {
    Components,
    Crypto,
    Data,
    Emoji,
    LinkPreviews,
    Migrations,
    Notifications,
    OS,
    Settings,
    Types,
    Util,
    Views,
  };
};
