import type { DbcDatabase, DbcMessage, DbcSignal, SignalSource } from "./types";

const DB_NAME = "candash";
const STORE_NAME = "dbc";

function cleanNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCanId(rawId: number) {
  return rawId & 0x1fffffff;
}

function dbcJ1939Address(canId: number) {
  const dataPage = (canId >>> 24) & 1, pf = (canId >>> 16) & 0xff, ps = (canId >>> 8) & 0xff;
  return { pgn: pf < 240 ? (dataPage << 16) | (pf << 8) : (dataPage << 16) | (pf << 8) | ps, sourceAddress: canId & 0xff };
}

export function parseDbc(text: string, fileName: string): DbcDatabase {
  const messages: DbcMessage[] = [];
  let current: DbcMessage | null = null;
  const messagePattern = /^BO_\s+(\d+)\s+([^:]+):\s+(\d+)\s+(\S+)/;
  const signalPattern = /^\s*SG_\s+([^\s:]+)(?:\s+[mM][^:]*)?\s*:\s*(\d+)\|(\d+)@(0|1)([+-])\s+\(([^,]+),([^\)]+)\)\s+\[([^|]*)\|([^\]]*)\]\s+"([^"]*)"\s*(.*)$/;

  for (const line of text.split(/\r?\n/)) {
    const messageMatch = line.match(messagePattern);
    if (messageMatch) {
      const canId = normalizeCanId(Number(messageMatch[1]));
      const info = dbcJ1939Address(canId);
      current = {
        canId,
        pgn: info.pgn,
        sourceAddress: info.sourceAddress === 0xfe || info.sourceAddress === 0xff ? null : info.sourceAddress,
        name: messageMatch[2].trim(),
        length: Number(messageMatch[3]),
        transmitter: messageMatch[4],
        signals: [],
      };
      messages.push(current);
      continue;
    }
    if (!current) continue;
    const signalMatch = line.match(signalPattern);
    if (!signalMatch) continue;
    const minimum = cleanNumber(signalMatch[8]);
    const maximum = cleanNumber(signalMatch[9]);
    const signal: DbcSignal = {
      name: signalMatch[1],
      startBit: Number(signalMatch[2]),
      length: Number(signalMatch[3]),
      byteOrder: signalMatch[4] === "1" ? "little" : "big",
      signed: signalMatch[5] === "-",
      scale: Number(signalMatch[6]),
      offset: Number(signalMatch[7]),
      unit: signalMatch[10],
      minimum,
      maximum,
      decimals: Math.abs(Number(signalMatch[6])) >= 1 ? 0 : 2,
      invalidPolicy: "j1939",
      receivers: signalMatch[11].split(",").map((value) => value.trim()).filter(Boolean),
    };
    current.signals.push(signal);
  }

  if (!messages.length) throw new Error("No DBC messages were found");
  return {
    id: `${fileName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    name: fileName,
    importedAt: Date.now(),
    messages,
  };
}

export function dbcMatches(databases: DbcDatabase[], pgn: number, sourceAddress?: number) {
  return databases.flatMap((database) => database.messages
    .filter((message) => message.length > 0 && message.pgn === pgn && (message.sourceAddress == null || sourceAddress == null || message.sourceAddress === sourceAddress))
    .map((message) => ({ database, message })));
}

export function dbcSignalSources(databases: DbcDatabase[], pgn?: number, sourceAddress?: number): SignalSource[] {
  return databases.flatMap((database) => database.messages
    .filter((message) => message.length > 0)
    .filter((message) => pgn == null || message.pgn === pgn)
    .filter((message) => sourceAddress == null || message.sourceAddress == null || message.sourceAddress === sourceAddress)
    .flatMap((message) => message.signals.map((signal) => ({
      sourceAddress: sourceAddress ?? message.sourceAddress,
      pgn: message.pgn,
      canId: message.canId,
      messageName: `${message.name} · ${database.name}`,
      signal: { ...signal },
    }))));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDbcDatabases(): Promise<DbcDatabase[]> {
  if (typeof indexedDB === "undefined") return [];
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as DbcDatabase[]).sort((a, b) => a.name.localeCompare(b.name)));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveDbcDatabase(value: DbcDatabase) {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function deleteDbcDatabase(id: string) {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
