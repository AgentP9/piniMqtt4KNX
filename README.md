# piniMqtt4KNX

A Docker-based **KNX ↔ MQTT gateway** with a live web traffic dashboard.

## Features

- Connects to a **KNXnet/IP tunnel** (IP + Port)
- Connects to any **MQTT broker** (IP, Port, optional User/Password)
- Group-address mapping defined in a **JSON file** mounted as a Docker volume (no rebuild required)
- **KNX → MQTT**: every `GroupValue_Write` on the KNX bus is published to `<prefix>/<address>` (e.g. `knx/9/0/1`)
- **MQTT → KNX**: messages received on `<prefix>/<address>` are written back to the corresponding KNX group address
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
    "comment": "Temperature sensor in °C"
  }
]
```

| Field     | Required | Description                              |
|-----------|----------|------------------------------------------|
| `address` | ✅       | KNX group address (e.g. `"9/0/1"`)      |
| `name`    | –        | Human-readable label shown in dashboard  |
| `dpt`     | –        | Data Point Type for encoding/decoding    |
| `comment` | –        | Free-text note                           |

Supported DPT groups: `1.x` (boolean), `5.x` (unsigned byte), `9.x` (2-byte float).  
Any other DPT falls back to a hex-string representation.

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
> All incoming KNX bus telegrams are forwarded KNX → MQTT regardless of the configuration file.

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
