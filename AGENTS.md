# CANdash contributor guide

## Scope and safety

CANdash is a local-first J1939 dashboard. Keep the default and live bridge receive-only. Do not add CAN transmission, diagnostic requests, or fault clearing without a separate, explicit safety design and user authorization.

## Architecture

- `components/dashboard/` contains the dashboard, gauge, discovery, DBC, replay, and diagnostics UI.
- `lib/can/` contains protocol parsing, DBC parsing, formulas, profiles, and data sources.
- `bridge/server.py` is the receive-only SocketCAN-to-WebSocket bridge.
- `reference/` contains capture-derived reference material; runtime gauges use self-contained profile definitions.
- `tests/` contains Node tests for decoding and the built application.

Preserve the common frame pipeline: demo, replay, and live data must feed the same discovery, decoding, formula, and fault logic.

## Development

Node.js 22.13 or newer is required.

```bash
npm ci
npm run lint
npm test
python3 -m py_compile bridge/server.py
```

Do not commit `node_modules/`, `dist/`, `.sites-runtime/`, `.wrangler/`, Python virtual environments, or `__pycache__/`.

## Data model conventions

- Match J1939 traffic by source address plus PGN. A null source address means any source.
- Store imported DBC libraries in browser IndexedDB, but copy chosen signal definitions into profiles so exported profiles remain self-contained.
- Formula expressions must use the safe parser in `lib/can/formula.ts`; never evaluate user input as JavaScript.
- Unit conversion happens after DBC/raw signal decoding.
- Smoothing affects display values; preserve unsmoothed values for formulas and long-term statistics.
- Use time-weighted averages for irregular updates. Fuel-economy averages should use ratio-of-integrals, not the mean of instantaneous ratios.
- Treat numeric zero as a valid, fresh reading. Keep formula liveness separate from whether an expression currently has a finite result.
- `AVG({gauge-id})` resolves to that dependency's session time-weighted average; keep aggregate functions inside the safe formula parser.
- Treat J1939 unavailable/error encodings as missing values unless a gauge explicitly disables that policy.
- Preserve existing profile IDs when editing gauges, because formulas refer to gauges by ID.

## UI conventions

- Keep controls usable on desktop, mounted displays, tablets, and phones.
- Every accepted reading update should pulse the gauge LED.
- Stale or unavailable values display as an em dash, not a misleading number.
- Editing a gauge must not silently remove its fallback sources.
- Keep the line-history gauge time-based; do not treat irregular CAN updates as evenly spaced samples.
- Replay pause must freeze the logical dashboard clock, not merely stop incoming frames.
- Preserve the legacy `histogram` gauge type as a read-compatible alias for `history`.
