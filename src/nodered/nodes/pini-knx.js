'use strict';

const { getRuntimeContext } = require('../../nodeRedRuntimeContext');

module.exports = function(RED) {
  function PiniKnxInNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const runtime = getRuntimeContext();
    const filterAddress = String(config.address || '').trim();

    const onGroupValueWrite = ({ address, src, value }) => {
      if (filterAddress && address !== filterAddress) return;
      const ga = runtime.config.groupAddresses.find((entry) => entry.address === address);
      node.status({ fill: 'green', shape: 'dot', text: address });
      node.send({
        payload: value,
        topic: `${runtime.config.topicPrefix}/${address}`,
        address,
        knx: {
          address,
          src,
          dpt: ga && ga.dpt,
          name: ga && ga.name,
        },
      });
    };

    runtime.knxHandler.on('groupValueWrite', onGroupValueWrite);
    node.on('close', () => runtime.knxHandler.off('groupValueWrite', onGroupValueWrite));
  }

  function PiniKnxOutNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const runtime = getRuntimeContext();
    const configuredAddress = String(config.address || '').trim();

    node.on('input', (msg, send, done) => {
      const address = configuredAddress || msg.address || (msg.knx && msg.knx.address);
      if (!address) {
        done(new Error('A KNX group address is required.'));
        return;
      }
      runtime.knxHandler.write(address, msg.payload);
      node.status({ fill: 'green', shape: 'dot', text: address });
      send(msg);
      done();
    });
  }

  RED.nodes.registerType('pini-knx in', PiniKnxInNode);
  RED.nodes.registerType('pini-knx out', PiniKnxOutNode);
};
