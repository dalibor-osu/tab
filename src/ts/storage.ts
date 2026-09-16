export const SETTINGS_KEY = 'newTabSettings';
export const IMAGE_KEY = 'newTabBackground';
export const THUMB_KEY = 'newTabBackgroundThumb';
export const DB_NAME = 'newTabAssets';
export const DB_STORE = 'files';
export const CUSTOM_CSS_KEY = 'newTabCustomCss';
export const STORAGE_KEY = 'newTabShortcuts';
export const HISTORY_KEY = 'newTabSearchHistory';
export const COMMAND_HISTORY_KEY = 'newTabCommandHistory';
export const INTRO_KEY = 'newTabIntroSeen';
export const COMMANDS_KEY = 'newTabCommands';
export const PRESETS_KEY = 'newTabPresets';
export const PRESET_IMAGE_PREFIX = 'preset:';
export const WIDGETS_KEY = 'newTabWidgets';
export const ICON_CACHE_KEY = 'newTabIconCache';

export function readRaw(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeRaw(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeRaw(key: string) {
    try {
        localStorage.removeItem(key);
    } catch {}
}

export function readStorage<T>(key: string, fallback: T): T {
    try {
        const stored = readRaw(key);
        return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
        return fallback;
    }
}

export function writeStorage(key: string, value: unknown): boolean {
    return writeRaw(key, JSON.stringify(value));
}

export function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB unavailable'));
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function dbRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDb().then(
        db =>
            new Promise<T>((resolve, reject) => {
                const tx = db.transaction(DB_STORE, mode);
                const request = action(tx.objectStore(DB_STORE));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
                tx.oncomplete = () => db.close();
            })
    );
}

export async function readImage(): Promise<Blob | string> {
    try {
        const stored = await dbRequest<Blob | string | undefined>('readonly', store => store.get(IMAGE_KEY));
        if (stored) {
            return stored;
        }
    } catch {}
    return readRaw(IMAGE_KEY) || '';
}

export async function storeImage(blob: Blob): Promise<boolean> {
    try {
        await dbRequest('readwrite', store => store.put(blob, IMAGE_KEY));
        removeRaw(IMAGE_KEY);
        return true;
    } catch {
        try {
            return writeRaw(IMAGE_KEY, await fileToDataUrl(blob));
        } catch {
            return false;
        }
    }
}

export async function removeImage() {
    try {
        await dbRequest('readwrite', store => store.delete(IMAGE_KEY));
    } catch {}
    removeRaw(IMAGE_KEY);
    removeRaw(THUMB_KEY);
}

export function fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
