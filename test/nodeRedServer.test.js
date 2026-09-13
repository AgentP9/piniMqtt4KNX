'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const { NodeRedServer, createNodeRedSettings, NODE_RED_NODES_DIR } = require('../src/nodeRedServer');

function httpGet(port, route) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: route,
      method: 'GET',
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('createNodeRedSettings points to local custom nodes', () => {
  const settings = createNodeRedSettings({
    adminRoot: '/red',
    httpNodeRoot: '/red/api',
    userDir: '/tmp/pini-nodered-test',
    flowFile: 'flows.json',
  });

  assert.equal(settings.httpAdminRoot, '/red');
  assert.equal(settings.httpNodeRoot, '/red/api');
  assert.equal(settings.flowFile, 'flows.json');
  assert.deepEqual(settings.nodesDir, [NODE_RED_NODES_DIR]);
});

test('embedded Node-RED serves the editor and custom node metadata', async (t) => {
  const app = require('express')();
  const server = http.createServer(app);
  const mqttHandler = new EventEmitter();
  const knxHandler = new EventEmitter();
  mqttHandler.publish = () => {};
  knxHandler.write = () => {};

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pini-nodered-'));
  const config = {
    topicPrefix: 'knx',
    groupAddresses: [],
    nodeRed: {
      adminRoot: '/red',
      httpNodeRoot: '/red/api',
      userDir,
      flowFile: 'flows.json',
    },
  };

  const nodeRedServer = new NodeRedServer(app, server, {
    eventEmitter: new EventEmitter(),
    mqttHandler,
    knxHandler,
    config,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  await nodeRedServer.start();

  t.after(async () => {
    await nodeRedServer.stop();
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(userDir, { recursive: true, force: true });
  });

  const port = server.address().port;
  const editor = await httpGet(port, '/red/');
  assert.equal(editor.statusCode, 200);
  assert.match(editor.body, /Node-RED/i);

  const nodes = await httpGet(port, '/red/nodes');
  assert.equal(nodes.statusCode, 200);
  assert.match(nodes.body, /pini-knx in/);
  assert.match(nodes.body, /pini-knx out/);
  assert.match(nodes.body, /pini-timer/);
  assert.match(nodes.body, /pini-mqtt-state/);
});
