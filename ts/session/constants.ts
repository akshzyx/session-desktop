import { DAYS, SECONDS } from './utils/Number';
// tslint:disable: binary-expression-operand-order

export const TTL_DEFAULT = {
  TYPING_MESSAGE: 20 * SECONDS,
  TTL_MAX: 14 * DAYS,
};

export const PROTOCOLS = {
  // tslint:disable-next-line: no-http-string
  HTTP: 'http:',
  HTTPS: 'https:',
};

// User Interface
export const CONVERSATION = {
  DEFAULT_MEDIA_FETCH_COUNT: 50,
  DEFAULT_DOCUMENTS_FETCH_COUNT: 150,
  DEFAULT_MESSAGE_FETCH_COUNT: 30,
  MAX_MESSAGE_FETCH_COUNT: 1000,
  // Maximum voice message duraton of 5 minutes
  // which equates to 1.97 MB
  MAX_VOICE_MESSAGE_DURATION: 300,
  // Max attachment size: 6 MB
  MAX_ATTACHMENT_FILESIZE_BYTES: 6 * 1000 * 1000,
};

export const UI = {
  // Pixels (scroll) from the top of the top of message container
  // at which more messages should be loaded
  MESSAGE_CONTAINER_BUFFER_OFFSET_PX: 1,

  COLORS: {
    // COMMON
    WHITE: '#FFFFFF',
    WHITE_PALE: '#AFAFAF',
    GREEN: '#00F782',

    // SEMANTIC COLORS
    DANGER: '#FF453A',
    DANGER_ALT: '#FF4538',
  },

  SPACING: {
    marginXs: '5px',
    marginSm: '10px',
    marginMd: '15px',
    marginLg: '20px',
  },
};
