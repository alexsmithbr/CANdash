# Volare J1939 DBC comparison

- Original DBC: `j1939.dbc` (545 usable message definitions)
- Captures: `main_one.log`, `main_two.log` (650,940 frames, 66 exact CAN IDs)
- Observed PGNs: 54
- PGNs covered by the generic DBC: 50/54
- Frames whose PGN has a generic definition: 624,627/650,940 (96.0%)
- Exact source-aware message definitions generated for CANviz: 61
- Source-specific signal series described: 451
- Signal series with at least one usable value in this capture: 183

## Important findings

1. The source file is a generic J1939 database, not a Volare or Cummins CM2220 database.
   Its repository labels it `J1939 (universal)` version 7.6 and lists the original author as unknown, sourced from Haskell.org.
2. Its 0xFE source address is a generic placeholder. CANviz treats it as a literal address, so the original file does not match normal live IDs.
3. `ET1.EngCoolantTemp` contained a definite transcription error. It was corrected from `(0.03125,-273)` to `(1,-40)`.
4. `VDHR` distance used `5 km/bit`; photographs and GPX tracks confirm `0.005 km/bit` (5 metres/bit).
5. Enumerated value tables and message/signal comments are retained on every source-specific clone.
6. J1939 unavailable/error encodings are filtered by the included runtime decoder; a DBC alone cannot suppress numeric plot spikes in CANviz.
7. Proprietary PGNs absent from the generic DBC remain raw and are not guessed.

## Observed source addresses

| Source | Frames |
|---:|---:|
| `0x00` | 530,767 |
| `0xEE` | 62,851 |
| `0x52` | 24,757 |
| `0x17` | 17,683 |
| `0x29` | 12,898 |
| `0x21` | 1,964 |
| `0xFE` | 20 |

## Missing PGNs

| PGN | Frames | Sources |
|---:|---:|---|
| `0x0FFDB` | 11,943 | 0x00 |
| `0x0FF49` | 11,942 | 0x00 |
| `0x0FF0A` | 2,388 | 0x00 |
| `0x0FF48` | 40 | 0x00 |

## Generated DBC scope

The generated DBC clones a generic definition for each exact CAN ID observed in this capture. This allows CANviz to keep `SA 0x00`, `0x17`, `0x29`, `0x52`, and other senders separate without requiring one DBC file per ECU.

The plot-focused variant contains 50 messages and only signals that produced at least one usable value in this capture. It makes the CANviz selector easier to use, but it does not replace runtime J1939 validity filtering.

It is a test/analysis database, not an OEM-authoritative Volare database. Validate important values against Cummins INSITE, the instrument cluster, or calibrated measurements before operational use.
