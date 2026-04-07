'use strict';

const EventEmitter = require('events');
const mqtt = require('mqtt');

class MqttHandler extends EventEmitter {
  /**
   * @param {{ host: string, port: number, username?: string, password?: string }} config
   * @param {string} topicPrefix  e.g. "knx"
   */
  constructor(config, topicPrefix) {
    super();
    this.config = config;
    this.topicPrefix = topicPrefix;
    this.client = null;
    this.connected = false;
    this._connect();
  }

  _connect() {
    const url = `mqtt://${this.config.host}:${this.config.port}`;
    const options = {
      reconnectPeriod: 5000,
    };
    if (this.config.username) options.username = this.config.username;
    if (this.config.password) options.password = this.config.password;

    console.log(`[MQTT] Connecting to ${url} …`);
    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      this.connected = true;
      console.log('[MQTT] Connected');
      const sub = `${this.topicPrefix}/#`;
      this.client.subscribe(sub, (err) => {
        if (err) console.error('[MQTT] Subscribe error:', err.message);
        else console.log(`[MQTT] Subscribed to ${sub}`);
      });
      this.emit('connected');
    });

    this.client.on('message', (topic, message) => {
      const value = message.toString();
      console.log(`[MQTT] Message ${topic} = ${value}`);
      this.emit('message', { topic, value });
    });

    this.client.on('error', (err) => {
      this.connected = false;
      console.error('[MQTT] Error:', err.message);
      this.emit('error', err);
    });

    this.client.on('close', () => {
      this.connected = false;
      this.emit('disconnected');
    });
  }

  /**
   * Publish a value to an MQTT topic.
   * @param {string} topic
   * @param {string|number} value
   */
  publish(topic, value) {
    if (!this.client || !this.connected) {
      console.error('[MQTT] Cannot publish – not connected');
      return;
    }
    const payload = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.client.publish(topic, payload, { retain: false });
    console.log(`[MQTT] Publish ${topic} = ${payload}`);
  }
}

module.exports = MqttHandler;
