import { combineReducers } from 'redux';

import { reducer as search, SearchStateType } from './ducks/search';
import { ConversationsStateType, reducer as conversations } from './ducks/conversations';
import { reducer as user, UserStateType } from './ducks/user';
import { reducer as theme, ThemeStateType } from './ducks/theme';
import { reducer as section, SectionStateType } from './ducks/section';
import { defaultRoomReducer as defaultRooms, DefaultRoomsState } from './ducks/defaultRooms';
import { defaultOnionReducer as onionPaths, OnionState } from './ducks/onion';
import { confirmModalReducer as confirmModal, ConfirmModalState } from "./ducks/modalDialog";
import {
  defaultMentionsInputReducer as mentionsInput,
  MentionsInputState,
} from './ducks/mentionsInput';

export type StateType = {
  search: SearchStateType;
  // messages: MessagesStateType;
  user: UserStateType;
  conversations: ConversationsStateType;
  theme: ThemeStateType;
  section: SectionStateType;
  defaultRooms: DefaultRoomsState;

  onionPaths: OnionState;

  confirmModal: ConfirmModalState
  // modalState: ConfirmModalState
  mentionsInput: MentionsInputState;
};

export const reducers = {
  search,
  // Temporary until ./ducks/messages is working
  // messages,
  // messages: search,
  conversations,
  user,
  theme,
  section,
  defaultRooms,
  onionPaths,
  confirmModal,
  mentionsInput,
};

// Making this work would require that our reducer signature supported AnyAction, not
//   our restricted actions
// @ts-ignore
export const reducer = combineReducers(reducers);
