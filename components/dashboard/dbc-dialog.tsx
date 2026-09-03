"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Database, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseDbc } from "@/lib/can/dbc";
import type { DbcDatabase } from "@/lib/can/types";

export function DbcDialog({ open, databases, onOpenChange, onImport, onDelete }: {
  open: boolean;
  databases: DbcDatabase[];
  onOpenChange: (open: boolean) => void;
  onImport: (database: DbcDatabase) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const database = parseDbc(await file.text(), file.name);
      await onImport(database);
      const signalCount = database.messages.reduce((total, message) => total + message.signals.length, 0);
      setStatus(`Imported ${database.messages.length} messages and ${signalCount} signals from ${file.name}.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "The DBC could not be imported."); }
    event.target.value = "";
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader><DialogTitle>DBC libraries</DialogTitle><DialogDescription>DBC files are parsed in this browser and retained locally. Gauges created from them remain self-contained in exported profiles.</DialogDescription></DialogHeader>
      <div className="space-y-2 py-2">
        {databases.map((database) => <div key={database.id} className="flex items-center gap-3 rounded-lg border bg-card p-3"><Database className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{database.name}</p><p className="text-[11px] text-muted-foreground">{database.messages.length.toLocaleString()} messages · {database.messages.reduce((total, message) => total + message.signals.length, 0).toLocaleString()} signals</p></div><Button size="icon-sm" variant="ghost" onClick={() => void onDelete(database.id)} aria-label={`Remove ${database.name}`}><Trash2 /></Button></div>)}
        {!databases.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No DBC libraries imported yet.</div>}
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
      <input ref={inputRef} type="file" accept=".dbc,text/plain" className="hidden" onChange={chooseFile} />
      <DialogFooter className="sm:justify-between"><Button variant="outline" onClick={() => inputRef.current?.click()}><FileUp /> Add DBC</Button><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
