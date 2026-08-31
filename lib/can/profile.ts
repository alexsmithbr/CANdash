import type { DashboardProfile, SignalDefinition } from "./types";

const signal = (
  name: string, startBit: number, length: number, scale: number, offset: number,
  unit: string, minimum: number, maximum: number, decimals = 1,
): SignalDefinition => ({ name, startBit, length, byteOrder: "little", signed: false, scale, offset, unit, minimum, maximum, decimals, invalidPolicy: "j1939" });

export const DEFAULT_PROFILE: DashboardProfile = {
  schemaVersion: 1,
  id: "volare-cummins-cm2220",
  name: "Volare / Cummins CM2220",
  description: "Capture-derived starting profile. Validate critical values against calibrated instrumentation.",
  network: { protocol: "j1939", bitrate: 250000, listenOnlyDefault: true },
  updateIndicator: { enabled: true, color: "#2ee59d", onMs: 90, fadeMs: 160 },
  gauges: [
    {
      id: "vehicle-speed", title: "Road speed", gaugeType: "speedometer", minimum: 0, maximum: 120, warning: 90, staleAfterMs: 1200,
      sources: [
        { sourceAddress: 0xee, pgn: 0xfe6c, messageName: "TCO1", signal: signal("TachographVehicleSpeed", 48, 16, 0.00390625, 0, "km/h", 0, 250.996, 1) },
        { sourceAddress: 0x00, pgn: 0xfef1, messageName: "CCVS", signal: signal("WheelBasedVehicleSpeed", 8, 16, 0.00390625, 0, "km/h", 0, 250.996, 1) },
      ],
    },
    {
      id: "engine-speed", title: "Engine speed", gaugeType: "tachometer", minimum: 0, maximum: 3000, warning: 2400, critical: 2800, staleAfterMs: 650,
      sources: [{ sourceAddress: 0x00, pgn: 0xf004, messageName: "EEC1", signal: signal("EngSpeed", 24, 16, 0.125, 0, "rpm", 0, 8031.875, 0) }],
    },
    {
      id: "coolant", title: "Coolant", gaugeType: "radial", minimum: 20, maximum: 120, warning: 98, critical: 108, staleAfterMs: 3200,
      sources: [{ sourceAddress: 0x00, pgn: 0xfeee, messageName: "ET1", signal: signal("EngCoolantTemp", 0, 8, 1, -40, "°C", -40, 210, 0) }],
    },
    {
      id: "oil-pressure", title: "Oil pressure", gaugeType: "radial", minimum: 0, maximum: 600, staleAfterMs: 2200,
      sources: [{ sourceAddress: 0x00, pgn: 0xfeef, messageName: "EFL/P1", signal: signal("EngOilPress", 24, 8, 4, 0, "kPa", 0, 1000, 0) }],
    },
    {
      id: "fuel-level", title: "Fuel level", gaugeType: "bar", minimum: 0, maximum: 100, warning: 20, staleAfterMs: 3200,
      sources: [{ sourceAddress: 0x17, pgn: 0xfefc, messageName: "DD", signal: signal("FuelLevel1", 8, 8, 0.4, 0, "%", 0, 100, 0) }],
    },
    {
      id: "battery", title: "Battery", gaugeType: "numeric", minimum: 18, maximum: 32, staleAfterMs: 3200,
      sources: [{ sourceAddress: 0x00, pgn: 0xfef7, messageName: "VEP1", signal: signal("BatteryPotential_PowerInput1", 32, 16, 0.05, 0, "V", 0, 3212.75, 2) }],
    },
    {
      id: "fuel-rate", title: "Fuel rate", gaugeType: "numeric", minimum: 0, maximum: 50, staleAfterMs: 1800,
      sources: [{ sourceAddress: 0x00, pgn: 0xfef2, messageName: "LFE", signal: signal("EngFuelRate", 0, 16, 0.05, 0, "L/h", 0, 3212.75, 1) }],
    },
    {
      id: "barometric", title: "Barometric", gaugeType: "numeric", minimum: 80, maximum: 110, staleAfterMs: 3200,
      sources: [{ sourceAddress: 0x00, pgn: 0xfef5, messageName: "AMB", signal: signal("BarometricPress", 0, 8, 0.5, 0, "kPa", 0, 125, 1) }],
    },
    {
      id: "distance", title: "Tachograph distance", gaugeType: "odometer", minimum: 0, staleAfterMs: 3200,
      sources: [{ sourceAddress: 0xee, pgn: 0xfec1, messageName: "VDHR", signal: signal("HghRslutionTotalVehicleDistance", 0, 32, 0.005, 0, "km", 0, 21055406, 1) }],
    },
  ],
};

export const KNOWN_SIGNAL_SOURCES = DEFAULT_PROFILE.gauges.flatMap((gauge) =>
  gauge.sources.map((source) => ({ ...source, title: gauge.title, suggestedGaugeType: gauge.gaugeType, suggestedMinimum: gauge.minimum, suggestedMaximum: gauge.maximum })),
);

export function cloneProfile(profile: DashboardProfile): DashboardProfile {
  return JSON.parse(JSON.stringify(profile)) as DashboardProfile;
}
