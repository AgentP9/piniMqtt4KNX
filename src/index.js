'use strict';

const EventEmitter = require('events');
const config = require('./config');
const KnxHandler = require('./knxHandler');
const MqttHandler = require('./mqttHandler');
const WebServer = require('./webServer');

const eventEmitter = new EventEmitter();

// ── Web dashboard ──────────────────────────────────────────────────────────────
const webServer = new WebServer(config.webPort, eventEmitter, config.groupAddresses, config.groupAddressesPath); // eslint-disable-line no-unused-vars

// ── Connections ────────────────────────────────────────────────────────────────
const knxHandler = new KnxHandler(config.knx, config.groupAddresses);
const mqttHandler = new MqttHandler(config.mqtt, config.topicPrefix);

// ── KNX → MQTT ─────────────────────────────────────────────────────────────────
knxHandler.on('groupValueWrite', ({ address, src, value, name }) => {
  const topic = `${config.topicPrefix}/${address}`;
  const ga = config.groupAddresses.find((g) => g.address === address);
  const configured = Boolean(ga);

  // Only forward to MQTT when the address is in the configuration
  if (configured) {
    mqttHandler.publish(topic, value);
  }

  eventEmitter.emit('traffic', {
    direction: 'KNX→MQTT',
    address,
    name: name || address,
    topic,
    value: String(value),
    src,
    configured,
    timestamp: new Date().toISOString(),
  });
});

// ── MQTT → KNX ─────────────────────────────────────────────────────────────────
mqttHandler.on('message', ({ topic, value }) => {
  // Extract group address from topic  e.g. "knx/9/0/1" → "9/0/1"
  const prefix = config.topicPrefix + '/';
  if (!topic.startsWith(prefix)) return;
  const address = topic.slice(prefix.length);

  // Only forward if the group address is listed in the config (security guard)
  const ga = config.groupAddresses.find((g) => g.address === address);
  if (!ga) {
    console.warn(`[BRIDGE] Unknown group address ${address} – message ignored`);
    return;
  }

  knxHandler.write(address, value);

  eventEmitter.emit('traffic', {
    direction: 'MQTT→KNX',
    address,
    name: ga.name || address,
    topic,
    value,
    configured: true,
    timestamp: new Date().toISOString(),
  });
});

// ── Status events ──────────────────────────────────────────────────────────────
knxHandler.on('connected', () =>
  eventEmitter.emit('status', { service: 'KNX', connected: true })
);
knxHandler.on('disconnected', () =>
  eventEmitter.emit('status', { service: 'KNX', connected: false })
);
mqttHandler.on('connected', () =>
  eventEmitter.emit('status', { service: 'MQTT', connected: true })
);
mqttHandler.on('disconnected', () =>
  eventEmitter.emit('status', { service: 'MQTT', connected: false })
);
