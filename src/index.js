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

// ── Router helpers ─────────────────────────────────────────────────────────────

/**
 * Apply a valueMap to a decoded KNX value before publishing to a custom MQTT topic.
 * Returns the original value unchanged when no mapping is defined or matched.
 * @param {string} value   Decoded KNX value string.
 * @param {Object|undefined} valueMap  e.g. { "ON": "PLAY", "OFF": "STOP" }
 * @returns {string}
 */
function applyValueMap(value, valueMap) {
  if (!valueMap) return value;
  const mapped = valueMap[String(value)];
  return mapped !== undefined ? String(mapped) : String(value);
}

/**
 * Reverse-apply a valueMap: convert an MQTT payload back to a KNX value string
 * so it can be forwarded to the KNX bus.
 * @param {string} value    MQTT payload string.
 * @param {Object|undefined} valueMap
 * @returns {string}
 */
function applyReverseValueMap(value, valueMap) {
  if (!valueMap) return value;
  const entry = Object.entries(valueMap).find(([, v]) => String(v) === String(value));
  return entry ? entry[0] : String(value);
}

/**
 * Subscribe the MQTT handler to all custom route topics currently in the config.
 * Safe to call multiple times (broker deduplicates subscriptions).
 */
function subscribeRouteTopics() {
  const seen = new Set();
  for (const ga of config.groupAddresses) {
    if (!Array.isArray(ga.routes)) continue;
    for (const route of ga.routes) {
      if (route.mqttTopic && !seen.has(route.mqttTopic)) {
        seen.add(route.mqttTopic);
        mqttHandler.subscribe(route.mqttTopic);
      }
    }
  }
}

// ── KNX → MQTT ─────────────────────────────────────────────────────────────────
knxHandler.on('groupValueWrite', ({ address, src, value, name }) => {
  const topic = `${config.topicPrefix}/${address}`;
  const ga = config.groupAddresses.find((g) => g.address === address);
  const configured = Boolean(ga);

  // Only forward to MQTT when the address is in the configuration
  if (configured) {
    const direction = ga.direction || 'both';
    // Forward to MQTT only when direction allows KNX→MQTT
    if (direction === 'both' || direction === 'knx2mqtt') {
      mqttHandler.publish(topic, value);

      // Custom routes: publish to each configured route topic (with optional value mapping)
      if (Array.isArray(ga.routes)) {
        for (const route of ga.routes) {
          if (!route.mqttTopic) continue;
          const routeValue = applyValueMap(String(value), route.valueMap);
          mqttHandler.publish(route.mqttTopic, routeValue);
          console.log(`[BRIDGE] Route KNX→MQTT ${address} → ${route.mqttTopic} = ${routeValue}`);
        }
      }
    } else {
      console.log(`[BRIDGE] KNX→MQTT blocked for ${address} (direction=${direction})`);
    }
  }

  eventEmitter.emit('traffic', {
    direction: 'KNX→MQTT',
    address,
    name: name || address,
    topic,
    value: String(value),
    dpt: ga ? ga.dpt : undefined,
    src,
    configured,
    timestamp: new Date().toISOString(),
  });
});

// ── MQTT → KNX ─────────────────────────────────────────────────────────────────
mqttHandler.on('message', ({ topic, value }) => {
  const prefix = config.topicPrefix + '/';

  // ── Default path: topic matches knx/<address> ──────────────────────────────
  if (topic.startsWith(prefix)) {
    // Extract group address from topic  e.g. "knx/9/0/1" → "9/0/1"
    const address = topic.slice(prefix.length);

    // Only forward if the group address is listed in the config (security guard)
    const ga = config.groupAddresses.find((g) => g.address === address);
    if (!ga) {
      console.warn(`[BRIDGE] Unknown group address ${address} – message ignored`);
      return;
    }

    const gaDirection = ga.direction || 'both';
    if (gaDirection === 'both' || gaDirection === 'mqtt2knx') {
      knxHandler.write(address, value);

      eventEmitter.emit('traffic', {
        direction: 'MQTT→KNX',
        address,
        name: ga.name || address,
        topic,
        value,
        dpt: ga.dpt,
        configured: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(`[BRIDGE] MQTT→KNX blocked for ${address} (direction=${gaDirection})`);
    }
    return;
  }

  // ── Router path: topic matches a custom route mqttTopic ───────────────────
  for (const ga of config.groupAddresses) {
    if (!Array.isArray(ga.routes)) continue;
    for (const route of ga.routes) {
      if (route.mqttTopic !== topic) continue;

      const gaDirection = ga.direction || 'both';
      if (gaDirection === 'both' || gaDirection === 'mqtt2knx') {
        // Reverse-map MQTT payload → KNX value string
        const knxValue = applyReverseValueMap(value, route.valueMap);
        console.log(`[BRIDGE] Route MQTT→KNX ${topic} → ${ga.address} = ${knxValue}`);
        knxHandler.write(ga.address, knxValue);

        eventEmitter.emit('traffic', {
          direction: 'MQTT→KNX',
          address: ga.address,
          name: ga.name || ga.address,
          topic,
          value,
          dpt: ga.dpt,
          configured: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(`[BRIDGE] Route MQTT→KNX blocked for ${ga.address} (direction=${gaDirection})`);
      }
      return;
    }
  }
});

// ── Status events ──────────────────────────────────────────────────────────────
knxHandler.on('connected', () =>
  eventEmitter.emit('status', { service: 'KNX', connected: true })
);
knxHandler.on('disconnected', () =>
  eventEmitter.emit('status', { service: 'KNX', connected: false })
);
mqttHandler.on('connected', () => {
  eventEmitter.emit('status', { service: 'MQTT', connected: true });
  // Subscribe to custom route topics once the MQTT connection is established
  subscribeRouteTopics();
});
mqttHandler.on('disconnected', () =>
  eventEmitter.emit('status', { service: 'MQTT', connected: false })
);

// When a group address is saved via the web UI, re-subscribe to any new route topics
eventEmitter.on('ga-saved', () => {
  if (mqttHandler.connected) subscribeRouteTopics();
});
