import React, { ReactElement, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { MessageRenderingProps } from '../../../../models/messageType';
import { StateType } from '../../../../state/reducer';
import { getMessageReactsProps } from '../../../../state/selectors/conversations';
import { isEmpty, isEqual } from 'lodash';
import { ReactionList } from '../../../../types/Message';
import { StyledPopupContainer } from '../reactions/ReactionPopup';
import { Flex } from '../../../basic/Flex';
import { nativeEmojiData } from '../../../../util/emoji';
import { Reaction, ReactionProps } from '../reactions/Reaction';
import { SessionIcon } from '../../../icon';

export const popupXDefault = -101;
export const popupYDefault = -90;

const StyledMessageReactionsContainer = styled(Flex)<{ x: number; y: number }>`
  ${StyledPopupContainer} {
    position: absolute;
    top: ${props => `${props.y}px;`};
    left: ${props => `${props.x}px;`};
  }
`;

export const StyledMessageReactions = styled(Flex)<{ inModal: boolean }>`
  ${props => (props.inModal ? '' : 'max-width: 320px;')}
`;

const StyledReactionOverflow = styled.button`
  display: flex;
  flex-direction: row-reverse;
  justify-content: flex-start;
  align-items: center;

  border: none;
  margin-right: 4px;
  margin-bottom: var(--margins-sm);

  span {
    background-color: var(--color-received-message-background);
    border: 1px solid var(--color-inbox-background);
    border-radius: 50%;
    overflow: hidden;
    margin-right: -9px;
    padding: 1px 4.5px;
  }
`;

const StyledReadLess = styled.span`
  font-size: var(--font-size-xs);
  margin-top: 8px;
  svg {
    margin-right: 5px;
  }
`;

type ReactionsProps = Omit<ReactionProps, 'emoji'>;

const Reactions = (props: ReactionsProps): ReactElement => {
  const { messageId, reactions, inModal } = props;
  return (
    <StyledMessageReactions
      container={true}
      flexWrap={inModal ? 'nowrap' : 'wrap'}
      alignItems={'center'}
      inModal={inModal}
    >
      {Object.keys(reactions).map(emoji => (
        <Reaction key={`${messageId}-${emoji}`} emoji={emoji} {...props} />
      ))}
    </StyledMessageReactions>
  );
};

interface ExpandReactionsProps extends ReactionsProps {
  handleExpand: () => void;
}

const CompressedReactions = (props: ExpandReactionsProps): ReactElement => {
  const { messageId, reactions, inModal, handleExpand } = props;
  return (
    <StyledMessageReactions
      container={true}
      flexWrap={inModal ? 'nowrap' : 'wrap'}
      alignItems={'center'}
      inModal={inModal}
    >
      {Object.keys(reactions)
        .slice(0, 4)
        .map(emoji => (
          <Reaction key={`${messageId}-${emoji}`} emoji={emoji} {...props} />
        ))}
      <StyledReactionOverflow onClick={handleExpand}>
        {Object.keys(reactions)
          .slice(4, 7)
          .reverse()
          .map(emoji => {
            return (
              <span
                key={`${messageId}-${emoji}`}
                role={'img'}
                aria-label={
                  nativeEmojiData?.ariaLabels ? nativeEmojiData.ariaLabels[emoji] : undefined
                }
              >
                {emoji}
              </span>
            );
          })}
      </StyledReactionOverflow>
    </StyledMessageReactions>
  );
};

const ExpandedReactions = (props: ExpandReactionsProps): ReactElement => {
  const { handleExpand } = props;
  return (
    <>
      <Reactions {...props} />
      <StyledReadLess onClick={handleExpand}>
        <SessionIcon iconType="chevron" iconSize="medium" iconRotation={180} />
        {window.i18n('expandedReactionsText')}
      </StyledReadLess>
    </>
  );
};

export type MessageReactsSelectorProps = Pick<
  MessageRenderingProps,
  'conversationType' | 'isPublic' | 'reacts' | 'weAreAdmin'
>;

type Props = {
  messageId: string;
  hasReactLimit?: boolean;
  onClick: (emoji: string) => void;
  popupReaction?: string;
  setPopupReaction?: (emoji: string) => void;
  onPopupClick?: () => void;
  inModal?: boolean;
  onSelected?: (emoji: string) => boolean;
};

export const MessageReactions = (props: Props): ReactElement => {
  const {
    messageId,
    hasReactLimit = true,
    onClick,
    popupReaction,
    setPopupReaction,
    onPopupClick,
    inModal = false,
    onSelected,
  } = props;
  const [reactions, setReactions] = useState<ReactionList>({});

  const [isExpanded, setIsExpanded] = useState(false);
  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const [popupX, setPopupX] = useState(popupXDefault);
  const [popupY, setPopupY] = useState(popupYDefault);

  const msgProps = useSelector((state: StateType) => getMessageReactsProps(state, messageId));

  if (!msgProps) {
    return <></>;
  }

  const { conversationType, reacts } = msgProps;
  const inGroup = conversationType === 'group';

  const reactLimit = 6;

  const reactionsProps = {
    messageId,
    reactions,
    inModal,
    inGroup,
    handlePopupX: setPopupX,
    handlePopupY: setPopupY,
    onClick,
    popupReaction,
    onSelected,
    handlePopupReaction: setPopupReaction,
    handlePopupClick: onPopupClick,
  };

  useEffect(() => {
    if (reacts && !isEqual(reactions, reacts)) {
      setReactions(reacts);
    }

    if (!isEmpty(reactions) && isEmpty(reacts)) {
      setReactions({});
    }
  }, [reacts, reactions]);

  return (
    <StyledMessageReactionsContainer
      container={true}
      flexDirection={'column'}
      justifyContent={'center'}
      alignItems={inModal ? 'flex-start' : 'center'}
      x={popupX}
      y={popupY}
    >
      {reactions !== {} &&
        (!hasReactLimit || Object.keys(reactions).length <= reactLimit ? (
          <Reactions {...reactionsProps} />
        ) : isExpanded ? (
          <ExpandedReactions handleExpand={handleExpand} {...reactionsProps} />
        ) : (
          <CompressedReactions handleExpand={handleExpand} {...reactionsProps} />
        ))}
    </StyledMessageReactionsContainer>
  );
};
