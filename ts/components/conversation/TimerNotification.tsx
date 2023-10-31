import React from 'react';

import { PropsForExpirationTimer } from '../../state/ducks/conversations';
import { assertUnreachable } from '../../types/sqlSharedTypes';

import { isLegacyDisappearingModeEnabled } from '../../session/disappearing_messages/legacy';
import { Flex } from '../basic/Flex';
import { Text } from '../basic/Text';
import { ExpirableReadableMessage } from './message/message-item/ExpirableReadableMessage';

export const TimerNotification = (props: PropsForExpirationTimer) => {
  const { messageId, pubkey, profileName, expirationMode, timespan, type, disabled } = props;

  const contact = profileName || pubkey;
  // TODO legacy messages support will be removed in a future release
  const mode = isLegacyDisappearingModeEnabled(expirationMode)
    ? null
    : expirationMode === 'deleteAfterRead'
    ? window.i18n('timerModeRead')
    : window.i18n('timerModeSent');

  let textToRender: string | undefined;
  switch (type) {
    case 'fromOther':
      textToRender = disabled
        ? window.i18n('disabledDisappearingMessages', [contact, timespan])
        : mode
        ? window.i18n('theyChangedTheTimer', [contact, timespan, mode])
        : window.i18n('theyChangedTheTimerLegacy', [contact, timespan]);
      break;
    case 'fromMe':
    case 'fromSync':
      textToRender = disabled
        ? window.i18n('youDisabledDisappearingMessages')
        : mode
        ? window.i18n('youChangedTheTimer', [timespan, mode])
        : window.i18n('youChangedTheTimerLegacy', [timespan]);
      break;
    default:
      assertUnreachable(type, `TimerNotification: Missing case error "${type}"`);
  }

  if (!textToRender || textToRender.length === 0) {
    throw new Error('textToRender invalid key used TimerNotification');
  }

  return (
    <ExpirableReadableMessage
      messageId={messageId}
      isControlMessage={true}
      key={`readable-message-${messageId}`}
      dataTestId={'disappear-control-message'}
    >
      <Flex
        container={true}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="90%"
        maxWidth="700px"
        margin="5px auto 10px auto" // top margin is smaller that bottom one to make the stopwatch icon of expirable message closer to its content
        padding="5px 10px"
        style={{ textAlign: 'center' }}
      >
        <Text text={textToRender} subtle={true} />
      </Flex>
    </ExpirableReadableMessage>
  );
};
