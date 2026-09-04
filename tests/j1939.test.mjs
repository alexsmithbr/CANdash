import assert from "node:assert/strict";
import test from "node:test";
import { decodeDm1, decodeSignal, parseCandump, parseJ1939Id, TransportProtocolAssembler } from "../lib/can/j1939.ts";
import { parseDbc } from "../lib/can/dbc.ts";
import { evaluateFormula, formulaIsValid, formulaRatioReferences, formulaReferences } from "../lib/can/formula.ts";
import { newAverageState, newSmoothingState, newStatisticsState, smoothValue, updateLongAverage, updateStatistics } from "../lib/can/telemetry.ts";
import { normalizedStatisticsDisplay } from "../lib/can/statistics-display.ts";

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

test("parses an extended J1939 DBC message and its signals", () => {
  const dbc = parseDbc(`BO_ ${0x98f004fe} EEC1: 8 Engine\n SG_ EngSpeed : 24|16@1+ (0.125,0) [0|8031.875] "rpm" Vector__XXX\n`, "test.dbc");
  assert.equal(dbc.messages[0].pgn, 0xf004);
  assert.equal(dbc.messages[0].sourceAddress, null);
  assert.deepEqual(dbc.messages[0].signals[0], {
    name: "EngSpeed", startBit: 24, length: 16, byteOrder: "little", signed: false,
    scale: 0.125, offset: 0, unit: "rpm", minimum: 0, maximum: 8031.875,
    decimals: 2, invalidPolicy: "j1939", receivers: ["Vector__XXX"],
  });
});

test("evaluates formulas without executing JavaScript", () => {
  const readings = {
    "vehicle-speed": { value: 72, statistics: { minimum: 0, average: 60, maximum: 90, sampleCount: 3 }, updatedAt: 1, sourceIndex: 0, pulse: 1 },
    "fuel-rate": { value: 12, statistics: { minimum: 0, average: 6, maximum: 14, sampleCount: 3 }, updatedAt: 1, sourceIndex: 0, pulse: 2 },
  };
  assert.deepEqual(formulaReferences("{vehicle-speed} / {fuel-rate}"), ["vehicle-speed", "fuel-rate"]);
  assert.equal(evaluateFormula("round({vehicle-speed} / {fuel-rate})", readings), 6);
  assert.equal(evaluateFormula("AVG({vehicle-speed}) / AVG({fuel-rate})", readings), 10);
  assert.equal(formulaIsValid("AVG({vehicle-speed}) / AVG({fuel-rate})"), true);
  assert.equal(formulaIsValid("sqrt({vehicle-speed} - 100)"), true);
  assert.equal(formulaIsValid("{vehicle-speed} +"), false);
  assert.deepEqual(formulaRatioReferences("{vehicle-speed} / {fuel-rate}"), ["vehicle-speed", "fuel-rate"]);
  assert.equal(formulaRatioReferences("2 * {vehicle-speed} / {fuel-rate}"), null);
  assert.equal(evaluateFormula("globalThis.alert(1)", readings), null);
});

test("keeps zero readings valid while rejecting division by zero", () => {
  const readings = { "fuel-rate": { value: 0, statistics: { minimum: 0, average: 0, maximum: 0, sampleCount: 1 }, updatedAt: 1, sourceIndex: 0, pulse: 1 } };
  assert.equal(evaluateFormula("{fuel-rate}", readings), 0);
  assert.equal(evaluateFormula("1 / {fuel-rate}", readings), null);
});

test("smooths noisy readings with a time-based EMA", () => {
  const state = newSmoothingState();
  assert.equal(smoothValue(10, 0, { method: "ema", windowMs: 3000 }, state), 10);
  const value = smoothValue(20, 3000, { method: "ema", windowMs: 3000 }, state);
  assert.ok(Math.abs(value - 16.321205588) < 0.000001);
});

test("computes time-weighted and ratio-of-integrals long averages", () => {
  const mean = newAverageState();
  const definition = { enabled: true, method: "time-weighted" };
  assert.equal(updateLongAverage(10, 0, definition, mean, 3000), 10);
  assert.equal(updateLongAverage(20, 1000, definition, mean, 3000), 10);
  assert.equal(updateLongAverage(30, 2000, definition, mean, 3000), 15);

  const ratio = newAverageState();
  const ratioDefinition = { enabled: true, method: "ratio-of-integrals" };
  assert.equal(updateLongAverage(10, 0, ratioDefinition, ratio, 3000, [60, 6]), 10);
  assert.equal(updateLongAverage(5, 1000, ratioDefinition, ratio, 3000, [30, 6]), 10);
  assert.equal(updateLongAverage(5, 2000, ratioDefinition, ratio, 3000, [30, 6]), 7.5);
});

test("tracks session minimum, maximum, and a time-weighted average including zero", () => {
  const state = newStatisticsState();
  assert.deepEqual(updateStatistics(10, 0, state, 3000), { minimum: 10, average: 10, maximum: 10, sampleCount: 1 });
  assert.deepEqual(updateStatistics(0, 1000, state, 3000), { minimum: 0, average: 10, maximum: 10, sampleCount: 2 });
  assert.deepEqual(updateStatistics(20, 2000, state, 3000), { minimum: 0, average: 5, maximum: 20, sampleCount: 3 });
});

test("keeps v0.5 statistics profiles compatible with configurable markers", () => {
  assert.deepEqual(normalizedStatisticsDisplay({ showStatistics: true }), {
    enabled: true,
    showMinimum: true,
    showAverage: true,
    showMaximum: true,
    showValues: true,
  });
  assert.deepEqual(normalizedStatisticsDisplay({ showStatistics: true, statisticsDisplay: {
    enabled: false,
    showMinimum: false,
    showAverage: true,
    showMaximum: false,
    showValues: false,
  } }), {
    enabled: false,
    showMinimum: false,
    showAverage: true,
    showMaximum: false,
    showValues: false,
  });
});
