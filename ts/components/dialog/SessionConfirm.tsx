import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import useKey from 'react-use/lib/useKey';
import { useLastMessage } from '../../hooks/useParamSelector';
import { updateConversationInteractionState } from '../../interactions/conversationInteractions';
import { ConversationInteractionStatus } from '../../interactions/types';
import { updateConfirmModal } from '../../state/ducks/modalDialog';
import { SessionWrapperModal } from '../SessionWrapperModal';
import { SessionButton, SessionButtonColor, SessionButtonType } from '../basic/SessionButton';
import { SessionRadioGroup, SessionRadioItems } from '../basic/SessionRadioGroup';
import { SpacerLG } from '../basic/Text';
import { SessionSpinner } from '../loading';
import { StyledSubMessageText, StyledSubText } from './StyledSubText';

export interface SessionConfirmDialogProps {
  message?: string;
  messageSub?: string;
  title?: string;
  radioOptions?: SessionRadioItems;
  onOk?: any;
  onClose?: any;
  closeAfterInput?: boolean;

  /**
   * function to run on ok click. Closes modal after execution by default
   * sometimes the callback might need arguments when using radioOptions
   */
  onClickOk?: (...args: Array<any>) => Promise<void> | void;

  onClickClose?: () => any;

  /**
   * function to run on close click. Closes modal after execution by default
   */
  onClickCancel?: () => any;

  okText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  okTheme?: SessionButtonColor;
  closeTheme?: SessionButtonColor;
  showExitIcon?: boolean | undefined;
  headerReverse?: boolean;
  conversationId?: string;
}

export const SessionConfirm = (props: SessionConfirmDialogProps) => {
  const dispatch = useDispatch();
  const {
    title = '',
    message = '',
    messageSub = '',
    radioOptions,
    okTheme,
    closeTheme = SessionButtonColor.Danger,
    onClickOk,
    onClickClose,
    hideCancel = false,
    onClickCancel,
    showExitIcon,
    headerReverse,
    closeAfterInput = true,
    conversationId,
  } = props;

  const lastMessage = useLastMessage(conversationId);

  const [isLoading, setIsLoading] = useState(false);
  const [chosenOption, setChosenOption] = useState(
    radioOptions?.length ? radioOptions[0].value : ''
  );

  const okText = props.okText || window.i18n('okay');
  const cancelText = props.cancelText || window.i18n('cancel');
  const showHeader = !!props.title;

  const onClickOkHandler = async () => {
    if (onClickOk) {
      setIsLoading(true);
      try {
        await onClickOk(chosenOption !== '' ? chosenOption : undefined);
      } catch (e) {
        window.log.warn(e);
      } finally {
        setIsLoading(false);
      }
    }

    if (closeAfterInput) {
      dispatch(updateConfirmModal(null));
    }
  };

  useKey('Enter', () => {
    void onClickOkHandler();
  });

  useKey('Escape', () => {
    onClickCancelHandler();
  });

  useEffect(() => {
    if (isLoading) {
      if (conversationId && lastMessage?.interactionType) {
        void updateConversationInteractionState({
          conversationId,
          type: lastMessage?.interactionType,
          status: ConversationInteractionStatus.Loading,
        });
      }
    }
  }, [isLoading, conversationId, lastMessage?.interactionType]);

  /**
   * Performs specified on close action then removes the modal.
   */
  const onClickCancelHandler = () => {
    onClickCancel?.();
    onClickClose?.();
    window.inboxStore?.dispatch(updateConfirmModal(null));
  };

  return (
    <SessionWrapperModal
      title={title}
      onClose={onClickClose}
      showExitIcon={showExitIcon}
      showHeader={showHeader}
      headerReverse={headerReverse}
    >
      {!showHeader && <SpacerLG />}

      <div className="session-modal__centered">
        <StyledSubText tag="span" textLength={message.length} html={message} />
        {messageSub && (
          <StyledSubMessageText
            tag="span"
            className="session-confirm-sub-message"
            html={messageSub}
          />
        )}

        {radioOptions && chosenOption !== '' ? (
          <SessionRadioGroup
            group="session-confirm-radio-group"
            initialItem={chosenOption}
            items={radioOptions}
            radioPosition="right"
            onClick={value => {
              if (value) {
                setChosenOption(value);
              }
            }}
          />
        ) : null}

        <SessionSpinner loading={isLoading} />
      </div>

      <div className="session-modal__button-group">
        <SessionButton
          text={okText}
          buttonColor={okTheme}
          buttonType={SessionButtonType.Simple}
          onClick={onClickOkHandler}
          dataTestId="session-confirm-ok-button"
        />
        {!hideCancel && (
          <SessionButton
            text={cancelText}
            buttonColor={!okTheme ? closeTheme : undefined}
            buttonType={SessionButtonType.Simple}
            onClick={onClickCancelHandler}
            dataTestId="session-confirm-cancel-button"
          />
        )}
      </div>
    </SessionWrapperModal>
  );
};
