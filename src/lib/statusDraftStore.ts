// IndexedDB helper para persistir rascunhos de Status (arquivos múltiplos)
// entre F5 ou navegação acidental.

const DB_NAME = "status_post_drafts";
const STORE = "files";
const DRAFT_KEY = "post_now_draft";

export type StatusDraftMeta = {
  type: "text" | "image" | "video" | "audio";
  text: string;
  bgColor: string;
  caption: string;
  selectedDeviceIds: string[];
  delaySeconds: number;
  fileNames: string[]; // ordem dos arquivos persistidos
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDraft(meta: StatusDraftMeta, files: File[]) {
  // grava metadados
  await tx("readwrite", (s) => s.put(meta, DRAFT_KEY));
  // grava cada arquivo com chave indexada
  // primeiro limpa antigos
  await clearDraftFiles();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    await tx("readwrite", (s) =>
      s.put(
        { name: f.name, type: f.type, blob: f },
        `file_${i}`,
      ),
    );
  }
}

export async function loadDraft(): Promise<{ meta: StatusDraftMeta | null; files: File[] }> {
  try {
    const meta = (await tx<StatusDraftMeta | undefined>("readonly", (s) => s.get(DRAFT_KEY))) || null;
    const files: File[] = [];
    if (meta && meta.fileNames?.length) {
      for (let i = 0; i < meta.fileNames.length; i++) {
        const rec = await tx<any>("readonly", (s) => s.get(`file_${i}`));
        if (rec?.blob) {
          files.push(new File([rec.blob], rec.name || meta.fileNames[i], { type: rec.type }));
        }
      }
    }
    return { meta, files };
  } catch {
    return { meta: null, files: [] };
  }
}

export async function clearDraftFiles() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result as IDBValidKey[]) {
        if (typeof k === "string" && k.startsWith("file_")) store.delete(k);
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clearDraft() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
