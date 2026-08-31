"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KNOWN_SIGNAL_SOURCES } from "@/lib/can/profile";
import type { ByteOrder, DiscoveryEntry, GaugeDefinition, GaugeType, SignalSource } from "@/lib/can/types";

const number = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const parseAddress = (value: string) => value.trim() === "" ? null : Number.parseInt(value.replace(/^0x/i, ""), 16);
const parsePgn = (value: string) => value.trim().toLowerCase().startsWith("0x") ? Number.parseInt(value.slice(2), 16) : Number(value);

export function GaugeDialog({ open, entry, onOpenChange, onAdd }: { open: boolean; entry?: DiscoveryEntry; onOpenChange: (open: boolean) => void; onAdd: (gauge: GaugeDefinition) => void }) {
  const [title, setTitle] = useState("Custom signal");
  const [gaugeType, setGaugeType] = useState<GaugeType>("numeric");
  const [sa, setSa] = useState("00");
  const [pgn, setPgn] = useState("65265");
  const [knownIndex, setKnownIndex] = useState("custom");
  const [signalName, setSignalName] = useState("Signal");
  const [startBit, setStartBit] = useState("0");
  const [length, setLength] = useState("8");
  const [byteOrder, setByteOrder] = useState<ByteOrder>("little");
  const [signed, setSigned] = useState(false);
  const [invalidPolicy, setInvalidPolicy] = useState<"j1939" | "none">("j1939");
  const [scale, setScale] = useState("1");
  const [offset, setOffset] = useState("0");
  const [unit, setUnit] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [maximum, setMaximum] = useState("100");

  const candidates = useMemo(() => KNOWN_SIGNAL_SOURCES.filter((source) => {
    if (!entry) return true;
    return source.pgn === entry.pgn && (source.sourceAddress === entry.sourceAddress || source.sourceAddress == null);
  }), [entry]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSa(entry ? entry.sourceAddress.toString(16).padStart(2, "0").toUpperCase() : "00");
      setPgn(entry ? String(entry.pgn) : "65265");
      const match = candidates[0];
      if (match) applyKnown(match, "0");
      else { setKnownIndex("custom"); setTitle("Custom signal"); setSignalName("Signal"); setGaugeType("numeric"); }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.key]);

  function applyKnown(source: typeof KNOWN_SIGNAL_SOURCES[number], index: string) {
    setKnownIndex(index); setTitle(source.title); setGaugeType(source.suggestedGaugeType);
    setSignalName(source.signal.name); setStartBit(String(source.signal.startBit)); setLength(String(source.signal.length));
    setByteOrder(source.signal.byteOrder); setSigned(source.signal.signed); setInvalidPolicy(source.signal.invalidPolicy ?? "j1939");
    setScale(String(source.signal.scale)); setOffset(String(source.signal.offset)); setUnit(source.signal.unit);
    setMinimum(String(source.suggestedMinimum)); setMaximum(String(source.suggestedMaximum ?? source.signal.maximum ?? 100));
    setSa(source.sourceAddress == null ? "" : source.sourceAddress.toString(16).padStart(2, "0").toUpperCase()); setPgn(String(source.pgn));
  }

  function submit() {
    const parsedPgn = parsePgn(pgn), parsedSa = parseAddress(sa), bits = number(length, 8), bit = number(startBit);
    if (!title.trim() || !Number.isInteger(parsedPgn) || parsedPgn < 0 || parsedPgn > 0x3ffff || parsedSa != null && (parsedSa < 0 || parsedSa > 0xff) || bit < 0 || bit > 63 || bits < 1 || bits > 32 || bit + bits > 64) return;
    const source: SignalSource = {
      sourceAddress: parsedSa, pgn: parsedPgn, messageName: knownIndex === "custom" ? "CUSTOM" : candidates[Number(knownIndex)]?.messageName,
      signal: { name: signalName.trim() || "Signal", startBit: bit, length: bits, byteOrder, signed, scale: number(scale, 1), offset: number(offset), unit: unit.trim(), minimum: number(minimum), maximum: number(maximum, 100), decimals: 1, invalidPolicy },
    };
    onAdd({ id: `${signalName || "signal"}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title: title.trim(), gaugeType, minimum: number(minimum), maximum: number(maximum, 100), staleAfterMs: 3000, sources: [source] });
    onOpenChange(false);
  }

  const field = "space-y-1.5";
  const label = "text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Add a gauge</DialogTitle><DialogDescription>Choose an observed pair or enter a custom J1939 signal definition. Start bits follow DBC numbering.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className={`${field} sm:col-span-2`}><label className={label}>Known definition</label><select value={knownIndex} onChange={(e) => { const value = e.target.value; if (value === "custom") setKnownIndex(value); else applyKnown(candidates[Number(value)], value); }} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="custom">Custom signal</option>{candidates.map((source, index) => <option key={`${source.pgn}-${source.sourceAddress}-${source.signal.name}`} value={String(index)}>{source.messageName}.{source.signal.name} — SA {source.sourceAddress?.toString(16).padStart(2, "0").toUpperCase()} / PGN 0x{source.pgn.toString(16).toUpperCase()}</option>)}</select></div>
          <div className={field}><label className={label}>Gauge title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className={field}><label className={label}>Gauge type</label><select value={gaugeType} onChange={(e) => setGaugeType(e.target.value as GaugeType)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{["speedometer","tachometer","radial","bar","numeric","odometer"].map((value) => <option key={value}>{value}</option>)}</select></div>
          <div className={field}><label className={label}>Source address (hex, blank = any)</label><Input value={sa} onChange={(e) => setSa(e.target.value)} /></div>
          <div className={field}><label className={label}>PGN (decimal or 0x…)</label><Input value={pgn} onChange={(e) => setPgn(e.target.value)} /></div>
          <div className={field}><label className={label}>Signal name</label><Input value={signalName} onChange={(e) => setSignalName(e.target.value)} /></div>
          <div className={field}><label className={label}>Unit</label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2"><div className={field}><label className={label}>Start bit</label><Input type="number" value={startBit} onChange={(e) => setStartBit(e.target.value)} /></div><div className={field}><label className={label}>Length (1–32)</label><Input type="number" value={length} onChange={(e) => setLength(e.target.value)} /></div></div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2"><div className={field}><label className={label}>Byte order</label><select value={byteOrder} onChange={(e) => setByteOrder(e.target.value as ByteOrder)} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="little">Intel / little</option><option value="big">Motorola / big</option></select></div><div className={field}><label className={label}>Signedness</label><select value={signed ? "signed" : "unsigned"} onChange={(e) => setSigned(e.target.value === "signed")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="unsigned">Unsigned</option><option value="signed">Signed</option></select></div><div className={field}><label className={label}>Invalid values</label><select value={invalidPolicy} onChange={(e) => setInvalidPolicy(e.target.value as "j1939" | "none")} className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="j1939">J1939 filter</option><option value="none">Keep raw range</option></select></div></div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2"><div className={field}><label className={label}>Scale</label><Input type="number" step="any" value={scale} onChange={(e) => setScale(e.target.value)} /></div><div className={field}><label className={label}>Offset</label><Input type="number" step="any" value={offset} onChange={(e) => setOffset(e.target.value)} /></div></div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2"><div className={field}><label className={label}>Gauge minimum</label><Input type="number" step="any" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></div><div className={field}><label className={label}>Gauge maximum</label><Input type="number" step="any" value={maximum} onChange={(e) => setMaximum(e.target.value)} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}>Add to profile</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
