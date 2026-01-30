const DB_NAME = 'RegexWizardAudioDB';
const STORE_NAME = 'playlist';
const DB_VERSION = 1;

export interface TrackMetadata {
  id: string;
  name: string;
}

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const addTrack = async (file: File): Promise<TrackMetadata> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const track = { id, name: file.name, blob: file, type: file.type };
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(track);
    request.onsuccess = () => resolve({ id, name: file.name });
    request.onerror = () => reject(request.error);
  });
};

export const getPlaylistMetadata = async (): Promise<TrackMetadata[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const tracks: TrackMetadata[] = [];
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        tracks.push({ id: cursor.value.id, name: cursor.value.name });
        cursor.continue();
      } else {
        resolve(tracks);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const getTrackBlob = async (id: string): Promise<Blob | null> => {
   const db = await initDB();
   return new Promise((resolve, reject) => {
     const transaction = db.transaction(STORE_NAME, 'readonly');
     const store = transaction.objectStore(STORE_NAME);
     const request = store.get(id);
     request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
     };
     request.onerror = () => reject(request.error);
   });
};

export const deleteTrack = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};