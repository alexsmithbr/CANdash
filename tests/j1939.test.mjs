import assert from "node:assert/strict";
import test from "node:test";
import { decodeDm1, decodeSignal, parseCandump, parseJ1939Id, TransportProtocolAssembler } from "../lib/can/j1939.ts";

const signal = (startBit, length, scale, offset, minimum, maximum) => ({
  name: "test", startBit, length, scale, offset, minimum, maximum,
  byteOrder: "little", signed: false, unit: "", invalidPolicy: "j1939",
});

test("extracts the J1939 PGN and source address", () => {
  assert.deepEqual(parseJ1939Id(0x0cfe6cee), { priority: 3, pgn: 0xfe6c, sourceAddress: 0xee, destinationAddress: null });
  assert.deepEqual(parseJ1939Id(0x18ea0017), { priority: 6, pgn: 0xea00, sourceAddress: 0x17, destinationAddress: 0x00 });
});

test("decodes corrected Volare scales", () => {
  assert.equal(decodeSignal([0x7d], signal(0, 8, 1, -40, -40, 210)), 85);
  assert.equal(decodeSignal([0xee, 0x3c, 0x05, 0x00], signal(0, 32, 0.005, 0, 0, 21_055_406)), 1716.39);
  assert.equal(decodeSignal([0x00, 0x00, 0x00, 0xd7, 0x01], signal(24, 16, 0.05, 0, 0, 3212.75)), 23.55);
});

test("filters J1939 unavailable and error encodings", () => {
  assert.equal(decodeSignal([0xff], signal(0, 8, 1, 0, 0, 250)), null);
  assert.equal(decodeSignal([0xfe], signal(0, 8, 1, 0, 0, 250)), null);
  assert.equal(decodeSignal([0xff, 0xff], signal(0, 16, 1, 0, 0, 65533)), null);
});

test("parses candump -L logs and preserves relative timing", () => {
  const frames = parseCandump("(57.819496800) can0 18D917FA#140364750300D2EA\n(58.186978900) can0 0CFE6CEE#001F7FCC00000000\n");
  assert.equal(frames.length, 2);
  assert.equal(frames[0].timestamp, 0);
  assert.ok(Math.abs(frames[1].timestamp - 367.4821) < 0.0001);
});

test("decodes a direct DM1 DTC", () => {
  const faults = decodeDm1([0xff, 0xff, 0xfb, 0x00, 0x02, 0x01], 0x00, 1);
  assert.equal(faults[0].spn, 251);
  assert.equal(faults[0].fmi, 2);
  assert.equal(faults[0].occurrenceCount, 1);
});

test("reassembles a BAM transport payload", () => {
  const tp = new TransportProtocolAssembler();
  assert.equal(tp.ingest({ id: 0x18ecff00, data: [0x20, 8, 0, 2, 0xff, 0xca, 0xfe, 0], timestamp: 0 }), null);
  assert.equal(tp.ingest({ id: 0x18ebff00, data: [1, 1, 2, 3, 4, 5, 6, 7], timestamp: 1 }), null);
  assert.deepEqual(tp.ingest({ id: 0x18ebff00, data: [2, 8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], timestamp: 2 }), { pgn: 0xfeca, sourceAddress: 0, data: [1,2,3,4,5,6,7,8] });
});
