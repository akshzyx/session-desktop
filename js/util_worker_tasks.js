/* global pow */
/* eslint-disable strict */

const functions = {
  calcPoW,
};

onmessage = async e => {
  const [jobId, fnName, ...args] = e.data;

  try {
    const fn = functions[fnName];
    if (!fn) {
      throw new Error(`Worker: job ${jobId} did not find function ${fnName}`);
    }
    const result = await fn(...args);
    postMessage([jobId, null, result]);
  } catch (error) {
    const errorForDisplay = prepareErrorForPostMessage(error);
    postMessage([jobId, errorForDisplay]);
  }
};

function prepareErrorForPostMessage(error) {
  if (!error) {
    return null;
  }

  if (error.stack) {
    return error.stack;
  }

  return error.message;
}

function calcPoW(
  timestamp,
  ttl,
  pubKey,
  data,
  difficulty = undefined,
  increment = 1,
  startNonce = 0
) {
  return pow.calcPoW(
    timestamp,
    ttl,
    pubKey,
    data,
    difficulty,
    increment,
    startNonce
  );
}
