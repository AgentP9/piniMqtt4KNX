'use strict';

const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

class WebServer {
  /**
   * @param {number} port
   * @param {import('events').EventEmitter} eventEmitter
   * @param {Array<{ address: string, name?: string, dpt?: string, comment?: string }>} groupAddresses
   * @param {string} groupAddressesPath
   */
  constructor(port, eventEmitter, groupAddresses, groupAddressesPath) {
    this.port = port;
    this.groupAddresses = groupAddresses;
    this.groupAddressesPath = groupAddressesPath;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server);

    this.app.use(express.json());

    // Serve static frontend
    this.app.use(express.static(path.join(__dirname, '../public')));

    // ── REST: group addresses ──────────────────────────────────────────────────

    // GET all configured group addresses
    this.app.get('/api/groupaddresses', (_req, res) => {
      res.json(this.groupAddresses);
    });

    // POST – add or update a group address
    this.app.post('/api/groupaddresses', (req, res) => {
      const { address, name, dpt, comment } = req.body || {};
      if (!address) return res.status(400).json({ error: 'address is required' });

      const entry = { address, name: name || '', dpt: dpt || '', comment: comment || '' };
      const idx = this.groupAddresses.findIndex((g) => g.address === address);
      const previous = idx >= 0 ? this.groupAddresses[idx] : null;

      if (idx >= 0) {
        this.groupAddresses[idx] = entry;
      } else {
        this.groupAddresses.push(entry);
      }

      if (this._saveGroupAddresses()) {
        this.io.emit('groupaddresses', this._enrichGAs());
        return res.json(entry);
      }

      // Revert in-memory change on save failure
      if (previous) {
        this.groupAddresses[idx] = previous;
      } else {
        this.groupAddresses.pop();
      }
      return res.status(500).json({ error: 'Failed to persist configuration' });
    });

    // POST /api/groupaddresses/import – bulk add/update from an ETS XML export
    this.app.post('/api/groupaddresses/import', (req, res) => {
      const { addresses } = req.body || {};
      if (!Array.isArray(addresses)) {
        return res.status(400).json({ error: 'addresses array is required' });
      }

      let added = 0, updated = 0;
      for (const item of addresses) {
        const { address, name, dpt, comment } = item || {};
        if (!address) continue;
        const entry = { address, name: name || '', dpt: dpt || '', comment: comment || '' };
        const idx = this.groupAddresses.findIndex((g) => g.address === address);
        if (idx >= 0) {
          // Merge: keep existing values unless the import provides new ones
          this.groupAddresses[idx] = { ...this.groupAddresses[idx], ...entry };
          updated++;
        } else {
          this.groupAddresses.push(entry);
          added++;
        }
      }

      if (this._saveGroupAddresses()) {
        this.io.emit('groupaddresses', this._enrichGAs());
        return res.json({ ok: true, added, updated });
      }
      return res.status(500).json({ error: 'Failed to persist configuration' });
    });

    // DELETE – remove a group address (address may contain slashes, captured by wildcard)
    this.app.delete('/api/groupaddresses/*', (req, res) => {
      const address = decodeURIComponent(req.params[0]);
      const idx = this.groupAddresses.findIndex((g) => g.address === address);
      if (idx < 0) return res.status(404).json({ error: 'Not found' });

      const [removed] = this.groupAddresses.splice(idx, 1);
      if (this._saveGroupAddresses()) {
        this.io.emit('groupaddresses', this._enrichGAs());
        return res.json({ ok: true });
      }

      // Revert in-memory change on save failure
      this.groupAddresses.splice(idx, 0, removed);
      return res.status(500).json({ error: 'Failed to persist configuration' });
    });

    // ── Connection status tracking ─────────────────────────────────────────────
    this._status = { KNX: false, MQTT: false };

    // Keep a rolling in-memory log (last 200 entries) for late-joining clients
    this._log = [];

    // Last received value per group address (address → value string)
    this._lastValues = {};

    this.io.on('connection', (socket) => {
      console.log('[WEB] Client connected');
      // Send existing log and current state to the new client
      socket.emit('init', this._log);
      Object.entries(this._status).forEach(([service, connected]) => {
        socket.emit('status', { service, connected });
      });
      socket.emit('groupaddresses', this._enrichGAs());
      socket.on('disconnect', () => console.log('[WEB] Client disconnected'));
    });

    // Forward traffic events to all web clients
    eventEmitter.on('traffic', (entry) => {
      this._log.push(entry);
      if (this._log.length > 200) this._log.shift();
      // Track last value for configured group addresses
      if (entry.configured !== false) {
        this._lastValues[entry.address] = entry.value;
      }
      this.io.emit('traffic', entry);
    });

    // Forward connection-status changes to all web clients
    eventEmitter.on('status', (data) => {
      this._status[data.service] = data.connected;
      this.io.emit('status', data);
    });

    this.server.listen(port, () => {
      console.log(`[WEB] Dashboard available at http://localhost:${port}`);
    });
  }

  /** Merge last-known values into the GA list before sending to clients. */
  _enrichGAs() {
    return this.groupAddresses.map((ga) => {
      const lastValue = this._lastValues[ga.address];
      return lastValue !== undefined ? { ...ga, lastValue } : { ...ga };
    });
  }

  _saveGroupAddresses() {
    try {
      fs.writeFileSync(
        this.groupAddressesPath,
        JSON.stringify(this.groupAddresses, null, 2),
        'utf8'
      );
      console.log(`[WEB] Saved ${this.groupAddresses.length} group address(es) to ${this.groupAddressesPath}`);
      return true;
    } catch (err) {
      console.error('[WEB] Failed to save group addresses:', err.message);
      return false;
    }
  }
}

module.exports = WebServer;
