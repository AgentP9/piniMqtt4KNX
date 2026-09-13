'use strict';

module.exports = function(RED) {
  function toMilliseconds(amount, unit) {
    const value = Math.max(0, Number(amount) || 0);
    switch (unit) {
      case 'minutes': return value * 60000;
      case 'hours': return value * 3600000;
      default: return value * 1000;
    }
  }

  function PiniTimerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const mode = config.mode === 'interval' ? 'interval' : 'delay';
    const amount = Number(config.amount) || 1;
    const unit = config.unit || 'seconds';
    let timer = null;

    function clearTimer() {
      if (!timer) return;
      if (mode === 'interval') clearInterval(timer);
      else clearTimeout(timer);
      timer = null;
    }

    function setIdleStatus() {
      node.status({ fill: 'grey', shape: 'ring', text: mode });
    }

    function setActiveStatus(ms) {
      node.status({ fill: 'blue', shape: 'dot', text: `${mode} ${ms}ms` });
    }

    setIdleStatus();

    node.on('input', (msg, send, done) => {
      if (msg.reset) {
        clearTimer();
        setIdleStatus();
        done();
        return;
      }

      const ms = Math.max(1, Number(msg.delayMs) || toMilliseconds(amount, unit));
      clearTimer();
      setActiveStatus(ms);

      if (mode === 'interval') {
        const baseMsg = RED.util.cloneMessage(msg);
        timer = setInterval(() => send(RED.util.cloneMessage(baseMsg)), ms);
        done();
        return;
      }

      const delayedMsg = RED.util.cloneMessage(msg);
      timer = setTimeout(() => {
        timer = null;
        setIdleStatus();
        send(delayedMsg);
      }, ms);
      done();
    });

    node.on('close', () => clearTimer());
  }

  RED.nodes.registerType('pini-timer', PiniTimerNode);
};
