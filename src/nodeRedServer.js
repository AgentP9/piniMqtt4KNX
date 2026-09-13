'use strict';

const fs = require('fs');
const path = require('path');
const RED = require('node-red');

const { clearRuntimeContext, setRuntimeContext } = require('./nodeRedRuntimeContext');

const NODE_RED_NODES_DIR = path.join(__dirname, 'nodered', 'nodes');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createNodeRedSettings(nodeRedConfig) {
  return {
    httpAdminRoot: nodeRedConfig.adminRoot,
    httpNodeRoot: nodeRedConfig.httpNodeRoot,
    userDir: nodeRedConfig.userDir,
    flowFile: nodeRedConfig.flowFile,
    flowFilePretty: true,
    nodesDir: [NODE_RED_NODES_DIR],
    exportGlobalContextKeys: false,
    externalModules: {
      palette: { allowInstall: false },
      modules: { allowInstall: false },
    },
    editorTheme: {
      projects: { enabled: false },
    },
    logging: {
      console: {
        level: 'info',
        metrics: false,
        audit: false,
      },
    },
  };
}

class NodeRedServer {
  constructor(app, server, { eventEmitter, mqttHandler, knxHandler, config }) {
    this.app = app;
    this.server = server;
    this.eventEmitter = eventEmitter;
    this.mqttHandler = mqttHandler;
    this.knxHandler = knxHandler;
    this.config = config;
    this.nodeRedConfig = config.nodeRed;
    this.mqttStateStore = new Map();
    this._initialized = false;
    this._started = false;

    this._trackInboundMqtt = ({ topic, value }) => this._rememberMqttState(topic, value, 'broker');
    this._trackOutboundMqtt = ({ topic, value }) => this._rememberMqttState(topic, value, 'bridge');
  }

  _rememberMqttState(topic, value, source) {
    if (!topic) return;
    this.mqttStateStore.set(topic, {
      topic,
      payload: value,
      source,
      updatedAt: new Date().toISOString(),
    });
  }

  init() {
    if (this._initialized) return;

    ensureDir(this.nodeRedConfig.userDir);

    setRuntimeContext({
      eventEmitter: this.eventEmitter,
      mqttHandler: this.mqttHandler,
      knxHandler: this.knxHandler,
      config: this.config,
      mqttStateStore: this.mqttStateStore,
    });

    const settings = createNodeRedSettings(this.nodeRedConfig);
    RED.init(this.server, settings);
    this.app.use(settings.httpAdminRoot, RED.httpAdmin);
    this.app.use(settings.httpNodeRoot, RED.httpNode);

    this.mqttHandler.on('message', this._trackInboundMqtt);
    this.mqttHandler.on('published', this._trackOutboundMqtt);

    this._initialized = true;
  }

  async start() {
    if (!this._initialized) this.init();
    if (this._started) return;
    await RED.start();
    this._started = true;
    console.log(`[NODE-RED] Editor available at ${this.nodeRedConfig.adminRoot}`);
  }

  async stop() {
    if (this._started) {
      await RED.stop();
      this._started = false;
    }
    if (this._initialized) {
      this.mqttHandler.off('message', this._trackInboundMqtt);
      this.mqttHandler.off('published', this._trackOutboundMqtt);
      clearRuntimeContext();
      this._initialized = false;
    }
  }
}

module.exports = {
  NodeRedServer,
  createNodeRedSettings,
  NODE_RED_NODES_DIR,
};
