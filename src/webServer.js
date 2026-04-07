'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

class WebServer {
  /**
   * @param {number} port
   * @param {import('events').EventEmitter} eventEmitter
   * @param {Array<{ address: string, name?: string, dpt?: string, comment?: string }>} groupAddresses
   */
  constructor(port, eventEmitter, groupAddresses) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server);

    // Serve static frontend
    this.app.use(express.static(path.join(__dirname, '../public')));

    // REST endpoint: expose configured group addresses to the dashboard
    this.app.get('/api/groupaddresses', (_req, res) => {
      res.json(groupAddresses || []);
    });

    // Keep a rolling in-memory log (last 200 entries) for late-joining clients
    this._log = [];

    this.io.on('connection', (socket) => {
      console.log('[WEB] Client connected');
      // Send existing log to new client
      socket.emit('init', this._log);
      socket.on('disconnect', () => console.log('[WEB] Client disconnected'));
    });

    // Forward traffic events to all web clients
    eventEmitter.on('traffic', (entry) => {
      this._log.push(entry);
      if (this._log.length > 200) this._log.shift();
      this.io.emit('traffic', entry);
    });

    // Forward connection-status changes to all web clients
    eventEmitter.on('status', (data) => {
      this.io.emit('status', data);
    });

    this.server.listen(port, () => {
      console.log(`[WEB] Dashboard available at http://localhost:${port}`);
    });
  }
}

module.exports = WebServer;
