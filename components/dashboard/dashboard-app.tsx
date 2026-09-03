"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Cable, CircleStop, Database, Download, FileUp, Gauge, Menu, Pause, Play, Plus, Radio, RotateCcw, Save, Settings2, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { decodeDm1, decodeSignal, parseCandump, parseJ1939Id, TransportProtocolAssembler } from "@/lib/can/j1939";
import { dbcSignalSources, deleteDbcDatabase, loadDbcDatabases, saveDbcDatabase } from "@/lib/can/dbc";
import { evaluateFormula, formulaRatioReferences, formulaReferences } from "@/lib/can/formula";
import { cloneProfile, DEFAULT_PROFILE } from "@/lib/can/profile";
import { DemoSource, LiveSource, ReplaySource } from "@/lib/can/sources";
import { newAverageState, newSmoothingState, smoothValue, updateLongAverage } from "@/lib/can/telemetry";
import type { CanFrame, DashboardProfile, DbcDatabase, DiagnosticFault, DiscoveryEntry, GaugeDefinition, GaugeHistoryPoint, GaugeReading } from "@/lib/can/types";
import { DbcDialog } from "./dbc-dialog";
import { DiscoveryView } from "./discovery-view";
import { FaultsView } from "./faults-view";
import { GaugeCard } from "./gauge-card";
import { GaugeDialog } from "./gauge-dialog";

const STORAGE_KEY = "candash.profiles.v1";
type View = "dashboard" | "discover" | "faults";
type SourceState = { mode: "off" | "demo" | "replay" | "live"; status: string; label: string };

function saveProfiles(profiles: DashboardProfile[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); } catch { /* storage may be disabled */ }
}

function safeProfile(value: unknown): value is DashboardProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<DashboardProfile>;
  return profile.schemaVersion === 1 && typeof profile.id === "string" && typeof profile.name === "string" && Array.isArray(profile.gauges);
}

export function DashboardApp() {
  const [view, setView] = useState<View>("dashboard");
  const [profiles, setProfiles] = useState<DashboardProfile[]>([cloneProfile(DEFAULT_PROFILE)]);
  const [activeProfileId, setActiveProfileId] = useState(DEFAULT_PROFILE.id);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? DEFAULT_PROFILE;
  const profileRef = useRef(activeProfile);
  const [readings, setReadings] = useState<Record<string, GaugeReading>>({});
  const readingsRef = useRef<Record<string, GaugeReading>>({});
  const [histories, setHistories] = useState<Record<string, GaugeHistoryPoint[]>>({});
  const historiesRef = useRef<Record<string, GaugeHistoryPoint[]>>({});
  const smoothingRef = useRef(new Map<string, ReturnType<typeof newSmoothingState>>());
  const averagesRef = useRef(new Map<string, ReturnType<typeof newAverageState>>());
  const [discovery, setDiscovery] = useState<DiscoveryEntry[]>([]);
  const discoveryRef = useRef(new Map<string, DiscoveryEntry>());
  const [faults, setFaults] = useState<DiagnosticFault[]>([]);
  const faultsRef = useRef(new Map<string, DiagnosticFault>());
  const transportRef = useRef(new TransportProtocolAssembler());
  const [now, setNow] = useState(0);
  const [editing, setEditing] = useState(false);
  const [sourceState, setSourceState] = useState<SourceState>({ mode: "off", status: "idle", label: "No source" });
  const [sourceOpen, setSourceOpen] = useState(false);
  const [gaugeOpen, setGaugeOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState<DiscoveryEntry | undefined>();
  const [selectedGaugeId, setSelectedGaugeId] = useState<string | undefined>();
  const selectedGauge = activeProfile.gauges.find((gauge) => gauge.id === selectedGaugeId);
  const [dbcOpen, setDbcOpen] = useState(false);
  const [databases, setDatabases] = useState<DbcDatabase[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [filter, setFilter] = useState("");
  const [frameStats, setFrameStats] = useState({ frames: 0, fps: 0, startedAt: 0 });
  const frameCountRef = useRef(0);
  const sessionStartRef = useRef(0);
  const renderPendingRef = useRef(false);
  const pulseRef = useRef(0);

  const demoRef = useRef(new DemoSource());
  const replayRef = useRef(new ReplaySource());
  const liveRef = useRef(new LiveSource());
  const [replayFrames, setReplayFrames] = useState<CanFrame[]>([]);
  const [replayFile, setReplayFile] = useState("");
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayLoop, setReplayLoop] = useState(false);
  const [replayPaused, setReplayPaused] = useState(false);
  const [replayProgress, setReplayProgress] = useState({ current: 0, total: 0 });
  const [liveUrl, setLiveUrl] = useState("ws://127.0.0.1:8765/ws");
  const replayInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const replaySessionRef = useRef(0);

  useEffect(() => { profileRef.current = activeProfile; }, [activeProfile]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setNow(performance.now());
      setLiveUrl(`ws://${location.hostname || "127.0.0.1"}:8765/ws`);
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (Array.isArray(stored) && stored.length && stored.every(safeProfile)) { setProfiles(stored); setActiveProfileId(stored[0].id); }
      } catch { /* retain built-in profile */ }
      void loadDbcDatabases().then(setDatabases).catch(() => { /* IndexedDB may be disabled */ });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const instant = performance.now();
      setNow(instant);
      const elapsed = Math.max(0.001, (instant - sessionStartRef.current) / 1000);
      setFrameStats({ frames: frameCountRef.current, fps: sessionStartRef.current ? frameCountRef.current / elapsed : 0, startedAt: sessionStartRef.current });
      setDiscovery(Array.from(discoveryRef.current.values()).map((entry) => ({ ...entry, rate: entry.count / Math.max(0.001, (entry.lastSeen - entry.firstSeen) / 1000) })).sort((a, b) => b.count - a.count));
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const scheduleReadingRender = useCallback(() => {
    if (renderPendingRef.current) return;
    renderPendingRef.current = true;
    requestAnimationFrame(() => { renderPendingRef.current = false; setReadings({ ...readingsRef.current }); setHistories({ ...historiesRef.current }); });
  }, []);

  const acceptGaugeReading = useCallback((gauge: GaugeDefinition, rawValue: number, instant: number, sourceIndex: number, dependencyPulse?: string, ratio?: [number, number]) => {
    let smoothing = smoothingRef.current.get(gauge.id);
    if (!smoothing) { smoothing = newSmoothingState(); smoothingRef.current.set(gauge.id, smoothing); }
    let average = averagesRef.current.get(gauge.id);
    if (!average) { average = newAverageState(); averagesRef.current.set(gauge.id, average); }
    const value = smoothValue(rawValue, instant, gauge.smoothing, smoothing);
    const longAverage = updateLongAverage(rawValue, instant, gauge.longAverage, average, gauge.staleAfterMs, ratio);
    readingsRef.current[gauge.id] = { value, rawValue, longAverage, updatedAt: instant, sourceIndex, pulse: ++pulseRef.current, dependencyPulse };
    if (gauge.gaugeType !== "history" && gauge.gaugeType !== "histogram") return;
    const windowMs = Math.max(1000, gauge.historyWindowMs ?? 30000);
    const previous = historiesRef.current[gauge.id] ?? [];
    const last = previous.at(-1);
    const appended = !last || instant - last.timestamp >= 100
      ? [...previous, { value, timestamp: instant }]
      : [...previous.slice(0, -1), { value, timestamp: instant }];
    const points = appended.length > 1 ? appended.filter((point, index) => index === appended.length - 1 || point.timestamp >= instant - windowMs) : appended;
    historiesRef.current = { ...historiesRef.current, [gauge.id]: points };
  }, []);

  const registerFaults = useCallback((next: DiagnosticFault[]) => {
    if (!next.length) return;
    next.forEach((fault) => faultsRef.current.set(fault.key, fault));
    setFaults(Array.from(faultsRef.current.values()).sort((a, b) => a.sourceAddress - b.sourceAddress || a.spn - b.spn));
  }, []);

  const handleFrame = useCallback((frame: CanFrame) => {
    const instant = performance.now();
    frameCountRef.current += 1;
    const info = parseJ1939Id(frame.id);
    const key = `${info.sourceAddress}-${info.pgn}`;
    const previousEntry = discoveryRef.current.get(key);
    discoveryRef.current.set(key, {
      key, pgn: info.pgn, sourceAddress: info.sourceAddress, destinationAddress: info.destinationAddress,
      count: (previousEntry?.count ?? 0) + 1, firstSeen: previousEntry?.firstSeen ?? instant,
      lastSeen: instant, lastData: frame.data, rate: previousEntry?.rate ?? 0,
    });

    if (info.pgn === 0xfeca) registerFaults(decodeDm1(frame.data, info.sourceAddress, instant));
    const assembled = transportRef.current.ingest({ ...frame, timestamp: instant });
    if (assembled?.pgn === 0xfeca) registerFaults(decodeDm1(assembled.data, assembled.sourceAddress, instant));

    for (const gauge of profileRef.current.gauges) {
      gauge.sources.forEach((source, sourceIndex) => {
        if (source.pgn !== info.pgn || source.sourceAddress != null && source.sourceAddress !== info.sourceAddress) return;
        const decoded = decodeSignal(frame.data, source.signal);
        if (decoded == null) return;
        const value = gauge.conversion ? decoded * gauge.conversion.scale + gauge.conversion.offset : decoded;
        const existing = readingsRef.current[gauge.id];
        if (sourceIndex > 0 && existing?.sourceIndex === 0 && instant - existing.updatedAt < gauge.staleAfterMs) return;
        acceptGaugeReading(gauge, value, instant, sourceIndex);
      });
    }
    for (const gauge of profileRef.current.gauges.filter((item) => item.formula)) {
      const dependencies = formulaReferences(gauge.formula!.expression);
      const dependencyPulse = dependencies.map((id) => readingsRef.current[id]?.pulse ?? 0).join(":");
      if (!dependencies.length || dependencies.some((id) => !readingsRef.current[id]) || readingsRef.current[gauge.id]?.dependencyPulse === dependencyPulse) continue;
      const value = evaluateFormula(gauge.formula!.expression, readingsRef.current);
      if (value == null || value < gauge.minimum || gauge.maximum != null && value > gauge.maximum) continue;
      const updatedAt = Math.max(...dependencies.map((id) => readingsRef.current[id].updatedAt));
      const ratioReferences = gauge.longAverage?.method === "ratio-of-integrals" ? formulaRatioReferences(gauge.formula!.expression) : null;
      const ratio = ratioReferences ? ratioReferences.map((id) => readingsRef.current[id].rawValue ?? readingsRef.current[id].value) as [number, number] : undefined;
      acceptGaugeReading(gauge, value, updatedAt, 0, dependencyPulse, ratio);
    }
    scheduleReadingRender();
  }, [acceptGaugeReading, registerFaults, scheduleReadingRender]);

  function clearSession() {
    frameCountRef.current = 0; sessionStartRef.current = performance.now();
    readingsRef.current = {}; historiesRef.current = {}; smoothingRef.current.clear(); averagesRef.current.clear(); discoveryRef.current.clear(); faultsRef.current.clear(); transportRef.current = new TransportProtocolAssembler();
    setReadings({}); setHistories({}); setDiscovery([]); setFaults([]); setReplayProgress({ current: 0, total: replayFrames.length });
  }

  function stopSources(updateState = true) {
    replaySessionRef.current += 1; demoRef.current.stop(); replayRef.current.stop(); liveRef.current.disconnect(); setReplayPaused(false);
    if (updateState) setSourceState({ mode: "off", status: "idle", label: "No source" });
  }

  useEffect(() => () => stopSources(false), []);

  function startDemo() {
    stopSources(false); clearSession(); demoRef.current.start(handleFrame);
    setSourceState({ mode: "demo", status: "running", label: "Demo generator" }); setSourceOpen(false);
  }

  function startReplay(startIndex = 0) {
    if (!replayFrames.length) return;
    stopSources(false); clearSession(); setReplayPaused(false);
    setReplayProgress({ current: startIndex, total: replayFrames.length });
    setSourceState({ mode: "replay", status: "running", label: replayFile || "candump replay" }); setSourceOpen(false);
    const session = ++replaySessionRef.current;
    void replayRef.current.start(replayFrames, replaySpeed, replayLoop, handleFrame, (current, total) => setReplayProgress({ current, total }), startIndex).then(() => {
      if (session === replaySessionRef.current) setSourceState((state) => state.mode === "replay" ? { ...state, status: "finished" } : state);
    });
  }

  function seekReplay(index: number) {
    if (!replayFrames.length) return;
    startReplay(Math.max(0, Math.min(replayFrames.length - 1, index)));
  }

  function toggleReplayPause() {
    const paused = !replayPaused; setReplayPaused(paused); replayRef.current.setPaused(paused);
    setSourceState((state) => state.mode === "replay" ? { ...state, status: paused ? "paused" : "running" } : state);
  }

  function connectLive() {
    stopSources(false); clearSession();
    liveRef.current.connect(liveUrl, handleFrame, (status) => setSourceState({ mode: "live", status, label: liveUrl }));
    setSourceOpen(false);
  }

  async function chooseReplay(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    const frames = parseCandump(await file.text()); setReplayFrames(frames); setReplayFile(file.name); setReplayProgress({ current: 0, total: frames.length });
    event.target.value = "";
  }

  function mutateActive(mutator: (profile: DashboardProfile) => void) {
    setProfiles((current) => {
      const next = current.map((profile) => {
        if (profile.id !== activeProfile.id) return profile;
        const copy = cloneProfile(profile); mutator(copy); profileRef.current = copy; return copy;
      });
      saveProfiles(next); return next;
    });
  }

  function saveGauge(gauge: GaugeDefinition) {
    mutateActive((profile) => {
      const index = profile.gauges.findIndex((item) => item.id === gauge.id);
      if (index < 0) profile.gauges.push(gauge); else profile.gauges[index] = gauge;
    });
    delete readingsRef.current[gauge.id]; delete historiesRef.current[gauge.id]; smoothingRef.current.delete(gauge.id); averagesRef.current.delete(gauge.id); setReadings({ ...readingsRef.current }); setHistories({ ...historiesRef.current }); setSelectedGaugeId(undefined); setView("dashboard");
  }
  function removeGauge(id: string) { mutateActive((profile) => { profile.gauges = profile.gauges.filter((gauge) => gauge.id !== id); }); }
  function moveGauge(index: number, direction: -1 | 1) { mutateActive((profile) => { const target = Math.max(0, Math.min(profile.gauges.length - 1, index + direction)); const [item] = profile.gauges.splice(index, 1); profile.gauges.splice(target, 0, item); }); }

  function duplicateProfile() {
    const name = profileName.trim(); if (!name) return;
    const copy = cloneProfile(activeProfile); copy.id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`; copy.name = name;
    const next = [...profiles, copy]; setProfiles(next); saveProfiles(next); setActiveProfileId(copy.id); setProfileOpen(false); setProfileName("");
  }

  function resetProfile() {
    mutateActive((profile) => { const reset = cloneProfile(DEFAULT_PROFILE); profile.gauges = reset.gauges; profile.network = reset.network; profile.updateIndicator = reset.updateIndicator; });
  }

  function exportProfile() {
    const blob = new Blob([JSON.stringify(activeProfile, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = `${activeProfile.id}.json`; link.click(); URL.revokeObjectURL(href);
  }

  async function importProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const profile: unknown = JSON.parse(await file.text()); if (!safeProfile(profile)) return;
      const copy = cloneProfile(profile); if (profiles.some((item) => item.id === copy.id)) copy.id = `${copy.id}-${Date.now()}`;
      const next = [...profiles, copy]; setProfiles(next); saveProfiles(next); setActiveProfileId(copy.id);
    } catch { /* invalid profiles are ignored */ }
    event.target.value = "";
  }

  async function importDbc(database: DbcDatabase) {
    await saveDbcDatabase(database); setDatabases((current) => [...current, database].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function removeDbc(id: string) {
    await deleteDbcDatabase(id); setDatabases((current) => current.filter((database) => database.id !== id));
  }

  const nodeCount = useMemo(() => new Set(discovery.map((entry) => entry.sourceAddress)).size, [discovery]);
  const replayPercent = replayProgress.total ? Math.round(Math.min(replayProgress.current + 1, replayProgress.total) / replayProgress.total * 100) : 0;
  const replayTime = replayFrames[replayProgress.current]?.timestamp ?? 0;
  const replayDuration = replayFrames.at(-1)?.timestamp ?? 0;
  const sourceActive = sourceState.mode !== "off" && !["error", "disconnected"].includes(sourceState.status);

  return (
    <main className="instrument-grid min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-[#07100f]/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><Gauge className="size-5" /></div><div><div className="flex items-baseline gap-1.5"><span className="font-semibold tracking-tight">CANdash</span><span className="font-mono text-[9px] uppercase tracking-[.16em] text-primary">J1939</span></div><p className="hidden text-[10px] text-muted-foreground sm:block">Local-first vehicle telemetry</p></div></div>
          <nav className="ml-3 hidden items-center gap-1 rounded-lg border bg-card/60 p-1 md:flex" aria-label="Main views">
            {([ ["dashboard", Gauge, "Dashboard"], ["discover", Radio, "Discover"], ["faults", ShieldAlert, "Faults"] ] as const).map(([id, Icon, label]) => <button key={id} onClick={() => setView(id)} className={`flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition ${view === id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><Icon className="size-3.5" />{label}{id === "faults" && faults.length > 0 && <span className="rounded-full bg-red-400/15 px-1.5 text-[9px] text-red-300">{faults.length}</span>}</button>)}
          </nav>
          <div className="ml-auto hidden items-center gap-5 text-right xl:flex"><div><p className="font-mono text-sm font-semibold text-primary">{frameStats.fps.toFixed(0)}</p><p className="text-[9px] uppercase tracking-[.13em] text-muted-foreground">frames/s</p></div><div><p className="font-mono text-sm font-semibold">{nodeCount}</p><p className="text-[9px] uppercase tracking-[.13em] text-muted-foreground">ECUs</p></div><div><p className="font-mono text-sm font-semibold">{frameStats.frames.toLocaleString()}</p><p className="text-[9px] uppercase tracking-[.13em] text-muted-foreground">frames</p></div></div>
          <Button variant="outline" className="ml-auto xl:ml-3" onClick={() => setSourceOpen(true)}><span className={`size-2 rounded-full ${sourceActive ? "bg-primary shadow-[0_0_8px_#2ee59d]" : "bg-muted-foreground/45"}`} /><span className="max-w-32 truncate">{sourceState.label}</span></Button>
          <Button size="icon" variant="ghost" className="md:hidden" aria-label="Cycle view" onClick={() => setView(view === "dashboard" ? "discover" : view === "discover" ? "faults" : "dashboard")}><Menu /></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="mb-1 font-mono text-[10px] uppercase tracking-[.16em] text-primary">{view === "dashboard" ? "Instrument panel" : view === "discover" ? "Network inventory" : "Diagnostics"}</p><h1 className="text-2xl font-semibold tracking-tight">{view === "dashboard" ? activeProfile.name : view === "discover" ? "Observed ECUs & PGNs" : "Active diagnostic messages"}</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{view === "dashboard" ? activeProfile.description : view === "discover" ? "Listening is passive. Add any observed source-address/PGN pair to the active profile." : "Monitor DM1 traffic without transmitting onto the vehicle network."}</p></div>
          {view === "dashboard" && <div className="flex flex-wrap items-center gap-2"><select value={activeProfile.id} onChange={(e) => { setActiveProfileId(e.target.value); readingsRef.current = {}; historiesRef.current = {}; smoothingRef.current.clear(); averagesRef.current.clear(); setReadings({}); setHistories({}); }} className="h-9 max-w-64 rounded-md border bg-card px-3 text-sm">{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><Button size="sm" variant="outline" onClick={() => { setProfileName(`${activeProfile.name} copy`); setProfileOpen(true); }}><Save /> Save as</Button><Button size="sm" variant="outline" onClick={() => setDbcOpen(true)}><Database /> DBC <span className="text-muted-foreground">{databases.length}</span></Button><Button size="sm" variant="outline" onClick={() => { setSelectedPair(undefined); setSelectedGaugeId(undefined); setGaugeOpen(true); }}><Plus /> Gauge</Button><div className="flex h-9 items-center gap-2 rounded-md border bg-card px-3"><Settings2 className="size-3.5 text-muted-foreground" /><span className="text-xs">Edit</span><Switch size="sm" checked={editing} onCheckedChange={setEditing} /></div></div>}
        </div>

        {view === "dashboard" && (
          <section className="grid auto-rows-min grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {activeProfile.gauges.map((gauge, index) => <GaugeCard key={gauge.id} gauge={gauge} reading={readings[gauge.id]} history={histories[gauge.id] ?? []} now={now} editing={editing} onMove={(direction) => moveGauge(index, direction)} onEdit={() => { setSelectedPair(undefined); setSelectedGaugeId(gauge.id); setGaugeOpen(true); }} onRemove={() => removeGauge(gauge.id)} />)}
            {!activeProfile.gauges.length && <button onClick={() => setGaugeOpen(true)} className="col-span-full rounded-xl border border-dashed p-16 text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"><Plus className="mx-auto mb-3 size-6" />Add the first gauge to this profile</button>}
          </section>
        )}
        {view === "discover" && <DiscoveryView entries={discovery} databases={databases} filter={filter} onFilter={setFilter} onAdd={(entry) => { setSelectedGaugeId(undefined); setSelectedPair(entry); setGaugeOpen(true); }} />}
        {view === "faults" && <FaultsView faults={faults} />}

        {sourceState.mode === "replay" && replayFrames.length > 0 && <section className="mt-4 rounded-xl border bg-card/80 p-4" aria-label="Replay timeline"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-medium">{replayFile}</p><p className="font-mono text-[10px] text-muted-foreground">{(replayTime / 1000).toFixed(1)}s / {(replayDuration / 1000).toFixed(1)}s · frame {Math.min(replayProgress.current + 1, replayFrames.length).toLocaleString()} of {replayFrames.length.toLocaleString()}</p></div><Button size="sm" variant="outline" onClick={toggleReplayPause}>{replayPaused ? <Play /> : <Pause />}{replayPaused ? "Resume" : "Pause"}</Button></div><input type="range" min="0" max={Math.max(0, replayFrames.length - 1)} value={Math.min(replayProgress.current, Math.max(0, replayFrames.length - 1))} onPointerDown={() => { replayRef.current.setPaused(true); setReplayPaused(true); setSourceState((state) => ({ ...state, status: "paused" })); }} onChange={(event) => setReplayProgress({ current: Number(event.target.value), total: replayFrames.length })} onPointerUp={(event) => seekReplay(Number(event.currentTarget.value))} onKeyUp={(event) => seekReplay(Number(event.currentTarget.value))} className="w-full accent-primary" aria-label="Replay position" /></section>}

        <footer className="mt-6 flex flex-col gap-3 border-t py-4 text-[10px] uppercase tracking-[.1em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><span>Source: <b className="font-medium text-foreground">{sourceState.mode} / {sourceState.status}</b></span><span>Bitrate: <b className="font-medium text-foreground">{activeProfile.network.bitrate / 1000} kbit/s</b></span><span className="text-primary">Listen-only default</span></div><div>{sourceState.mode === "replay" ? `${replayPercent}% · ${Math.min(replayProgress.current + 1, replayProgress.total).toLocaleString()}/${replayProgress.total.toLocaleString()} frames` : `Profile ${activeProfile.schemaVersion}.0 · ${activeProfile.gauges.length} gauges`}</div></footer>
      </div>

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Choose a data source</DialogTitle><DialogDescription>Every source feeds the same discovery, decoding, gauges, and fault pipeline.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-3">
            <button onClick={startDemo} className="rounded-xl border bg-card p-4 text-left hover:border-primary/50"><Activity className="mb-5 size-5 text-primary" /><p className="font-medium">Demo</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Synthetic Volare-like values. No files or hardware.</p></button>
            <button onClick={() => replayInputRef.current?.click()} className="rounded-xl border bg-card p-4 text-left hover:border-primary/50"><Upload className="mb-5 size-5 text-primary" /><p className="font-medium">Replay</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Load a candump <code>-L</code> log in the browser.</p></button>
            <button onClick={connectLive} className="rounded-xl border bg-card p-4 text-left hover:border-primary/50"><Cable className="mb-5 size-5 text-primary" /><p className="font-medium">Live CAN</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Connect to the local read-only SocketCAN bridge.</p></button>
          </div>
          <input ref={replayInputRef} type="file" accept=".log,.txt" className="hidden" onChange={chooseReplay} />
          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div><div className="flex items-center justify-between"><p className="text-xs font-medium">Replay file</p><span className="font-mono text-[10px] text-muted-foreground">{replayFrames.length.toLocaleString()} frames</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{replayFile || "No candump log selected"}</p></div>
            <div className="grid grid-cols-[1fr_auto] gap-3"><select value={replaySpeed} onChange={(e) => setReplaySpeed(Number(e.target.value))} className="h-9 rounded-md border bg-background px-3 text-sm"><option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>Realtime 1×</option><option value={2}>2×</option><option value={4}>4×</option><option value={10}>10×</option><option value={50}>50×</option></select><label className="flex items-center gap-2 rounded-md border px-3 text-xs"><Switch size="sm" checked={replayLoop} onCheckedChange={setReplayLoop} /> Loop</label></div>
            <Button className="w-full" disabled={!replayFrames.length} onClick={() => startReplay()}><Play /> Start replay</Button>
          </div>
          <div className="space-y-2"><label className="text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Live bridge WebSocket</label><div className="flex gap-2"><Input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} /><Button variant="outline" onClick={connectLive}>Connect</Button></div><p className="text-[11px] leading-5 text-muted-foreground">The bridge only receives frames. Configure <code>can0</code> as listen-only before starting it.</p></div>
          <DialogFooter><div className="mr-auto flex gap-2">{sourceState.mode === "replay" && <Button variant="outline" onClick={toggleReplayPause}>{replayPaused ? <Play /> : <Pause />}{replayPaused ? "Resume" : "Pause"}</Button>}<Button variant="outline" onClick={() => { stopSources(); setSourceOpen(false); }}><CircleStop /> Stop</Button></div><Button variant="ghost" onClick={() => setSourceOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <GaugeDialog open={gaugeOpen} entry={selectedPair} gauge={selectedGauge} dbcSources={dbcSignalSources(databases, selectedPair?.pgn, selectedPair?.sourceAddress)} profileGauges={activeProfile.gauges} onOpenChange={(open) => { setGaugeOpen(open); if (!open) { setSelectedPair(undefined); setSelectedGaugeId(undefined); } }} onSave={saveGauge} />
      <DbcDialog open={dbcOpen} databases={databases} onOpenChange={setDbcOpen} onImport={importDbc} onDelete={removeDbc} />

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent><DialogHeader><DialogTitle>Save profile as</DialogTitle><DialogDescription>Create an independent copy of the current source/PGN pairs, gauges, and layout.</DialogDescription></DialogHeader><Input value={profileName} onChange={(e) => setProfileName(e.target.value)} autoFocus /><DialogFooter className="sm:justify-between"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={exportProfile}><Download /> Export</Button><Button size="sm" variant="ghost" onClick={() => profileInputRef.current?.click()}><FileUp /> Import</Button><Button size="sm" variant="ghost" onClick={resetProfile}><RotateCcw /> Reset</Button></div><div className="flex gap-2"><Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button><Button onClick={duplicateProfile}>Save copy</Button></div></DialogFooter></DialogContent></Dialog>
      <input ref={profileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importProfile} />
    </main>
  );
}
