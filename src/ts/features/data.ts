import { currentBackgroundBlob } from '../theme/background';
import { commands, describeGrants, hasScriptCommands } from './commands';
import {
    exportOverlay,
    exportPresetsCheck,
    exportScriptWarning,
    importScriptWarning,
    importAsPresetRow,
    importModeApply,
    importModePreset,
    importNameGroup,
    importOverlay,
    importPresetName,
    importSummary
} from '../core/dom';
import {
    PRESET_NAME_MAX,
    addImportedPreset,
    applyPreset,
    describePreset,
    exportPresets,
    normalizePreset,
    renderPresetList,
    sanitizePresets,
    savePresetList
} from './presets';
import {
    HISTORY_MAX,
    commandHistory,
    saveCommandHistory,
    saveHistory,
    searchHistory,
    setCommandHistory,
    setSearchHistory
} from './search';
import {
    ALL_PARTS,
    CONTENT_KEYS,
    PART_KEYS,
    PART_LABELS,
    STYLE_KEYS,
    customCss,
    pickSettings,
    settings
} from '../core/settings';
import { sanitizeShortcuts, shortcuts } from './shortcuts';
import { fileToDataUrl } from '../core/storage';
import type { ExportPayload, PartKey, Parts, Preset } from '../core/types';
import { cloneData, countOf, downloadFile, hideModal, showModal, showToast } from '../core/ui';
import { widgetsState } from '../widgets/model';

type RawPayload = Record<string, unknown>;

interface PendingImport {
    payload: RawPayload;
    preset: Preset | null;
    embedded: number;
}

let pendingImport: PendingImport | null = null;

const EXPORT_SCRIPT_WARNING =
    'Your commands include scripts. Whoever imports this file gets code that runs on their computer when they use ' +
    'those commands - share it only with people who trust you, or untick Commands.';
const IMPORT_SCRIPT_WARNING =
    'This file contains script commands. Their code runs on this computer whenever you use them. Only continue if ' +
    'you fully trust where the file came from, and review the code in Customize → Commands before running it.';

export function exportParts(): Parts {
    const parts: Parts = { ...ALL_PARTS };
    PART_KEYS.forEach(key => {
        parts[key] = false;
    });
    document.querySelectorAll<HTMLInputElement>('[data-export-part]').forEach(el => {
        parts[el.dataset.exportPart as PartKey] = el.checked;
    });
    return parts;
}

export function openExportModal() {
    document.querySelectorAll<HTMLInputElement>('[data-export-part]').forEach(el => {
        el.checked = true;
    });
    exportPresetsCheck.checked = false;
    exportScriptWarning.hidden = !hasScriptCommands(commands);
    exportScriptWarning.textContent = EXPORT_SCRIPT_WARNING + describeGrants(commands);
    showModal(exportOverlay);
}

export function exportFileName(parts: Parts, includePresets: boolean): string {
    const chosen = PART_KEYS.filter(key => parts[key]);
    if (chosen.length === PART_KEYS.length && includePresets) {
        return 'new-tab-backup.json';
    }
    const names = chosen.map(key => PART_LABELS[key].toLowerCase());
    if (includePresets) {
        names.push('presets');
    }
    return `new-tab-${names.join('-')}.json`;
}

export async function buildExport(parts: Parts, includePresets: boolean): Promise<ExportPayload> {
    const payload: ExportPayload = { version: 2, exportedAt: new Date().toISOString() };
    const keys = [...(parts.style ? STYLE_KEYS : []), ...(parts.content ? CONTENT_KEYS : [])];
    if (keys.length) {
        payload.settings = pickSettings(settings, keys);
    }
    if (parts.style) {
        payload.customCss = customCss;
        const blob = await currentBackgroundBlob();
        payload.backgroundImage = blob ? await fileToDataUrl(blob) : '';
    }
    if (parts.shortcuts) {
        payload.shortcuts = sanitizeShortcuts(shortcuts);
    }
    if (parts.commands) {
        payload.commands = cloneData(commands);
    }
    if (parts.widgets) {
        payload.widgets = cloneData(widgetsState);
    }
    if (includePresets) {
        payload.presets = await exportPresets();
    }
    return payload;
}

export async function runExport() {
    const parts = exportParts();
    const includePresets = exportPresetsCheck.checked;
    if (!Object.values(parts).some(Boolean) && !includePresets) {
        showToast('Tick at least one thing to export.');
        return;
    }
    hideModal(exportOverlay);
    const payload = await buildExport(parts, includePresets);
    downloadFile(exportFileName(parts, includePresets), JSON.stringify(payload));
}

export function exportHistory() {
    const payload = { version: 2, exportedAt: new Date().toISOString(), searchHistory, commandHistory };
    downloadFile('new-tab-history.json', JSON.stringify(payload));
}

export async function readJsonFile(file: File, failure: string): Promise<unknown> {
    try {
        const payload: unknown = JSON.parse(await file.text());
        if (payload && typeof payload === 'object') {
            return payload;
        }
    } catch {}
    alert(failure);
    return null;
}

export async function importHistory(file: File) {
    const payload = await readJsonFile(file, 'That file could not be read as a history export.');
    if (!payload) {
        return;
    }
    const source = payload as { searchHistory?: unknown; commandHistory?: unknown };
    const searches = Array.isArray(payload) ? payload : source.searchHistory;
    const usedCommands = Array.isArray(payload) ? [] : source.commandHistory;
    if (!Array.isArray(searches) && !Array.isArray(usedCommands)) {
        alert('That file does not contain a search history.');
        return;
    }
    const merged = mergeEntries(searchHistory, searches);
    setSearchHistory(merged.list);
    saveHistory();
    const mergedCommands = mergeEntries(commandHistory, usedCommands);
    setCommandHistory(mergedCommands.list);
    saveCommandHistory();
    showToast(`${countOf(merged.added + mergedCommands.added, 'entry', 'entries')} added to your history.`);
}

function mergeEntries(current: string[], incoming: unknown): { list: string[]; added: number } {
    const known = new Set(current.map(item => item.toLowerCase()));
    const added: string[] = [];
    (Array.isArray(incoming) ? incoming : []).forEach((item: unknown) => {
        if (typeof item === 'string' && item.trim() && !known.has(item.toLowerCase())) {
            known.add(item.toLowerCase());
            added.push(item);
        }
    });
    return { list: [...current, ...added].slice(0, HISTORY_MAX), added: added.length };
}

export function suggestedPresetName(file: File): string {
    return (
        file.name
            .replace(/\.json$/i, '')
            .replace(/^new-tab-/, '')
            .slice(0, PRESET_NAME_MAX) || 'Imported'
    );
}

export async function readImportFile(file: File) {
    const payload = (await readJsonFile(file, 'That file could not be read as an export.')) as RawPayload | null;
    if (!payload) {
        return;
    }
    const preset = normalizePreset(payload);
    const embeddedPresets = sanitizePresets(payload.presets);
    const embedded = embeddedPresets.length;
    if (!preset && !embedded) {
        alert('That file does not contain anything this page can import.');
        return;
    }
    pendingImport = { payload, preset, embedded };
    importSummary.textContent = describeImport(preset, embedded);
    const scripted = [preset, ...embeddedPresets].flatMap(item => (item && item.commands) || []);
    importScriptWarning.hidden = !hasScriptCommands(scripted);
    importScriptWarning.textContent = IMPORT_SCRIPT_WARNING + describeGrants(scripted);
    importAsPresetRow.hidden = !preset;
    importModeApply.checked = true;
    importNameGroup.hidden = true;
    importPresetName.value = preset ? suggestedPresetName(file) : '';
    showModal(importOverlay);
}

export function closeImportModal() {
    pendingImport = null;
    hideModal(importOverlay);
}

export function syncImportForm() {
    importNameGroup.hidden = !importModePreset.checked;
    if (!importNameGroup.hidden) {
        setTimeout(() => importPresetName.focus(), 50);
    }
}

export async function runImport() {
    if (!pendingImport) {
        return;
    }
    const { payload, preset } = pendingImport;
    const asPreset = preset && importModePreset.checked;
    const name = importPresetName.value.trim().slice(0, PRESET_NAME_MAX);
    const backgroundImage = typeof payload.backgroundImage === 'string' ? payload.backgroundImage : '';
    closeImportModal();

    const messages: string[] = [];
    if (preset && asPreset) {
        await addImportedPreset({ ...preset, name: name || preset.name }, backgroundImage);
        messages.push(`saved as preset "${name || preset.name}"`);
    } else if (preset) {
        const applied = await applyPreset(preset, ALL_PARTS, backgroundImage);
        messages.push(`applied ${applied.map(key => PART_LABELS[key].toLowerCase()).join(', ')}`);
    }
    let embedded = 0;
    for (const raw of Array.isArray(payload.presets) ? payload.presets : []) {
        const item = normalizePreset(raw);
        if (item) {
            await addImportedPreset(item, (raw as RawPayload).backgroundImage);
            embedded++;
        }
    }
    if (embedded) {
        messages.push(`added ${countOf(embedded, 'saved preset', 'saved presets')}`);
    }
    savePresetList();
    renderPresetList();
    showToast(`Import done: ${messages.join('; ')}.`);
}

export function describeImport(preset: Preset | null, embedded: number): string {
    const bits: string[] = [];
    if (preset) {
        bits.push(describePreset(preset));
    }
    if (embedded) {
        bits.push(countOf(embedded, 'saved preset', 'saved presets'));
    }
    return `This file contains: ${bits.join(' · ')}.`;
}
