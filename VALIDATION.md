# Validation report

Validated on 2026-08-31.

- Production Vinext build: passed
- ESLint: passed with no warnings
- Node test suite: 7/7 passed
- Python bridge syntax compilation: passed
- Included replay sample: 77,174 classic CAN frames parsed
- Built-in gauges receiving usable sample data: 9/9
- Sample-valid updates by gauge:
  - road speed: 32,026
  - engine speed: 32,204
  - coolant: 644
  - oil pressure: 1,288
  - fuel level: 637
  - battery: 644
  - fuel rate: 6,795
  - barometric pressure: 644
  - tachograph distance: 636

The automated tests cover J1939 identifier extraction, corrected Volare signal
scales, invalid/error encodings, candump nanosecond timestamps, direct DM1,
BAM transport reassembly, and server-rendered product content.

Live SocketCAN was not available inside the build environment. The bridge is
small, receive-only, and syntax checked, but should still be exercised on the
target Ubuntu laptop with `vcan0` before the first vehicle connection.
