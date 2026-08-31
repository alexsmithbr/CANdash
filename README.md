# CANdash

CANdash is a local-first, open-source J1939 dashboard for Linux, Raspberry Pi,
and browser clients on a trusted local network. It is designed around the
Volare / Cummins CM2220 captures used during development, while keeping signals,
source addresses, PGNs, profiles, and gauge types configurable.

The current release is deliberately **receive-only**. Demo and candump replay
run completely in the browser. Live SocketCAN uses a small Python WebSocket
bridge that contains no CAN transmit API.

## Included today

- Responsive gauges for desktop, mounted screens, tablets, and phones
- Green update LED pulse on every accepted signal value
- Built-in Volare / Cummins CM2220 profile with nine gauges
- Source-address + PGN + signal definitions stored in profiles
- Primary/fallback sources (tachograph speed with engine CCVS fallback)
- Browser persistence plus JSON profile import/export and “Save as”
- Custom PGN signals with DBC-style start bit, length, scale, and offset
- Passive ECU and PGN discovery with one-click “Add gauge”
- Demo generator, timestamped candump replay, and live SocketCAN sources
- Replay speed, pause/resume, progress, and looping
- J1939 unavailable/error filtering and stale-value handling
- Read-only DM1 decoding, including BAM transport reassembly
- Disabled placeholder for future guarded fault clearing
- Capture-derived source-aware DBC and a compact replay sample

## Quick start on Ubuntu

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. Click the source button in the upper-right and
select **Demo** to exercise the entire UI without CAN hardware.

### Replay a capture

Open the source chooser, click **Replay**, and select a log written in candump
`-L` format:

```text
(0.367482) can0 0CFE6CEE#001F7FCC00000000
```

`sample-data/volare-drive-key-pgns.log` is included for immediate testing. The
browser accepts timestamps with six or nine fractional digits, even though
`canplayer` itself requires exactly six.

### Read live SocketCAN

First configure the interface in Linux listen-only mode. The bridge does not
change interface settings and cannot compensate for an interface configured to
transmit.

```bash
sudo ip link set can0 down
sudo ip link set can0 type can bitrate 250000 listen-only on
sudo ip link set can0 up

python3 -m venv .venv
. .venv/bin/activate
pip install -r bridge/requirements.txt
python bridge/server.py --interface can0
```

Leave the dashboard running, choose **Live CAN**, and connect to
`ws://127.0.0.1:8765/ws`. Bridge health is available at
`http://127.0.0.1:8765/health`.

For another device on the same trusted LAN, run the bridge with
`--host 0.0.0.0`, open the dashboard through the laptop's LAN address, and set
the WebSocket URL to `ws://LAPTOP_IP:8765/ws`. There is currently no
authentication or TLS, so do not expose either service to the public internet.

## Profiles and decoding

Every gauge stores one or more sources. A source is the combination of:

```text
source address + PGN + signal definition
```

The signal definition includes bit position, bit length, byte order, signedness,
scale, offset, unit, physical limits, and J1939 invalid-value policy. Profiles
also preserve gauge type, order, range, stale timeout, and network defaults.

Profiles are saved in browser local storage and can be exported as JSON. Export
is the portable backup and sharing mechanism. The checked-in
`reference/volare-profile-original.json` documents the earlier profile format;
the running application exports its current schema.

The built-in values are capture-derived rather than OEM-authoritative. In
particular, the project keeps the verified corrections for ET1 coolant
temperature (`1 °C/bit, -40 °C`) and VDHR distance (`0.005 km/bit`). Critical
measurements should still be validated against calibrated instrumentation.

## Architecture

```text
Demo generator ─┐
Candump replay ─┼─> common frame pipeline ─> discovery / decoder / DM1 ─> gauges
SocketCAN bridge┘
```

- `app/`, `components/`: browser dashboard
- `lib/can/`: J1939 IDs, bit decoding, validity rules, replay, sources, profile
- `bridge/server.py`: receive-only SocketCAN WebSocket bridge
- `reference/`: corrected source-aware DBC and analysis material
- `sample-data/`: filtered real-drive replay sample
- `tests/`: decoding, validity, replay, transport, and rendered-page tests

The DBC is provided as analysis/reference material. Runtime gauges use profile
signal definitions, which makes custom PGNs and source-specific variants
possible without generating one DBC per ECU.

## Diagnostics safety boundary

DM1 traffic can be observed passively. Requesting diagnostics, clearing faults,
or any other J1939 transmission is not implemented. A future write mode should
be a separate, explicit maintenance capability with confirmation, audit logging,
bus-state checks, and a clear departure from listen-only operation.

## Validation

```bash
npm run build
npm test
python3 -m py_compile bridge/server.py
```

## License

Application code is MIT licensed. See `THIRD_PARTY_NOTICE.txt` for the generic
J1939 DBC definitions retained in the corrected reference DBC.
