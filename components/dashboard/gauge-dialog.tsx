"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { KNOWN_SIGNAL_SOURCES } from "@/lib/can/profile";
import { formulaIsValid, formulaRatioReferences, formulaReferences } from "@/lib/can/formula";
import type { ByteOrder, DiscoveryEntry, GaugeDefinition, GaugeType, SignalSource } from "@/lib/can/types";

const GAUGE_TYPES: GaugeType[] = ["speedometer", "tachometer", "radial", "temperature", "pressure", "bar", "numeric", "odometer", "history"];
const GAUGE_TYPE_LABELS: Partial<Record<GaugeType, string>> = {
  speedometer: "Speedometer",
  tachometer: "Tachometer",
  radial: "Radial",
  temperature: "Temperature",
  pressure: "Pressure",
  bar: "Bar",
  numeric: "Numeric",
  odometer: "Odometer",
  history: "Line history",
};
const CONVERSIONS = [
  { id: "none", label: "Source unit (no conversion)", to: "", scale: 1, offset: 0 },
  { id: "kmh-mph", label: "km/h → mph", to: "mph", scale: 0.621371, offset: 0 },
  { id: "km-mi", label: "km → mi", to: "mi", scale: 0.621371, offset: 0 },
  { id: "c-f", label: "°C → °F", to: "°F", scale: 1.8, offset: 32 },
  { id: "kpa-psi", label: "kPa → psi", to: "psi", scale: 0.1450377, offset: 0 },
  { id: "lh-gph", label: "L/h → US gal/h", to: "US gal/h", scale: 0.264172, offset: 0 },
  { id: "custom", label: "Custom linear conversion", to: "", scale: 1, offset: 0 },
] as const;

type KnownCandidate = SignalSource & { title: string; suggestedGaugeType: GaugeType; suggestedMinimum: number; suggestedMaximum?: number };
type CandidateOption = { value: string; label: string; searchText: string; source?: KnownCandidate };
const number = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const parseAddress = (value: string) => value.trim() === "" ? null : Number.parseInt(value.replace(/^0x/i, ""), 16);
const parsePgn = (value: string) => value.trim().toLowerCase().startsWith("0x") ? Number.parseInt(value.slice(2), 16) : Number(value);

function inferredGauge(source: SignalSource): GaugeType {
  const unit = source.signal.unit.toLowerCase();
  if (unit.includes("°c") || unit.includes("deg c") || unit.includes("°f")) return "temperature";
  if (["kpa", "mpa", "bar", "psi"].some((value) => unit.includes(value))) return "pressure";
  if (unit === "rpm") return "tachometer";
  if (unit === "km/h" || unit === "mph") return "speedometer";
  if (unit === "%") return "bar";
  return "numeric";
}

export function GaugeDialog({ open, entry, gauge, dbcSources, profileGauges, onOpenChange, onSave }: {
  open: boolean;
  entry?: DiscoveryEntry;
  gauge?: GaugeDefinition;
  dbcSources: SignalSource[];
  profileGauges: GaugeDefinition[];
  onOpenChange: (open: boolean) => void;
  onSave: (gauge: GaugeDefinition) => void;
}) {
  const [title, setTitle] = useState("Custom signal");
  const [inputMode, setInputMode] = useState<"signal" | "formula">("signal");
  const [gaugeType, setGaugeType] = useState<GaugeType>("numeric");
  const [sa, setSa] = useState("00"), [pgn, setPgn] = useState("65265"), [knownIndex, setKnownIndex] = useState("custom");
  const [signalName, setSignalName] = useState("Signal"), [startBit, setStartBit] = useState("0"), [length, setLength] = useState("8");
  const [byteOrder, setByteOrder] = useState<ByteOrder>("little"), [signed, setSigned] = useState(false), [invalidPolicy, setInvalidPolicy] = useState<"j1939" | "none">("j1939");
  const [scale, setScale] = useState("1"), [offset, setOffset] = useState("0"), [unit, setUnit] = useState("");
  const [minimum, setMinimum] = useState("0"), [maximum, setMaximum] = useState("100"), [staleAfterMs, setStaleAfterMs] = useState("3000");
  const [conversionPreset, setConversionPreset] = useState("none"), [conversionScale, setConversionScale] = useState("1"), [conversionOffset, setConversionOffset] = useState("0"), [displayUnit, setDisplayUnit] = useState("");
  const [smoothingMethod, setSmoothingMethod] = useState<"none" | "ema" | "moving-average">("none"), [smoothingWindowMs, setSmoothingWindowMs] = useState("3000");
  const [historyWindowMs, setHistoryWindowMs] = useState("30000"), [longAverageMethod, setLongAverageMethod] = useState<"none" | "time-weighted" | "ratio-of-integrals">("none");
  const [formula, setFormula] = useState(""), [error, setError] = useState("");

  const candidates = useMemo<KnownCandidate[]>(() => {
    const builtIn = KNOWN_SIGNAL_SOURCES as KnownCandidate[];
    const imported = dbcSources.map((source) => ({ ...source, title: source.signal.name.replaceAll("_", " "), suggestedGaugeType: inferredGauge(source), suggestedMinimum: source.signal.minimum ?? 0, suggestedMaximum: source.signal.maximum }));
    return [...builtIn, ...imported].filter((source) => !entry || source.pgn === entry.pgn && (source.sourceAddress === entry.sourceAddress || source.sourceAddress == null));
  }, [dbcSources, entry]);

  const candidateOptions = useMemo<CandidateOption[]>(() => [
    { value: "custom", label: "Custom signal", searchText: "custom signal manual" },
    ...candidates.map((source, index) => {
      const saHex = source.sourceAddress == null ? "ANY" : `0x${source.sourceAddress.toString(16).padStart(2, "0").toUpperCase()}`;
      const pgnHex = `0x${source.pgn.toString(16).toUpperCase()}`;
      const canIdHex = source.canId == null ? "" : `0x${source.canId.toString(16).padStart(8, "0").toUpperCase()}`;
      const identity = `${source.messageName ?? "CUSTOM"}.${source.signal.name}`;
      return {
        value: String(index),
        label: identity,
        searchText: `${identity} ${source.title} ${source.signal.unit} SA ${saHex} ${source.sourceAddress ?? "any"} PGN ${pgnHex} ${source.pgn} CAN ID ${canIdHex} ${source.canId ?? ""}`.toLowerCase(),
        source,
      };
    }),
  ], [candidates]);
  const selectedCandidate = candidateOptions.find((option) => option.value === knownIndex) ?? candidateOptions[0];

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setError("");
      if (gauge) {
        const source = gauge.sources[0];
        setInputMode(gauge.formula ? "formula" : "signal"); setTitle(gauge.title); setGaugeType(gauge.gaugeType === "formula" ? "numeric" : gauge.gaugeType === "histogram" ? "history" : gauge.gaugeType); setMinimum(String(gauge.minimum)); setMaximum(String(gauge.maximum ?? 100)); setStaleAfterMs(String(gauge.staleAfterMs));
        setFormula(gauge.formula?.expression ?? ""); setDisplayUnit(gauge.formula?.unit ?? gauge.conversion?.unit ?? source?.signal.unit ?? "");
        setConversionPreset(gauge.conversion?.preset ?? "none"); setConversionScale(String(gauge.conversion?.scale ?? 1)); setConversionOffset(String(gauge.conversion?.offset ?? 0));
        setSmoothingMethod(gauge.smoothing?.method ?? "none"); setSmoothingWindowMs(String(gauge.smoothing?.windowMs ?? 3000)); setHistoryWindowMs(String(gauge.historyWindowMs ?? 30000)); setLongAverageMethod(gauge.longAverage?.enabled ? gauge.longAverage.method : "none");
        if (source) {
          setSa(source.sourceAddress == null ? "" : source.sourceAddress.toString(16).padStart(2, "0").toUpperCase()); setPgn(String(source.pgn));
          setSignalName(source.signal.name); setStartBit(String(source.signal.startBit)); setLength(String(source.signal.length)); setByteOrder(source.signal.byteOrder);
          setSigned(source.signal.signed); setInvalidPolicy(source.signal.invalidPolicy ?? "j1939"); setScale(String(source.signal.scale)); setOffset(String(source.signal.offset)); setUnit(source.signal.unit);
        }
        setKnownIndex("custom"); return;
      }
      setInputMode("signal"); setStaleAfterMs("3000"); setConversionPreset("none"); setConversionScale("1"); setConversionOffset("0"); setFormula(""); setSmoothingMethod("none"); setSmoothingWindowMs("3000"); setHistoryWindowMs("30000"); setLongAverageMethod("none");
      setSa(entry ? entry.sourceAddress.toString(16).padStart(2, "0").toUpperCase() : "00"); setPgn(entry ? String(entry.pgn) : "65265");
      const match = candidates[0];
      if (match) applyKnown(match, "0");
      else { setKnownIndex("custom"); setTitle("Custom signal"); setSignalName("Signal"); setGaugeType("numeric"); setUnit(""); setDisplayUnit(""); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.key, gauge?.id]);

  function applyKnown(source: KnownCandidate, index: string) {
    setKnownIndex(index); setTitle(source.title); setGaugeType(source.suggestedGaugeType);
    setSignalName(source.signal.name); setStartBit(String(source.signal.startBit)); setLength(String(source.signal.length));
    setByteOrder(source.signal.byteOrder); setSigned(source.signal.signed); setInvalidPolicy(source.signal.invalidPolicy ?? "j1939");
    setScale(String(source.signal.scale)); setOffset(String(source.signal.offset)); setUnit(source.signal.unit); setDisplayUnit(source.signal.unit);
    setMinimum(String(source.suggestedMinimum)); setMaximum(String(source.suggestedMaximum ?? source.signal.maximum ?? 100));
    setSa(entry ? entry.sourceAddress.toString(16).padStart(2, "0").toUpperCase() : source.sourceAddress == null ? "" : source.sourceAddress.toString(16).padStart(2, "0").toUpperCase());
    setPgn(String(source.pgn)); setConversionPreset("none"); setConversionScale("1"); setConversionOffset("0");
  }

  function changeConversion(id: string) {
    const previous = CONVERSIONS.find((item) => item.id === conversionPreset);
    const previousScale = previous?.id === "custom" ? number(conversionScale, 1) : previous?.scale ?? 1;
    const previousOffset = previous?.id === "custom" ? number(conversionOffset) : previous?.offset ?? 0;
    const sourceMinimum = (number(minimum) - previousOffset) / previousScale;
    const sourceMaximum = (number(maximum, 100) - previousOffset) / previousScale;
    setConversionPreset(id);
    const preset = CONVERSIONS.find((item) => item.id === id)!;
    if (id === "none") { setConversionScale("1"); setConversionOffset("0"); setDisplayUnit(unit); setMinimum(String(sourceMinimum)); setMaximum(String(sourceMaximum)); return; }
    if (id !== "custom") {
      setConversionScale(String(preset.scale)); setConversionOffset(String(preset.offset)); setDisplayUnit(preset.to);
      setMinimum(String(sourceMinimum * preset.scale + preset.offset)); setMaximum(String(sourceMaximum * preset.scale + preset.offset));
    }
  }

  function submit() {
    setError("");
    const min = number(minimum), max = number(maximum, 100), stale = number(staleAfterMs, 3000);
    const smoothing = { method: smoothingMethod, windowMs: Math.max(100, number(smoothingWindowMs, 3000)) } as const;
    const longAverage = { enabled: longAverageMethod !== "none", method: longAverageMethod === "ratio-of-integrals" ? "ratio-of-integrals" as const : "time-weighted" as const };
    const common = { title: title.trim(), gaugeType, minimum: min, maximum: max, staleAfterMs: stale, smoothing, historyWindowMs: Math.max(1000, number(historyWindowMs, 30000)), longAverage };
    if (!title.trim() || max <= min || stale < 100) { setError("Enter a title, an increasing range, and a stale timeout of at least 100 ms."); return; }
    if (inputMode === "formula") {
      const references = formulaReferences(formula);
      const available = new Set(profileGauges.filter((item) => item.id !== gauge?.id && !item.formula).map((item) => item.id));
      if (!formula.trim() || !references.length || references.some((id) => !available.has(id)) || !formulaIsValid(formula)) { setError("Use at least one valid non-formula gauge reference such as {vehicle-speed}. Check the syntax and avoid self references."); return; }
      if (longAverageMethod === "ratio-of-integrals" && !formulaRatioReferences(formula)) { setError("Ratio-of-integrals AVG requires the formula to be exactly {numerator-gauge} / {denominator-gauge}."); return; }
      onSave({ id: gauge?.id ?? `formula-${Date.now()}`, ...common, warning: gauge?.warning, critical: gauge?.critical, sources: [], formula: { expression: formula.trim(), unit: displayUnit.trim(), decimals: 2 } });
      onOpenChange(false); return;
    }
    const parsedPgn = parsePgn(pgn), parsedSa = parseAddress(sa), bits = number(length, 8), bit = number(startBit);
    if (!Number.isInteger(parsedPgn) || parsedPgn < 0 || parsedPgn > 0x3ffff || parsedSa != null && (parsedSa < 0 || parsedSa > 0xff) || bit < 0 || bit > 63 || bits < 1 || bits > 32 || bit + bits > 64) { setError("Check the source address, PGN, start bit, and signal length."); return; }
    const selected = knownIndex === "custom" ? undefined : candidates[Number(knownIndex)];
    const source: SignalSource = {
      sourceAddress: parsedSa, pgn: parsedPgn, messageName: selected?.messageName ?? gauge?.sources[0]?.messageName ?? "CUSTOM",
      signal: { name: signalName.trim() || "Signal", startBit: bit, length: bits, byteOrder, signed, scale: number(scale, 1), offset: number(offset), unit: unit.trim(), decimals: gauge?.sources[0]?.signal.decimals ?? 1, invalidPolicy },
    };
    const retainedFallbacks = gauge?.sources.slice(1) ?? [];
    const conversion = conversionPreset === "none" ? undefined : { preset: conversionPreset, unit: displayUnit.trim(), scale: number(conversionScale, 1), offset: number(conversionOffset) };
    onSave({ id: gauge?.id ?? `${signalName || "signal"}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), ...common, warning: gauge?.warning, critical: gauge?.critical, sources: [source, ...retainedFallbacks], conversion });
    onOpenChange(false);
  }

  const field = "space-y-1.5", label = "text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground";
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{gauge ? "Edit gauge" : "Add a gauge"}</DialogTitle><DialogDescription>Use a built-in or imported DBC signal, define a custom J1939 signal, or calculate a value from existing gauges.</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <div className={field}><label className={label}>Input</label><select value={inputMode} onChange={(event) => { const mode = event.target.value as "signal" | "formula"; setInputMode(mode); if (mode === "formula" && smoothingMethod === "none") { setSmoothingMethod("ema"); setSmoothingWindowMs("3000"); } if (mode === "signal" && longAverageMethod === "ratio-of-integrals") setLongAverageMethod("time-weighted"); }} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="signal">CAN / DBC signal</option><option value="formula">Formula</option></select></div>
        {inputMode === "signal" && <div className={field}>
          <label className={label}>Known definition</label>
          <Combobox
            items={candidateOptions}
            value={selectedCandidate}
            isItemEqualToValue={(item, value) => item.value === value.value}
            itemToStringLabel={(item) => item.label}
            filter={(item, query) => item.searchText.includes(query.trim().toLowerCase())}
            onValueChange={(option) => {
              if (!option || option.value === "custom") { setKnownIndex("custom"); return; }
              applyKnown(option.source!, option.value);
            }}
          >
            <ComboboxInput className="w-full" placeholder="Search signal, PGN, or source address…" showClear={false} />
            <ComboboxContent>
              <ComboboxEmpty>No matching signals.</ComboboxEmpty>
              <ComboboxList>
                {(option: CandidateOption) => <ComboboxItem key={option.value} value={option} className="items-start py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-foreground">{option.label}</div>
                    {option.source && <div className="mt-1 text-[10px] text-muted-foreground">
                      {option.source.title} · SA {option.source.sourceAddress == null ? "ANY" : `0x${option.source.sourceAddress.toString(16).padStart(2, "0").toUpperCase()}`} · PGN 0x{option.source.pgn.toString(16).toUpperCase()} ({option.source.pgn}){option.source.canId != null ? ` · CAN ID 0x${option.source.canId.toString(16).padStart(8, "0").toUpperCase()}` : ""}
                    </div>}
                  </div>
                </ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>}
        <div className={field}><label className={label}>Gauge title</label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className={field}><label className={label}>Gauge type</label><select value={gaugeType} onChange={(event) => setGaugeType(event.target.value as GaugeType)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{GAUGE_TYPES.map((value) => <option key={value} value={value}>{GAUGE_TYPE_LABELS[value] ?? value}</option>)}</select></div>
        {inputMode === "formula" ? <>
          <div className={`${field} sm:col-span-2`}><label className={label}>Formula</label><Input value={formula} onChange={(event) => setFormula(event.target.value)} placeholder="{vehicle-speed} / {fuel-rate}" /><p className="text-[11px] leading-5 text-muted-foreground">Reference gauges with braces. Operators: + − × ÷ % ^. Functions: min, max, abs, sqrt, round, floor, ceil, pow, clamp.</p></div>
          <div className={`${field} sm:col-span-2`}><label className={label}>Available gauge IDs</label><div className="flex flex-wrap gap-1.5">{profileGauges.filter((item) => item.id !== gauge?.id && !item.formula).map((item) => <button type="button" key={item.id} onClick={() => setFormula((value) => `${value}${value ? " " : ""}{${item.id}}`)} className="rounded-md border px-2 py-1 font-mono text-[10px] text-primary">{item.id}</button>)}</div></div>
          <div className={field}><label className={label}>Output unit</label><Input value={displayUnit} onChange={(event) => setDisplayUnit(event.target.value)} /></div>
        </> : <>
          <div className={field}><label className={label}>Source address (hex, blank = any)</label><Input value={sa} onChange={(event) => setSa(event.target.value)} /></div>
          <div className={field}><label className={label}>PGN (decimal or 0x…)</label><Input value={pgn} onChange={(event) => setPgn(event.target.value)} /></div>
          <div className={field}><label className={label}>Signal name</label><Input value={signalName} onChange={(event) => setSignalName(event.target.value)} /></div>
          <div className={field}><label className={label}>Source unit</label><Input value={unit} onChange={(event) => { setUnit(event.target.value); if (conversionPreset === "none") setDisplayUnit(event.target.value); }} /></div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2"><div className={field}><label className={label}>Start bit</label><Input type="number" value={startBit} onChange={(event) => setStartBit(event.target.value)} /></div><div className={field}><label className={label}>Length (1–32)</label><Input type="number" value={length} onChange={(event) => setLength(event.target.value)} /></div></div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2"><div className={field}><label className={label}>Byte order</label><select value={byteOrder} onChange={(event) => setByteOrder(event.target.value as ByteOrder)} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="little">Intel / little</option><option value="big">Motorola / big</option></select></div><div className={field}><label className={label}>Signedness</label><select value={signed ? "signed" : "unsigned"} onChange={(event) => setSigned(event.target.value === "signed")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="unsigned">Unsigned</option><option value="signed">Signed</option></select></div><div className={field}><label className={label}>Invalid values</label><select value={invalidPolicy} onChange={(event) => setInvalidPolicy(event.target.value as "j1939" | "none")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="j1939">J1939 filter</option><option value="none">Keep raw range</option></select></div></div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2"><div className={field}><label className={label}>DBC scale</label><Input type="number" step="any" value={scale} onChange={(event) => setScale(event.target.value)} /></div><div className={field}><label className={label}>DBC offset</label><Input type="number" step="any" value={offset} onChange={(event) => setOffset(event.target.value)} /></div></div>
          <div className={`${field} sm:col-span-2`}><label className={label}>Display conversion</label><select value={conversionPreset} onChange={(event) => changeConversion(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{CONVERSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          {conversionPreset !== "none" && <div className="grid grid-cols-3 gap-3 sm:col-span-2"><div className={field}><label className={label}>Display scale</label><Input type="number" step="any" value={conversionScale} onChange={(event) => { setConversionScale(event.target.value); setConversionPreset("custom"); }} /></div><div className={field}><label className={label}>Display offset</label><Input type="number" step="any" value={conversionOffset} onChange={(event) => { setConversionOffset(event.target.value); setConversionPreset("custom"); }} /></div><div className={field}><label className={label}>Display unit</label><Input value={displayUnit} onChange={(event) => setDisplayUnit(event.target.value)} /></div></div>}
        </>}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2"><div className={field}><label className={label}>Gauge minimum</label><Input type="number" step="any" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></div><div className={field}><label className={label}>Gauge maximum</label><Input type="number" step="any" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></div></div>
        <div className={field}><label className={label}>Stale after (ms)</label><Input type="number" min="100" value={staleAfterMs} onChange={(event) => setStaleAfterMs(event.target.value)} /></div>
        <div className={field}><label className={label}>Display smoothing</label><select value={smoothingMethod} onChange={(event) => setSmoothingMethod(event.target.value as "none" | "ema" | "moving-average")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="none">None</option><option value="ema">Exponential moving average</option><option value="moving-average">Rolling mean</option></select></div>
        {smoothingMethod !== "none" && <div className={field}><label className={label}>Smoothing period (ms)</label><Input type="number" min="100" step="100" value={smoothingWindowMs} onChange={(event) => setSmoothingWindowMs(event.target.value)} /><p className="text-[11px] text-muted-foreground">3,000–5,000 ms works well for instantaneous economy.</p></div>}
        <div className={field}><label className={label}>Long AVG</label><select value={longAverageMethod} onChange={(event) => setLongAverageMethod(event.target.value as "none" | "time-weighted" | "ratio-of-integrals")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="none">Hidden</option><option value="time-weighted">Session time-weighted AVG</option>{inputMode === "formula" && <option value="ratio-of-integrals">Session ratio of integrals</option>}</select></div>
        {(gaugeType === "history" || gaugeType === "histogram") && <div className={field}><label className={label}>Line history (seconds)</label><Input type="number" min="1" max="600" value={String(number(historyWindowMs, 30000) / 1000)} onChange={(event) => setHistoryWindowMs(String(number(event.target.value, 30) * 1000))} /></div>}
      </div>
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}>{gauge ? "Save changes" : "Add to profile"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
