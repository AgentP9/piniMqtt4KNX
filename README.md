# piniMqtt4KNX

A Docker-based **KNX ↔ MQTT gateway** with a live web traffic dashboard.

## Features

- Connects to a **KNXnet/IP tunnel** (IP + Port)
- Connects to any **MQTT broker** (IP, Port, optional User/Password)
- Group-address mapping defined in a **JSON file** mounted as a Docker volume (no rebuild required)
- **KNX → MQTT**: every `GroupValue_Write` on the KNX bus is published to `<prefix>/<address>` (e.g. `knx/9/0/1`)
- **MQTT → KNX**: messages received on `<prefix>/<address>` are written back to the corresponding KNX group address
- **Per-address routing direction**: configure each group address as bidirectional (default), KNX→MQTT only, or MQTT→KNX only
- **Repeat publishing**: optionally re-publish the last KNX value to MQTT at a fixed interval until a new KNX message arrives
- **Web dashboard** (port 3000) showing live telegram traffic, connection status and the configured group addresses

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/AgentP9/piniMqtt4KNX.git
cd piniMqtt4KNX
cp .env.example .env
```

Edit `.env` with your KNX and MQTT settings.

### 2. Configure group addresses

Edit `config/groupaddresses.json` (mounted as a volume – no Docker rebuild needed):

```json
[
  {
    "address": "9/0/1",
    "name": "Living Room – Main Light",
    "dpt": "1.001",
    "comment": "On/Off switch"
  },
  {
    "address": "9/1/0",
    "name": "Kitchen Temperature",
    "dpt": "9.001",
    "comment": "Read-only sensor – KNX → MQTT only",
    "direction": "knx2mqtt"
  },
  {
    "address": "0/0/1",
    "name": "Master Switch",
    "dpt": "1.001",
    "comment": "Controlled from automation – MQTT → KNX only",
    "direction": "mqtt2knx"
  },
  {
    "address": "9/2/0",
    "name": "Outdoor Temperature",
    "dpt": "9.001",
    "comment": "Repeat every 30 s so consumers see a fresh value even without bus activity",
    "direction": "knx2mqtt",
    "repeatInterval": 30
  }
]
```

| Field             | Required | Description                                             |
|-------------------|----------|---------------------------------------------------------|
| `address`         | ✅       | KNX group address (e.g. `"9/0/1"`)                     |
| `name`            | –        | Human-readable label shown in dashboard                 |
| `dpt`             | –        | Data Point Type for encoding/decoding                   |
| `comment`         | –        | Free-text note                                          |
| `direction`       | –        | Routing direction – see table below (default: `"both"`) |
| `repeatInterval`  | –        | Re-publish interval in **seconds** (e.g. `5`); `0` or omitted disables repeat |

Supported DPT groups: `1.x` (boolean), `5.x` (unsigned byte), `9.x` (2-byte float).  
Any other DPT falls back to a hex-string representation.

### Routing direction

Each group address can have an optional `direction` field that restricts which side of the bridge is active:

| Value        | Behaviour                                               |
|--------------|---------------------------------------------------------|
| *(omitted)*  | Bidirectional KNX ↔ MQTT (default)                     |
| `"both"`     | Bidirectional KNX ↔ MQTT (explicit, same as omitted)   |
| `"knx2mqtt"` | KNX → MQTT only (e.g. read-only sensors)               |
| `"mqtt2knx"` | MQTT → KNX only (e.g. actuators driven by automation)  |

> When `"both"` is the effective direction the key is omitted from the saved JSON to keep the config clean.

### Repeat publishing

When `repeatInterval` is set on a group address (or on an individual custom route), the bridge re-publishes the **last received KNX value** to MQTT at that fixed interval.

| Value            | Behaviour                                         |
|------------------|---------------------------------------------------|
| *(omitted or 0)* | No repeat – value is published once per telegram  |
| `5`              | Re-publish every 5 seconds                        |
| `60`             | Re-publish every 60 seconds (1 minute)            |

The repeat timer **resets** every time a new KNX telegram arrives for that group address, so the published value is always the most-recent one.  
The timer **stops automatically** if `repeatInterval` is removed from the configuration (the change takes effect on the next timer tick).

`repeatInterval` can also be set individually on each custom route entry, allowing different repeat rates per MQTT topic.

### 3. Run

```bash
docker-compose up -d
```

Open **http://localhost:3000** for the live dashboard.

---

## Environment Variables

| Variable               | Default        | Description                              |
|------------------------|----------------|------------------------------------------|
| `KNX_IP`               | `192.168.1.1`  | KNXnet/IP router / interface IP          |
| `KNX_PORT`             | `3671`         | KNXnet/IP UDP port                       |
| `MQTT_HOST`            | `localhost`    | MQTT broker hostname / IP                |
| `MQTT_PORT`            | `1883`         | MQTT broker port                         |
| `MQTT_USER`            | _(empty)_      | MQTT username (optional)                 |
| `MQTT_PASSWORD`        | _(empty)_      | MQTT password (optional)                 |
| `MQTT_TOPIC_PREFIX`    | `knx`          | Topic prefix (`knx/9/0/1`)               |
| `WEB_PORT`             | `3000`         | Web dashboard port (host-side)           |
| `GROUP_ADDRESSES_PATH` | `/app/config/groupaddresses.json` | Path inside container |

---

## Topic format

```
<MQTT_TOPIC_PREFIX>/<main>/<middle>/<sub>
```

Example: KNX group address `9/0/1` with default prefix → topic `knx/9/0/1`.

**KNX → MQTT**: value published as a plain string (`"1"`, `"0"`, `"22.50"`, …).  
**MQTT → KNX**: publish any value string to `knx/9/0/1`; it is encoded via the configured DPT before being written to KNX.

> ⚠️ Only group addresses listed in `groupaddresses.json` are forwarded from MQTT → KNX (acts as an allowlist).  
> All incoming KNX bus telegrams are forwarded KNX → MQTT regardless of the configuration file, unless the address has `"direction": "mqtt2knx"`.  
> Similarly, MQTT messages to a group address with `"direction": "knx2mqtt"` are silently ignored.

---

## Project Structure

```
piniMqtt4KNX/
├── src/
│   ├── index.js          # Entry point – wires KNX ↔ MQTT bridge
│   ├── config.js         # Configuration loader (env vars + JSON file)
│   ├── knxHandler.js     # KNXnet/IP connection & DPT encode/decode
│   ├── mqttHandler.js    # MQTT connection & pub/sub
│   └── webServer.js      # Express + Socket.io dashboard server
├── public/
│   └── index.html        # Live dashboard (Bootstrap 5 + Socket.io)
├── config/
│   └── groupaddresses.json   # Your group-address mapping (edit freely)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## License

MIT
