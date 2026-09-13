'use strict';

const { getRuntimeContext } = require('../../nodeRedRuntimeContext');

module.exports = function(RED) {
  function PiniMqttStateNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const runtime = getRuntimeContext();
    const configuredTopic = String(config.topic || '').trim();

    node.on('input', (msg, send, done) => {
      const topic = configuredTopic || msg.topic;
      if (!topic) {
        done(new Error('An MQTT topic is required.'));
        return;
      }

      const currentState = runtime.mqttStateStore.get(topic) || null;
      msg.mqttState = currentState ? { ...currentState } : null;
      node.status({
        fill: currentState ? 'green' : 'yellow',
        shape: currentState ? 'dot' : 'ring',
        text: currentState ? topic : 'no state',
      });
      send(msg);
      done();
    });
  }

  RED.nodes.registerType('pini-mqtt-state', PiniMqttStateNode);
};
