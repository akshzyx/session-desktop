import React from 'react';
import { PropsForDataExtractionNotification } from '../../../../models/messageType';
import { SignalService } from '../../../../protobuf';
import { Flex } from '../../../basic/Flex';
import { SpacerSM, Text } from '../../../basic/Text';
import { SessionIcon } from '../../../icon';
import { ExpirableReadableMessage } from './ExpirableReadableMessage';

export const DataExtractionNotification = (props: PropsForDataExtractionNotification) => {
  const { name, type, source, messageId } = props;

  let contentText: string;
  if (type === SignalService.DataExtractionNotification.Type.MEDIA_SAVED) {
    contentText = window.i18n('savedTheFile', [name || source]);
  } else {
    contentText = window.i18n('tookAScreenshot', [name || source]);
  }

  return (
    <ExpirableReadableMessage
      messageId={messageId}
      dataTestId="data-extraction-notification"
      key={`readable-message-${messageId}`}
      isControlMessage={true}
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
        id={`msg-${messageId}`}
        style={{ textAlign: 'center' }}
      >
        <SessionIcon iconType="save" iconColor="inherit" iconSize="large" />
        <SpacerSM />
        <Text text={contentText} ellipsisOverflow={true} />
      </Flex>
    </ExpirableReadableMessage>
  );
};
