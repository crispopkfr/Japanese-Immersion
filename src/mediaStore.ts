// Media storage utility for Anki audio and screenshot images

const MEDIA_CACHE: Record<string, string> = {};

let mediaDbPromise: Promise<IDBDatabase> | null = null;

function getMediaDb(): Promise<IDBDatabase> {
  if (mediaDbPromise) return mediaDbPromise;
  mediaDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open("subminer_media_db", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "filename" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction("media", "readonly");
        const store = tx.objectStore("media");
        const req = store.getAll();
        req.onsuccess = () => {
          if (req.result) {
            req.result.forEach((item: { filename: string; dataUrl: string | Blob }) => {
              if (item.filename && item.dataUrl) {
                if (typeof item.dataUrl === "string") {
                  MEDIA_CACHE[item.filename] = item.dataUrl;
                } else if (item.dataUrl instanceof Blob) {
                  MEDIA_CACHE[item.filename] = URL.createObjectURL(item.dataUrl);
                }
              }
            });
            window.dispatchEvent(new Event("site-background-updated"));
          }
        };
      } catch (e) {
        console.warn("Failed to load initial media cache from IndexedDB:", e);
      }
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  return mediaDbPromise;
}

// Pre-init IndexedDB cache on load
getMediaDb().catch(() => {});

export function saveMedia(filename: string, dataUrlOrBlob: string | Blob): void {
  const persist = (val: string | Blob) => {
    if (typeof val === "string") {
      MEDIA_CACHE[filename] = val;
      try {
        localStorage.setItem(`subminer_media_${filename}`, val);
      } catch (e) {
        // localStorage quota exceeded fallback to IndexedDB
      }
    } else {
      if (MEDIA_CACHE[filename] && MEDIA_CACHE[filename].startsWith("blob:")) {
        try {
          URL.revokeObjectURL(MEDIA_CACHE[filename]);
        } catch (e) {}
      }
      MEDIA_CACHE[filename] = URL.createObjectURL(val);
    }
    getMediaDb()
      .then((db) => {
        try {
          const tx = db.transaction("media", "readwrite");
          const store = tx.objectStore("media");
          store.put({ filename, dataUrl: val });
        } catch (err) {
          console.error("Failed to save media to IndexedDB:", err);
        }
      })
      .catch(() => {});
  };

  persist(dataUrlOrBlob);
}

export function getMedia(filename: string): string | undefined {
  if (MEDIA_CACHE[filename]) return MEDIA_CACHE[filename];
  try {
    const stored = localStorage.getItem(`subminer_media_${filename}`);
    if (stored) {
      MEDIA_CACHE[filename] = stored;
      return stored;
    }
  } catch (e) {}
  return undefined;
}

export async function getMediaAsync(filename: string): Promise<string | undefined> {
  const sync = getMedia(filename);
  if (sync) return sync;
  try {
    const db = await getMediaDb();
    return new Promise((resolve) => {
      const tx = db.transaction("media", "readonly");
      const store = tx.objectStore("media");
      const req = store.get(filename);
      req.onsuccess = () => {
        if (req.result && req.result.dataUrl) {
          let val: string;
          if (typeof req.result.dataUrl === "string") {
            val = req.result.dataUrl;
          } else if (req.result.dataUrl instanceof Blob) {
            val = URL.createObjectURL(req.result.dataUrl);
          } else {
            val = String(req.result.dataUrl);
          }
          MEDIA_CACHE[filename] = val;
          resolve(val);
        } else {
          resolve(undefined);
        }
      };
      req.onerror = () => resolve(undefined);
    });
  } catch (e) {
    return undefined;
  }
}

export function deleteMedia(filename: string): void {
  delete MEDIA_CACHE[filename];
  try {
    localStorage.removeItem(`subminer_media_${filename}`);
  } catch (e) {}
  getMediaDb()
    .then((db) => {
      try {
        const tx = db.transaction("media", "readwrite");
        const store = tx.objectStore("media");
        store.delete(filename);
      } catch (err) {}
    })
    .catch(() => {});
}

export function resolveMediaSrc(fieldValue: string | undefined): string | undefined {
  if (!fieldValue) return undefined;
  const trimmed = fieldValue.trim();

  // 1. Direct Data URL
  const dataUrlMatch = trimmed.match(/data:(image|audio)\/[^;"\s]+;base64,[^"\s\>\]]+/);
  if (dataUrlMatch) return dataUrlMatch[0];

  // 2. [sound:filename]
  const soundMatch = trimmed.match(/\[sound:([^\]]+)\]/);
  if (soundMatch) {
    const fn = soundMatch[1].trim();
    if (fn.startsWith("data:") || fn.startsWith("http://") || fn.startsWith("https://") || fn.startsWith("blob:")) return fn;
    return getMedia(fn);
  }

  // 3. <img src="filename"> or <audio src="filename">
  const srcMatch = trimmed.match(/src=["']([^"']+)["']/);
  if (srcMatch) {
    const src = srcMatch[1].trim();
    if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:")) return src;
    return getMedia(src);
  }

  // 4. Plain filename or URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("Immersion-") || trimmed.startsWith("jidoujisho-") || trimmed.endsWith(".mp3") || trimmed.endsWith(".jpg") || trimmed.endsWith(".png") || trimmed.endsWith(".3gp")) {
    return getMedia(trimmed);
  }

  return undefined;
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const parts = dataUrl.split(",");
    if (parts.length < 2) return null;
    const byteString = atob(parts[1]);
    const u8 = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      u8[i] = byteString.charCodeAt(i);
    }
    return u8;
  } catch (e) {
    console.error("Failed to convert data URL to Uint8Array:", e);
    return null;
  }
}

export async function fetchAndCacheMedia(filename: string, url: string): Promise<string | undefined> {
  const existing = getMedia(filename);
  if (existing) return existing;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        if (dataUrl) {
          saveMedia(filename, dataUrl);
          resolve(dataUrl);
        } else {
          resolve(undefined);
        }
      };
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Failed to fetch and cache media from URL:", url, err);
    return undefined;
  }
}

export async function getAllMediaAsync(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // 1. From MEDIA_CACHE
  for (const [k, v] of Object.entries(MEDIA_CACHE)) {
    if (typeof v === "string" && !v.startsWith("blob:")) {
      result[k] = v;
    }
  }

  // 2. From localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("subminer_media_")) {
        const fn = key.replace("subminer_media_", "");
        const val = localStorage.getItem(key);
        if (val && !result[fn]) {
          result[fn] = val;
        }
      }
    }
  } catch (e) {}

  // 3. From IndexedDB media store
  try {
    const db = await getMediaDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("media", "readonly");
      const store = tx.objectStore("media");
      const req = store.getAll();
      req.onsuccess = async () => {
        if (req.result) {
          for (const item of req.result) {
            if (item.filename && item.dataUrl) {
              if (typeof item.dataUrl === "string" && !item.dataUrl.startsWith("blob:")) {
                result[item.filename] = item.dataUrl;
              } else if (item.dataUrl instanceof Blob) {
                const dataUrl = await new Promise<string>((res) => {
                  const reader = new FileReader();
                  reader.onloadend = () => res((reader.result as string) || "");
                  reader.onerror = () => res("");
                  reader.readAsDataURL(item.dataUrl as Blob);
                });
                if (dataUrl) result[item.filename] = dataUrl;
              }
            }
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch (e) {}

  return result;
}
