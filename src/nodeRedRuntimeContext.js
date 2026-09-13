'use strict';

let runtimeContext = null;

function setRuntimeContext(context) {
  runtimeContext = context;
}

function getRuntimeContext() {
  if (!runtimeContext) {
    throw new Error('Node-RED runtime context is not initialized');
  }
  return runtimeContext;
}

function clearRuntimeContext() {
  runtimeContext = null;
}

module.exports = {
  setRuntimeContext,
  getRuntimeContext,
  clearRuntimeContext,
};
