import { currentBackgroundBlob, prepareImage, saveBackground, setBackgroundSource } from './background';
import { commands, renderCommandList, sanitizeCommands, saveCommands, setCommands } from './commands';
import { presetList, presetModalTitle, presetName, presetOverlay, presetSaveBtn } from './dom';
import { applySettings, syncControls } from './panel';
import {
    ALL_PARTS,
    CONTENT_KEYS,
    PART_KEYS,
    PART_LABELS,
    PRESET_KEYS,
    STYLE_KEYS,
    assignSettings,
    customCss,
    pickSettings,
    saveSettings,
    setCustomCss,
    settings
} from './settings';
import { renderShortcuts, sanitizeShortcuts, saveShortcuts, setShortcuts, shortcuts } from './shortcuts';
import {
    IMAGE_KEY,
    PRESETS_KEY,
    PRESET_IMAGE_PREFIX,
    THUMB_KEY,
    dbRequest,
    fileToDataUrl,
    readRaw,
    readStorage,
    removeImage,
    removeRaw,
    writeStorage
} from './storage';
import type { PartKey, Parts, Preset, SettingKey, Settings } from './types';
import {
    CROSS_ICON,
    OVERWRITE_ICON,
    PENCIL_ICON,
    cloneData,
    countOf,
    hideModal,
    newId,
    openConfirm,
    showModal,
    showToast
} from './ui';
import { sanitizeWidgets, saveWidgets, setWidgetsState, widgetsState } from './widgets/model';
import { renderWidgetList, renderWidgets, syncGridControls } from './widgets/render';

interface StoredPresetImage {
    blob: Blob;
    thumb?: string;
}

type Snapshot = Pick<Preset, 'parts' | 'settings' | 'customCss' | 'shortcuts' | 'commands' | 'widgets'>;

export const PRESET_NAME_MAX = 40;

export let savedPresets: Preset[] = [];
export const presetLoadParts: Parts = { ...ALL_PARTS };
let editingPreset = -1;

export function normalizePreset(item: unknown): Preset | null {
    if (!item || typeof item !== 'object') {
        return null;
    }
    const raw = item as Record<string, unknown>;
    const source = (raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) as Partial<Settings>;
    const hasAny = (keys: SettingKey[]) => keys.some(key => key in source);
    const css = typeof raw.customCss === 'string' ? raw.customCss : '';
    const image = typeof raw.backgroundImage === 'string' && raw.backgroundImage !== '';
    const widgets = raw.widgets as { items?: unknown } | null | undefined;
    const parts: Parts = {
        style: hasAny(STYLE_KEYS) || css !== '' || image || Boolean(raw.hasImage),
        content: hasAny(CONTENT_KEYS),
        shortcuts: Array.isArray(raw.shortcuts),
        commands: Array.isArray(raw.commands),
        widgets: Boolean(widgets && typeof widgets === 'object' && Array.isArray(widgets.items))
    };
    if (!Object.values(parts).some(Boolean)) {
        return null;
    }
    const keys = [...(parts.style ? STYLE_KEYS : []), ...(parts.content ? CONTENT_KEYS : [])];
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, PRESET_NAME_MAX) : '';
    return {
        id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
        name: name || 'Preset',
        savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
        parts,
        settings: pickSettings(source, keys),
        customCss: parts.style ? css : '',
        hasImage: parts.style && Boolean(raw.hasImage),
        shortcuts: parts.shortcuts ? sanitizeShortcuts(raw.shortcuts) : null,
        commands: parts.commands ? sanitizeCommands(raw.commands) || [] : null,
        widgets: parts.widgets ? sanitizeWidgets(raw.widgets) : null
    };
}

export function sanitizePresets(list: unknown): Preset[] {
    return (Array.isArray(list) ? list : []).map(normalizePreset).filter((preset): preset is Preset => preset !== null);
}

export function loadPresetList() {
    savedPresets = sanitizePresets(readStorage<unknown>(PRESETS_KEY, []));
}

export function savePresetList() {
    writeStorage(PRESETS_KEY, savedPresets);
}

export function presetSnapshot(): Snapshot {
    return {
        parts: { ...ALL_PARTS },
        settings: pickSettings(settings, PRESET_KEYS),
        customCss,
        shortcuts: sanitizeShortcuts(shortcuts),
        commands: cloneData(commands),
        widgets: cloneData(widgetsState)
    };
}

export function presetImageKey(id: string): string {
    return PRESET_IMAGE_PREFIX + id;
}

export async function storePresetImage(id: string, blob: Blob, thumb: string): Promise<boolean> {
    try {
        await dbRequest('readwrite', store => store.put({ blob, thumb }, presetImageKey(id)));
        return true;
    } catch {
        return false;
    }
}

export async function readPresetImage(id: string): Promise<StoredPresetImage | null> {
    try {
        const stored = await dbRequest<StoredPresetImage | undefined>('readonly', store =>
            store.get(presetImageKey(id))
        );
        if (stored && stored.blob instanceof Blob) {
            return stored;
        }
    } catch {}
    return null;
}

export async function removePresetImage(id: string) {
    try {
        await dbRequest('readwrite', store => store.delete(presetImageKey(id)));
    } catch {}
}

export async function clearStoredFiles() {
    try {
        await dbRequest('readwrite', store => store.clear());
    } catch {}
    removeRaw(IMAGE_KEY);
    removeRaw(THUMB_KEY);
}

export async function capturePresetImage(id: string): Promise<boolean> {
    const blob = await currentBackgroundBlob();
    if (!blob) {
        await removePresetImage(id);
        return false;
    }
    const stored = await storePresetImage(id, blob, readRaw(THUMB_KEY) || '');
    if (!stored) {
        showToast('The background image could not be stored with the preset.');
    }
    return stored;
}

export async function createPreset(name: string) {
    const id = newId();
    const preset: Preset = { id, name, savedAt: new Date().toISOString(), ...presetSnapshot(), hasImage: false };
    preset.hasImage = await capturePresetImage(id);
    savedPresets.push(preset);
    savePresetList();
    renderPresetList();
    showToast(`Preset "${name}" saved.`);
}

export async function overwritePreset(index: number) {
    const preset = savedPresets[index];
    Object.assign(preset, presetSnapshot(), { savedAt: new Date().toISOString() });
    preset.hasImage = await capturePresetImage(preset.id);
    savePresetList();
    renderPresetList();
    showToast(`Preset "${preset.name}" now holds your current setup.`);
}

export async function addImportedPreset(preset: Preset, backgroundImage: unknown) {
    preset.id = newId();
    preset.savedAt = new Date().toISOString();
    preset.hasImage = false;
    if (preset.parts.style && typeof backgroundImage === 'string' && backgroundImage) {
        try {
            const prepared = await prepareImage(await (await fetch(backgroundImage)).blob());
            preset.hasImage = await storePresetImage(preset.id, prepared.blob, prepared.thumb);
        } catch {}
    }
    savedPresets.push(preset);
}

export function deletePreset(index: number) {
    const preset = savedPresets[index];
    openConfirm(
        'Remove preset?',
        `"${preset.name}" will be removed. Your current setup stays as it is.`,
        'Remove',
        () => {
            savedPresets.splice(index, 1);
            savePresetList();
            removePresetImage(preset.id);
            renderPresetList();
        }
    );
}

export async function applyBackgroundFrom(preset: Preset, dataUrl: string) {
    if (dataUrl) {
        try {
            await saveBackground(await prepareImage(await (await fetch(dataUrl)).blob()));
            return;
        } catch {}
    }
    const stored = preset.hasImage ? await readPresetImage(preset.id) : null;
    if (stored) {
        await saveBackground({ blob: stored.blob, thumb: stored.thumb || '' });
        return;
    }
    await removeImage();
    setBackgroundSource('');
}

export async function applyPreset(preset: Preset, wanted: Parts, dataUrl: string): Promise<PartKey[]> {
    const applied = PART_KEYS.filter(key => wanted[key] && preset.parts[key]);
    if (!applied.length) {
        return applied;
    }
    if (applied.includes('style')) {
        assignSettings(preset.settings, STYLE_KEYS);
        setCustomCss(preset.customCss);
        await applyBackgroundFrom(preset, dataUrl);
    }
    if (applied.includes('content')) {
        assignSettings(preset.settings, CONTENT_KEYS);
    }
    if (applied.includes('shortcuts')) {
        setShortcuts(cloneData(preset.shortcuts || []));
        saveShortcuts();
        renderShortcuts();
    }
    if (applied.includes('commands')) {
        setCommands(cloneData(preset.commands || []));
        saveCommands();
        renderCommandList();
    }
    if (applied.includes('widgets')) {
        setWidgetsState(sanitizeWidgets(preset.widgets));
        saveWidgets();
        renderWidgets();
        renderWidgetList();
        syncGridControls();
    }
    saveSettings();
    applySettings();
    syncControls();
    return applied;
}

export async function loadPreset(index: number) {
    const preset = savedPresets[index];
    if (!Object.values(presetLoadParts).some(Boolean)) {
        showToast('Tick at least one part to load.');
        return;
    }
    const applied = await applyPreset(preset, presetLoadParts, '');
    if (!applied.length) {
        showToast(`"${preset.name}" has none of the ticked parts.`);
        return;
    }
    showToast(`Loaded ${applied.map(key => PART_LABELS[key].toLowerCase()).join(', ')} from "${preset.name}".`);
}

export function describePreset(preset: Preset): string {
    const parts: string[] = [];
    if (preset.parts.style) {
        parts.push(PART_LABELS.style);
    }
    if (preset.parts.content) {
        parts.push(PART_LABELS.content);
    }
    if (preset.parts.shortcuts) {
        parts.push(countOf((preset.shortcuts || []).length, 'shortcut', 'shortcuts'));
    }
    if (preset.parts.commands) {
        parts.push(countOf((preset.commands || []).length, 'command', 'commands'));
    }
    if (preset.parts.widgets) {
        parts.push(countOf(preset.widgets ? preset.widgets.items.length : 0, 'widget', 'widgets'));
    }
    return parts.join(' · ');
}

export function renderPresetList() {
    presetList.innerHTML = '';
    if (!savedPresets.length) {
        const empty = document.createElement('div');
        empty.className = 'settings-hint';
        empty.textContent = 'No presets yet. Save your current setup or import one to switch between them.';
        presetList.appendChild(empty);
        return;
    }
    savedPresets.forEach((preset, index) => {
        const row = document.createElement('div');
        row.className = 'command-row preset-row';

        const info = document.createElement('div');
        info.className = 'preset-info';
        const name = document.createElement('span');
        name.className = 'preset-name';
        name.textContent = preset.name;
        name.title = preset.savedAt ? `Saved ${new Date(preset.savedAt).toLocaleString()}` : preset.name;
        const detail = document.createElement('span');
        detail.className = 'command-detail';
        detail.textContent = describePreset(preset);
        detail.title = detail.textContent;
        info.append(name, detail);

        const load = document.createElement('button');
        load.type = 'button';
        load.className = 'preset-load';
        load.textContent = 'Load';
        load.title = 'Load the ticked parts of this preset';
        load.addEventListener('click', () => loadPreset(index));

        const overwrite = document.createElement('button');
        overwrite.type = 'button';
        overwrite.title = 'Overwrite with the current setup';
        overwrite.innerHTML = OVERWRITE_ICON;
        overwrite.addEventListener('click', () => overwritePreset(index));

        const rename = document.createElement('button');
        rename.type = 'button';
        rename.title = 'Rename preset';
        rename.innerHTML = PENCIL_ICON;
        rename.addEventListener('click', () => openPresetModal(index));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.title = 'Remove preset';
        remove.innerHTML = CROSS_ICON;
        remove.addEventListener('click', () => deletePreset(index));

        row.append(info, load, overwrite, rename, remove);
        presetList.appendChild(row);
    });
}

export function openPresetModal(index?: number) {
    editingPreset = typeof index === 'number' ? index : -1;
    const preset = editingPreset >= 0 ? savedPresets[editingPreset] : null;
    presetModalTitle.textContent = preset ? 'Rename Preset' : 'Save Preset';
    presetSaveBtn.textContent = preset ? 'Save changes' : 'Save';
    presetName.value = preset ? preset.name : '';
    showModal(presetOverlay);
    setTimeout(() => presetName.focus(), 100);
}

export function closePresetModal() {
    editingPreset = -1;
    hideModal(presetOverlay);
}

export function savePresetForm() {
    const name = presetName.value.trim().slice(0, PRESET_NAME_MAX);
    if (!name) {
        presetName.focus();
        return;
    }
    const index = editingPreset;
    closePresetModal();
    if (index >= 0) {
        savedPresets[index].name = name;
        savePresetList();
        renderPresetList();
        return;
    }
    createPreset(name);
}

export async function exportPresets(): Promise<Array<Preset & { backgroundImage: string }>> {
    const exported: Array<Preset & { backgroundImage: string }> = [];
    for (const preset of savedPresets) {
        const stored = preset.hasImage ? await readPresetImage(preset.id) : null;
        exported.push({ ...preset, backgroundImage: stored ? await fileToDataUrl(stored.blob) : '' });
    }
    return exported;
}
