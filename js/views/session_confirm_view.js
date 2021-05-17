/* global Whisper */

// eslint-disable-next-line func-names
(function() {
  'use strict';

  window.Whisper = window.Whisper || {};

  Whisper.SessionConfirmView = Whisper.View.extend({
    initialize(options) {
      this.props = {
        title: options.title,
        message: options.message,
        messageSub: options.messageSub,
        onClickOk: this.ok.bind(this),
        onClickClose: this.cancel.bind(this),
        resolve: options.resolve,
        reject: options.reject,
        okText: options.okText,
        cancelText: options.cancelText,
        okTheme: options.okTheme,
        closeTheme: options.closeTheme,
        hideCancel: options.hideCancel,
        sessionIcon: options.sessionIcon,
        iconSize: options.iconSize,
      };
    },

    registerEvents() {
      this.unregisterEvents();
      document.addEventListener('keyup', this.props.onClickClose, false);
    },

    unregisterEvents() {
      document.removeEventListener('keyup', this.props.onClickClose, false);
      if (this.confirmView && this.confirmView.el) {
        window.ReactDOM.unmountComponentAtNode(this.confirmView.el);
      }

      this.$('.session-confirm-wrapper').remove();
    },

    render() {
      this.$('.session-confirm-wrapper').remove();
      this.registerEvents();

      this.confirmView = new Whisper.ReactWrapperView({
        className: 'loki-dialog modal session-confirm-wrapper',
        Component: window.Signal.Components.SessionConfirm,
        props: this.props,
      });

      this.$el.prepend(this.confirmView.el);
    },

    ok() {
      this.unregisterEvents();

      this.$('.session-confirm-wrapper').remove();
      if (this.props.resolve) {
        this.props.resolve();
      }
    },
    cancel() {
      this.unregisterEvents();

      this.$('.session-confirm-wrapper').remove();

      if (this.props.reject) {
        this.props.reject();
      }
    },
    onKeyup(event) {
      if (event.key === 'Escape' || event.key === 'Esc') {
        this.unregisterEvents();
        this.props.onClickClose();
      }
    },
  });
})();
