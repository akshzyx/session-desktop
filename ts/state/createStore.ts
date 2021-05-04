import promise from 'redux-promise-middleware';
import { createLogger } from 'redux-logger';
import { configureStore } from '@reduxjs/toolkit';
import { reducer as allReducers } from './reducer';

// @ts-ignore
const env = window.getEnvironment();

// So Redux logging doesn't go to disk, and so we can get colors/styles
const directConsole = {
  // @ts-ignore
  log: console._log,
  groupCollapsed: console.groupCollapsed,
  group: console.group,
  groupEnd: console.groupEnd,
  warn: console.warn,
  // tslint:disable-next-line no-console
  error: console.error,
};

const logger = createLogger({
  logger: directConsole,
});

// Exclude logger if we're in production mode
const disableLogging = env === 'production' || true; // ALWAYS TURNED OFF
const middlewareList = disableLogging ? [promise] : [promise, logger];

export const createStore = (initialState: any) =>
  configureStore({
    reducer: allReducers,
    preloadedState: initialState,
    middleware: (getDefaultMiddleware: any) => getDefaultMiddleware().concat(middlewareList),
  });
