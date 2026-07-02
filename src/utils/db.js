// Database helper for IndexedDB to bypass the 5MB localStorage limit
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("SimAnkiDB", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("store")) {
        db.createObjectStore("store");
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getVal(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("store", "readonly");
      const req = tx.objectStore("store").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error("IndexedDB getVal failed:", e);
    return null;
  }
}

export async function setVal(key, val) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("store", "readwrite");
      const req = tx.objectStore("store").put(val, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error("IndexedDB setVal failed:", e);
  }
}
