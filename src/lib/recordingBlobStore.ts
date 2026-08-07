// The session recording is a multi-MB video Blob. It lives in memory for the
// active session, and is mirrored into IndexedDB so the MP4 download on
// /report2 survives a page refresh (sessionStorage/localStorage can't hold a
// Blob). It's a single-key store: overwritten on each new session and deleted
// by setRecordingBlob(null) on re-practice / exit, so it never accumulates.

let _blob: Blob | null = null;

const DB_NAME = "stage-ready";
const STORE_NAME = "recording";
const KEY = "current";

function idbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE_NAME)) {
      req.result.createObjectStore(STORE_NAME);
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  return promise;
}

async function idbWrite(blob: Blob | null): Promise<void> {
  const db = await openDb();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (blob) store.put(blob, KEY);
    else store.delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    await promise;
  } finally {
    db.close();
  }
}

async function idbRead(): Promise<Blob | null> {
  const db = await openDb();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<Blob | null>();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
    return await promise;
  } finally {
    db.close();
  }
}

export function setRecordingBlob(blob: Blob | null): void {
  _blob = blob;
  if (!idbAvailable()) return;
  // Fire-and-forget: persistence failures must never break the session flow.
  void idbWrite(blob).catch(() => {});
}

export function getRecordingBlob(): Blob | null {
  return _blob;
}

// Restore the recording from IndexedDB after a refresh. Returns the in-memory
// blob when present, otherwise reads it back from IndexedDB (and caches it).
export async function loadRecordingBlob(): Promise<Blob | null> {
  if (_blob) return _blob;
  if (!idbAvailable()) return null;
  try {
    _blob = await idbRead();
  } catch {
    _blob = null;
  }
  return _blob;
}
