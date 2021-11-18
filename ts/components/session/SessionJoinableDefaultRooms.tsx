import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  joinOpenGroupV2WithUIEvents,
  parseOpenGroupV2,
} from '../../opengroup/opengroupV2/JoinOpenGroupV2';
import { downloadPreviewOpenGroupV2 } from '../../opengroup/opengroupV2/OpenGroupAPIV2';
import { updateDefaultBase64RoomData } from '../../state/ducks/defaultRooms';
import { StateType } from '../../state/reducer';
import { Avatar, AvatarSize } from '../Avatar';
import { Flex } from '../basic/Flex';
import { PillContainerHoverable, PillTooltipWrapper } from '../basic/PillContainer';
import { H3 } from '../basic/Text';
import { SessionSpinner } from './SessionSpinner';
import styled from 'styled-components';
// tslint:disable: no-void-expression

export type JoinableRoomProps = {
  completeUrl: string;
  name: string;
  roomId: string;
  imageId?: string;
  onClick: (completeUrl: string) => void;
  base64Data?: string;
};

const SessionJoinableRoomAvatar = (props: JoinableRoomProps) => {
  const dispatch = useDispatch();
  useEffect(() => {
    let isCancelled = false;

    try {
      const parsedInfos = parseOpenGroupV2(props.completeUrl);
      if (parsedInfos) {
        if (props.base64Data) {
          return;
        }
        if (isCancelled) {
          return;
        }
        void downloadPreviewOpenGroupV2(parsedInfos)
          .then(base64 => {
            if (isCancelled) {
              return;
            }
            const payload = {
              roomId: props.roomId,
              base64Data: base64 || '',
            };
            dispatch(updateDefaultBase64RoomData(payload));
          })
          .catch(e => {
            if (isCancelled) {
              return;
            }
            window?.log?.warn('downloadPreviewOpenGroupV2 failed', e);
            const payload = {
              roomId: props.roomId,
              base64Data: '',
            };
            dispatch(updateDefaultBase64RoomData(payload));
          });
      }
    } catch (e) {
      window?.log?.warn(e);
    }
    return () => {
      isCancelled = true;
    };
  }, [props.imageId, props.completeUrl]);

  return (
    <Avatar
      size={AvatarSize.XS}
      base64Data={props.base64Data}
      {...props}
      onAvatarClick={() => props.onClick(props.completeUrl)}
    />
  );
};

const StyledRoomName = styled(Flex)`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0 10px;
`;

const StyledToolTip = styled.div`
  padding: var(--margins-sm);
  background: var(--color-clickable-hovered);
  font-size: var(--font-size-xs);
  border: 1px solid var(--color-pill-divider);
  display: inline-block;
  position: absolute;
  white-space: normal;

  top: 100%;
  left: 10%;

  border-radius: 300px;
  z-index: 5;
  opacity: 1;
  animation: fadeIn 0.5s ease-out;

  max-width: 80%;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
  }
`;

const SessionJoinableRoomName = (props: JoinableRoomProps) => {
  return <StyledRoomName>{props.name}</StyledRoomName>;
};

const SessionJoinableRoomRow = (props: JoinableRoomProps) => {
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseEnter = () => {
    setIsHovering(true);
  };
  const handleMouseLeave = () => {
    setIsHovering(false);
  };

  const showTooltip = isHovering;

  return (
    <PillTooltipWrapper>
      <PillContainerHoverable
        onClick={() => {
          props.onClick(props.completeUrl);
        }}
        margin="5px"
        padding="5px"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <SessionJoinableRoomAvatar {...props} />
        <SessionJoinableRoomName {...props} />
      </PillContainerHoverable>

      {showTooltip && false && <StyledToolTip>{props.name}</StyledToolTip>}
    </PillTooltipWrapper>
  );
};

export const SessionJoinableRooms = (props: { onRoomClicked: () => void }) => {
  const joinableRooms = useSelector((state: StateType) => state.defaultRooms);

  const onRoomClicked = useCallback(
    (loading: boolean) => {
      if (loading) {
        props.onRoomClicked();
      }
    },
    [props.onRoomClicked]
  );

  if (!joinableRooms.inProgress && !joinableRooms.rooms?.length) {
    window?.log?.info('no default joinable rooms yet and not in progress');
    return null;
  }

  const componentToRender = joinableRooms.inProgress ? (
    <SessionSpinner loading={true} />
  ) : (
    joinableRooms.rooms.map(r => {
      return (
        <SessionJoinableRoomRow
          key={r.id}
          completeUrl={r.completeUrl}
          name={r.name}
          roomId={r.id}
          base64Data={r.base64Data}
          onClick={completeUrl => {
            void joinOpenGroupV2WithUIEvents(completeUrl, true, false, onRoomClicked);
          }}
        />
      );
    })
  );

  return (
    <Flex container={true} flexGrow={1} flexDirection="column" width="93%">
      <H3 text={window.i18n('orJoinOneOfThese')} />
      <Flex container={true} flexGrow={1} flexWrap="wrap" justifyContent="center">
        {componentToRender}
      </Flex>
    </Flex>
  );
};
