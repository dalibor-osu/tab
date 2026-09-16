import { clamp, hslToHex, rgbToHsl } from './color';
import type { Hsl } from './color';
import { bgFull, imageHint, settingsZone, themeStatus } from './dom';
import { applySettings, syncControls } from './panel';
import { saveSettings, setSettings, settings } from './settings';
import { THUMB_KEY, readRaw, removeImage, removeRaw, storeImage, writeRaw } from './storage';
import { setVar } from './theme';
import type { PreparedImage, Settings } from './types';
import { webUrl } from './urls';

export type Palette = Pick<Settings, 'accent' | 'bg' | 'textPrimary' | 'textSecondary' | 'panelColor' | 'panelAlpha'>;

export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const IMAGE_KEEP_BYTES = 1.5 * 1024 * 1024;
export const IMAGE_MAX_SIDE = 2560;
export const IMAGE_QUALITY = 0.88;
export const IMAGE_KEEP_TYPES = ['image/gif', 'image/svg+xml'];
export const THUMB_SIDE = 480;

let backgroundToken = 0;
export let backgroundImage = '';
export let backgroundBlob: Blob | null = null;
export let backgroundObjectUrl = '';
let peekTimer: ReturnType<typeof setTimeout> | undefined;

export async function applyBackground() {
    setVar('--bg-fit', settings.bgFit);
    const source = backgroundImage || webUrl(settings.bgUrl);
    const token = ++backgroundToken;
    if (!source) {
        bgFull.classList.remove('ready');
        setVar('--bg-image-full', 'none');
        setVar('--bg-image', 'none');
        return;
    }

    const img = new Image();
    img.src = source;
    try {
        await img.decode();
    } catch {
        return;
    }
    if (token !== backgroundToken) {
        return;
    }

    const thumb = source === backgroundImage && settings.bgFit !== 'auto' ? readRaw(THUMB_KEY) : '';
    setVar('--bg-image', thumb ? `url("${thumb}")` : 'none');
    setVar('--bg-image-full', `url("${source.replace(/"/g, '%22')}")`);
    bgFull.classList.add('ready');
    refreshThumbnail(img, source);
}

export function refreshThumbnail(img: HTMLImageElement, source: string) {
    if (source !== backgroundImage || !img.naturalWidth) {
        return;
    }
    const thumb = readRaw(THUMB_KEY);
    if (!thumb || thumb.length >= 8000) {
        return;
    }
    try {
        writeRaw(THUMB_KEY, drawScaled(img, THUMB_SIDE).toDataURL('image/jpeg', 0.6));
    } catch {}
}

export function loadImageForSampling(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('The image could not be loaded.'));
        img.src = src;
    });
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('The image could not be decoded.'));
        img.src = src;
    });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export function drawScaled(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const ratio = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext('2d');
    if (context) {
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    return canvas;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
    if (IMAGE_KEEP_TYPES.includes(file.type)) {
        return { blob: file, thumb: '' };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await loadImageElement(objectUrl);
        const thumb = drawScaled(img, THUMB_SIDE).toDataURL('image/jpeg', 0.6);
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        if (longest <= IMAGE_MAX_SIDE && file.size <= IMAGE_KEEP_BYTES) {
            return { blob: file, thumb };
        }

        const canvas = drawScaled(img, IMAGE_MAX_SIDE);
        let blob = await canvasToBlob(canvas, 'image/webp', IMAGE_QUALITY);
        if (!blob || blob.type !== 'image/webp') {
            blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_QUALITY);
        }
        return { blob: blob && blob.size < file.size ? blob : file, thumb };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export function setBackgroundSource(stored: Blob | string) {
    if (backgroundObjectUrl) {
        URL.revokeObjectURL(backgroundObjectUrl);
        backgroundObjectUrl = '';
    }
    if (stored instanceof Blob) {
        backgroundBlob = stored;
        backgroundObjectUrl = URL.createObjectURL(stored);
        backgroundImage = backgroundObjectUrl;
    } else {
        backgroundBlob = null;
        backgroundImage = typeof stored === 'string' ? stored : '';
    }
}

export async function saveBackground(prepared: PreparedImage): Promise<boolean> {
    const stored = await storeImage(prepared.blob);
    if (!stored) {
        return false;
    }
    if (prepared.thumb) {
        writeRaw(THUMB_KEY, prepared.thumb);
    } else {
        removeRaw(THUMB_KEY);
    }
    setBackgroundSource(prepared.blob);
    return true;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function samplePixels(img: HTMLImageElement): Uint8ClampedArray {
    const canvas = drawScaled(img, 72);
    const context = canvas.getContext('2d');
    if (!context) {
        return new Uint8ClampedArray();
    }
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

interface Bin {
    r: number;
    g: number;
    b: number;
    count: number;
}

export function paletteFromPixels(data: Uint8ClampedArray): Palette | null {
    const bins = new Map<number, Bin>();
    let luminance = 0;
    let samples = 0;

    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 125) {
            continue;
        }
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
        let bin = bins.get(key);
        if (!bin) {
            bin = { r: 0, g: 0, b: 0, count: 0 };
            bins.set(key, bin);
        }
        bin.r += r;
        bin.g += g;
        bin.b += b;
        bin.count++;
        luminance += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        samples++;
    }

    if (!samples) {
        return null;
    }

    const colors = [...bins.values()]
        .map(bin => ({
            count: bin.count,
            ...rgbToHsl(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count)
        }))
        .sort((a, b) => b.count - a.count);

    const light = luminance / samples > 0.6;
    const dominant = colors[0];

    let chosen: (Hsl & { count: number }) | null = null;
    let bestScore = 0;
    for (const color of colors) {
        if (color.s < 0.18) {
            continue;
        }
        const fit = 1 - Math.abs(color.l - 0.55) * 1.6;
        if (fit <= 0) {
            continue;
        }
        const score = Math.sqrt(color.count) * color.s * fit;
        if (score > bestScore) {
            bestScore = score;
            chosen = color;
        }
    }
    const accent = chosen
        ? hslToHex(
              chosen.h,
              clamp(chosen.s * 1.15, 0.5, 0.92),
              light ? clamp(chosen.l, 0.35, 0.5) : clamp(chosen.l, 0.55, 0.72)
          )
        : hslToHex(dominant.h, 0.06, light ? 0.3 : 0.86);

    return {
        accent,
        bg: hslToHex(dominant.h, clamp(dominant.s, 0.05, light ? 0.22 : 0.45), light ? 0.95 : 0.08),
        textPrimary: light ? hslToHex(dominant.h, 0.25, 0.12) : hslToHex(dominant.h, 0.08, 0.97),
        textSecondary: light ? hslToHex(dominant.h, 0.14, 0.38) : hslToHex(dominant.h, 0.06, 0.68),
        panelColor: light ? '#ffffff' : '#000000',
        panelAlpha: light ? 0.55 : 0.35
    };
}

export function setThemeStatus(message: string) {
    themeStatus.textContent = message;
    themeStatus.hidden = !message;
}

export async function matchThemeToImage() {
    const source = backgroundImage || webUrl(settings.bgUrl);
    if (!source) {
        setThemeStatus('Choose an image first.');
        return;
    }

    setThemeStatus('Reading the image…');
    try {
        const img = await loadImageForSampling(source);
        const palette = paletteFromPixels(samplePixels(img));
        if (!palette) {
            throw new Error('No usable pixels.');
        }
        setSettings({ ...settings, ...palette });
        saveSettings();
        applySettings();
        syncControls();
        setThemeStatus('Colors matched to the image.');
    } catch {
        setThemeStatus('This image could not be read - the server hosting it has to allow it.');
    }
}

export async function handleImageFile(file: File | undefined) {
    if (!file) {
        return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
        alert('That image is larger than 25 MB - pick a smaller one.');
        return;
    }

    imageHint.textContent = 'Preparing the image…';
    let prepared: PreparedImage;
    try {
        prepared = await prepareImage(file);
    } catch {
        alert('That file could not be read as an image.');
        syncControls();
        return;
    }

    if (!(await saveBackground(prepared))) {
        alert('The image could not be stored in this browser. Try a smaller file or use an image URL.');
        syncControls();
        return;
    }

    applyBackground();
    syncControls();
    if (settings.autoTheme) {
        await matchThemeToImage();
    }
}

export async function clearImage() {
    await removeImage();
    setBackgroundSource('');
    applyBackground();
    syncControls();
    setThemeStatus('');
}

export async function currentBackgroundBlob(): Promise<Blob | null> {
    if (backgroundBlob) {
        return backgroundBlob;
    }
    if (backgroundImage && !backgroundObjectUrl) {
        try {
            return await (await fetch(backgroundImage)).blob();
        } catch {}
    }
    return null;
}

export function peekBackground() {
    clearTimeout(peekTimer);
    settingsZone.classList.add('peeking');
}

export function releaseBackground(delay: number) {
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => settingsZone.classList.remove('peeking'), delay);
}
