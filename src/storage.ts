import type { Calibration, Settings, Trip } from "./types";
let promise: Promise<IDBDatabase> | undefined;
function db() {
  return (promise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("sonomend", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("state");
      r.result.createObjectStore("trips", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      promise = undefined;
      reject(r.error);
    };
  }));
}
async function read<T>(
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function write(store: string, value: unknown, key?: IDBValidKey) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const loadCalibration = () => read<Calibration>("state", "calibration");
export const saveCalibration = (c: Calibration) =>
  write("state", c, "calibration");
export const loadSettings = () => read<Settings>("state", "settings");
export const saveSettings = (s: Settings) => write("state", s, "settings");
export async function saveTrip(t: Trip) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(["trips", "state"], "readwrite");
    tx.objectStore("trips").put(t);
    tx.objectStore("state").put(t.id, "latest");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function latestTrip() {
  const id = await read<string>("state", "latest");
  return id ? read<Trip>("trips", id) : undefined;
}
export async function tripHistory(): Promise<Trip[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction("trips").objectStore("trips").getAll();
    r.onsuccess = () =>
      resolve((r.result as Trip[]).sort((a, b) => b.startedAt - a.startedAt));
    r.onerror = () => reject(r.error);
  });
}
