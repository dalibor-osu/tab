import { WIDGETS_KEY, readStorage, writeStorage } from '../core/storage';
import type {
    ConfigType,
    ConfigValue,
    ManifestField,
    ManifestOption,
    Rect,
    WidgetItem,
    WidgetManifest,
    WidgetSettings,
    WidgetType,
    WidgetsState
} from '../core/types';
import { clampInt, newId } from '../core/ui';
import { isHostName, isSourceUrl, parseHosts } from '../core/urls';
import { BUILTIN_WIDGETS } from './builtin';

interface WidgetTypeInfo {
    label: string;
    size: [number, number];
}

export const GRID_LIMITS: Record<'cols' | 'rows', [number, number]> = { cols: [2, 24], rows: [2, 16] };
export const WIDGET_CODE_MAX = 200000;
export const WIDGET_DATA_MAX = 65536;
export const WIDGET_FETCH_MAX = 1024 * 1024;
export const CONFIG_TYPES: ConfigType[] = ['select', 'text', 'number', 'range', 'toggle', 'color'];
export const CONFIG_TEXT_MAX = 500;

export const WIDGET_TYPES: Record<WidgetType, WidgetTypeInfo> = {
    clock: { label: 'Clock', size: [3, 2] },
    date: { label: 'Date', size: [3, 1] },
    notes: { label: 'Notes', size: [3, 3] },
    todo: { label: 'To-do', size: [3, 4] },
    external: { label: 'External (runs code)', size: [4, 3] }
};

export let widgetsState: WidgetsState = defaultWidgets();

export function setWidgetsState(next: WidgetsState) {
    widgetsState = next;
}

export function isWidgetType(value: unknown): value is WidgetType {
    return typeof value === 'string' && value in WIDGET_TYPES;
}

export function defaultWidgetSettings(): WidgetSettings {
    return { html: '', hosts: [], data: null, config: {}, source: '' };
}

export function widgetHtml(item: Pick<WidgetItem, 'type' | 'settings'>): string {
    return item.type === 'external' ? item.settings.html : BUILTIN_WIDGETS[item.type];
}

export function sanitizeWidgetData(value: unknown): unknown {
    try {
        const json = JSON.stringify(value);
        if (json && json.length <= WIDGET_DATA_MAX) {
            return JSON.parse(json);
        }
    } catch {}
    return null;
}

function legacyWidgetData(type: WidgetType, source: Record<string, unknown>): unknown {
    if (type === 'notes' && typeof source.text === 'string') {
        return { text: source.text };
    }
    if (type === 'todo' && Array.isArray(source.items)) {
        return { items: source.items };
    }
    return null;
}

export function sanitizeWidgetSettings(type: WidgetType, raw: unknown): WidgetSettings {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const text = (key: string, max: number): string => {
        const value = source[key];
        return typeof value === 'string' ? value.slice(0, max) : '';
    };
    const external = type === 'external';
    const html = external ? text('html', WIDGET_CODE_MAX) : '';
    const origin = text('source', 2000).trim();
    const configSource = source.config && typeof source.config === 'object' ? source.config : source;
    return {
        html,
        hosts: external ? parseHosts(Array.isArray(source.hosts) ? source.hosts.join(',') : '').filter(isHostName) : [],
        data: sanitizeWidgetData(source.data === undefined ? legacyWidgetData(type, source) : source.data),
        config: sanitizeWidgetConfig(
            widgetManifest(widgetHtml({ type, settings: { ...defaultWidgetSettings(), html } })),
            configSource
        ),
        source: external && isSourceUrl(origin) ? origin : ''
    };
}

const manifestCache = new Map<string, WidgetManifest | null>();

export function widgetManifest(html: string): WidgetManifest | null {
    const cached = manifestCache.get(html);
    if (cached !== undefined) {
        return cached;
    }
    let manifest: WidgetManifest | null = null;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const block = doc.querySelector('script#tab-widget[type="application/json"]');
        manifest = block ? sanitizeManifest(JSON.parse(block.textContent || '')) : null;
    } catch {}
    if (manifestCache.size > 50) {
        manifestCache.clear();
    }
    manifestCache.set(html, manifest);
    return manifest;
}

function manifestText(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isConfigType(value: unknown): value is ConfigType {
    return typeof value === 'string' && (CONFIG_TYPES as string[]).includes(value);
}

export function sanitizeManifest(raw: unknown): WidgetManifest | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const source = raw as Record<string, unknown>;
    const fields: ManifestField[] = [];
    const keys = new Set<string>();
    const entries = Array.isArray(source.settings) ? (source.settings as unknown[]) : [];
    entries.slice(0, 20).forEach(entryRaw => {
        const entry = (entryRaw && typeof entryRaw === 'object' ? entryRaw : null) as Record<string, unknown> | null;
        if (!entry || !isConfigType(entry.type)) {
            return;
        }
        const key = manifestText(entry.key, 32);
        if (!/^[a-z_][\w-]*$/i.test(key) || keys.has(key)) {
            return;
        }
        keys.add(key);
        const field: ManifestField = {
            key,
            type: entry.type,
            label: manifestText(entry.label, 60) || key,
            hint: manifestText(entry.hint, 200),
            options: [],
            min: null,
            max: null,
            step: null,
            placeholder: '',
            default: ''
        };
        if (field.type === 'select') {
            const rawOptions = Array.isArray(entry.options) ? (entry.options as unknown[]) : [];
            field.options = rawOptions
                .slice(0, 30)
                .map((option): ManifestOption => {
                    if (option && typeof option === 'object') {
                        const record = option as Record<string, unknown>;
                        const value = manifestText(record.value, 100);
                        return { value, label: manifestText(record.label, 60) || value };
                    }
                    const value = manifestText(option, 100);
                    return { value, label: value };
                })
                .filter(option => option.value);
            if (!field.options.length) {
                return;
            }
        }
        if (field.type === 'number' || field.type === 'range') {
            field.min = typeof entry.min === 'number' && Number.isFinite(entry.min) ? entry.min : null;
            field.max = typeof entry.max === 'number' && Number.isFinite(entry.max) ? entry.max : null;
            field.step =
                typeof entry.step === 'number' && Number.isFinite(entry.step) && entry.step > 0 ? entry.step : null;
        }
        if (field.type === 'range') {
            field.min = field.min ?? 0;
            field.max = field.max ?? 100;
        }
        if (field.type === 'text') {
            field.placeholder = manifestText(entry.placeholder, 60);
        }
        field.default = coerceConfigValue(field, entry.default, fieldFallback(field));
        fields.push(field);
    });
    return {
        name: manifestText(source.name, 40),
        hosts: parseHosts(Array.isArray(source.hosts) ? source.hosts.join(',') : '').filter(isHostName),
        settings: fields
    };
}

export function fieldFallback(field: ManifestField): ConfigValue {
    if (field.type === 'select') {
        return field.options[0].value;
    }
    if (field.type === 'toggle') {
        return false;
    }
    if (field.type === 'color') {
        return '#888888';
    }
    if (field.type === 'number' || field.type === 'range') {
        return field.min != null ? field.min : 0;
    }
    return '';
}

export function coerceConfigValue(field: ManifestField, value: unknown, fallback: ConfigValue): ConfigValue {
    if (value == null) {
        return fallback;
    }
    if (field.type === 'select') {
        return field.options.some(option => option.value === value) ? (value as string) : fallback;
    }
    if (field.type === 'toggle') {
        return typeof value === 'boolean' ? value : fallback;
    }
    if (field.type === 'color') {
        return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    }
    if (field.type === 'number' || field.type === 'range') {
        if (typeof value === 'string' && !value.trim()) {
            return fallback;
        }
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return fallback;
        }
        const low = field.min != null ? Math.max(field.min, number) : number;
        return field.max != null ? Math.min(field.max, low) : low;
    }
    return typeof value === 'string' ? value.slice(0, CONFIG_TEXT_MAX) : fallback;
}

export function sanitizeWidgetConfig(manifest: WidgetManifest | null, raw: unknown): Record<string, ConfigValue> {
    const config: Record<string, ConfigValue> = {};
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    (manifest ? manifest.settings : []).forEach(field => {
        config[field.key] = coerceConfigValue(field, source[field.key], field.default);
    });
    return config;
}

export function defaultWidgets(): WidgetsState {
    return { grid: { cols: 12, rows: 8 }, items: [] };
}

export function sanitizeWidgets(raw: unknown): WidgetsState {
    const state = defaultWidgets();
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const grid = (source.grid && typeof source.grid === 'object' ? source.grid : {}) as Record<string, unknown>;
    state.grid.cols = clampInt(grid.cols, ...GRID_LIMITS.cols, 12);
    state.grid.rows = clampInt(grid.rows, ...GRID_LIMITS.rows, 8);
    const ids = new Set<string>();
    const items = Array.isArray(source.items) ? (source.items as unknown[]) : [];
    items.forEach(entry => {
        const item = (entry && typeof entry === 'object' ? entry : null) as Record<string, unknown> | null;
        if (!item || !isWidgetType(item.type)) {
            return;
        }
        const w = clampInt(item.w, 1, state.grid.cols, 1);
        const h = clampInt(item.h, 1, state.grid.rows, 1);
        const x = clampInt(item.x, 0, state.grid.cols - w, 0);
        const y = clampInt(item.y, 0, state.grid.rows - h, 0);
        let id = typeof item.id === 'string' && item.id ? item.id : newId();
        while (ids.has(id)) {
            id = newId();
        }
        ids.add(id);
        state.items.push({
            id,
            type: item.type,
            x,
            y,
            w,
            h,
            card: typeof item.card === 'boolean' ? item.card : true,
            settings: sanitizeWidgetSettings(item.type, item.settings)
        });
    });
    return state;
}

export function loadWidgets() {
    widgetsState = sanitizeWidgets(readStorage<unknown>(WIDGETS_KEY, null));
}

export function saveWidgets() {
    writeStorage(WIDGETS_KEY, widgetsState);
}

export function findWidget(id: string | undefined): WidgetItem | null {
    return widgetsState.items.find(item => item.id === id) || null;
}

export function widgetsOverlap(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function fitsGrid(rect: Rect): boolean {
    const { cols, rows } = widgetsState.grid;
    return (
        rect.w >= 1 && rect.h >= 1 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= cols && rect.y + rect.h <= rows
    );
}

export function rectFree(rect: Rect, ignoreId?: string | null): boolean {
    return fitsGrid(rect) && !widgetsState.items.some(item => item.id !== ignoreId && widgetsOverlap(item, rect));
}

export function findFreeSlot(w: number, h: number, ignoreId?: string | null): { x: number; y: number } | null {
    const { cols, rows } = widgetsState.grid;
    for (let y = 0; y + h <= rows; y++) {
        for (let x = 0; x + w <= cols; x++) {
            if (rectFree({ x, y, w, h }, ignoreId)) {
                return { x, y };
            }
        }
    }
    return null;
}

export function clampWidgetsToGrid() {
    const { cols, rows } = widgetsState.grid;
    widgetsState.items.forEach(item => {
        item.w = Math.min(item.w, cols);
        item.h = Math.min(item.h, rows);
        item.x = Math.min(item.x, cols - item.w);
        item.y = Math.min(item.y, rows - item.h);
        if (!rectFree(item, item.id)) {
            Object.assign(item, findFreeSlot(item.w, item.h, item.id) || {});
        }
    });
}
