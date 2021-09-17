/* global window */

// eslint-disable-next-line func-names
(function() {
  window.textsecure = window.textsecure || {};

  function inherit(Parent, Child) {
    // eslint-disable-next-line no-param-reassign
    Child.prototype = Object.create(Parent.prototype, {
      constructor: {
        value: Child,
        writable: true,
        configurable: true,
      },
    });
  }
  function appendStack(newError, originalError) {
    // eslint-disable-next-line no-param-reassign
    newError.stack += `\nOriginal stack:\n${originalError.stack}`;
  }

  function ReplayableError(options = {}) {
    this.name = options.name || 'ReplayableError';
    this.message = options.message;

    Error.call(this, options.message);

    // Maintains proper stack trace, where our error was thrown (only available on V8)
    //   via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }

    this.functionCode = options.functionCode;
  }
  inherit(Error, ReplayableError);

  function SendMessageNetworkError(number, jsonData, httpError) {
    this.number = number;
    this.code = httpError.code;

    ReplayableError.call(this, {
      name: 'SendMessageNetworkError',
      message: httpError.message,
    });

    appendStack(this, httpError);
  }
  inherit(ReplayableError, SendMessageNetworkError);

  function EmptySwarmError(number, message) {
    // eslint-disable-next-line prefer-destructuring
    this.number = number.split('.')[0];

    ReplayableError.call(this, {
      name: 'EmptySwarmError',
      message,
    });
  }
  inherit(ReplayableError, EmptySwarmError);

  function NotFoundError(message, error) {
    this.name = 'NotFoundError';
    this.message = message;
    this.error = error;

    Error.call(this, message);

    // Maintains proper stack trace, where our error was thrown (only available on V8)
    //   via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }

    appendStack(this, error);
  }

  function HTTPError(message, response) {
    this.name = 'HTTPError';
    this.message = `${response.status} Error: ${message}`;
    this.response = response;

    Error.call(this, message);

    // Maintains proper stack trace, where our error was thrown (only available on V8)
    //   via https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }

  function TimestampError(message) {
    this.name = 'TimeStampError';

    ReplayableError.call(this, {
      name: 'TimestampError',
      message,
    });
  }
  inherit(ReplayableError, TimestampError);

  window.textsecure.SendMessageNetworkError = SendMessageNetworkError;
  window.textsecure.ReplayableError = ReplayableError;
  window.textsecure.EmptySwarmError = EmptySwarmError;
  window.textsecure.HTTPError = HTTPError;
  window.textsecure.NotFoundError = NotFoundError;
  window.textsecure.TimestampError = TimestampError;
})();
