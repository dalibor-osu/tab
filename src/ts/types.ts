import type { DEFAULT_SETTINGS } from './settings';

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export interface Shortcut {
    name: string;
    url: string;
}

export interface SearchCommand {
    name: string;
    type: 'search';
    url: string;
}

export interface OpenCommand {
    name: string;
    type: 'open';
    urls: string[];
}

export type Command = SearchCommand | OpenCommand;

export interface Engine {
    id: string;
    label: string;
    url: string;
}

export interface Font {
    id: string;
    label: string;
    stack: string;
    google?: string;
}

export type PartKey = 'style' | 'content' | 'shortcuts' | 'commands' | 'widgets';
export type Parts = Record<PartKey, boolean>;

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type WidgetType = 'clock' | 'date' | 'notes' | 'todo' | 'external';
export type ConfigType = 'select' | 'text' | 'number' | 'range' | 'toggle' | 'color';
export type ConfigValue = string | number | boolean;

export interface WidgetSettings {
    html: string;
    hosts: string[];
    data: unknown;
    config: Record<string, ConfigValue>;
    source: string;
}

export interface WidgetItem extends Rect {
    id: string;
    type: WidgetType;
    card: boolean;
    settings: WidgetSettings;
}

export interface WidgetsState {
    grid: { cols: number; rows: number };
    items: WidgetItem[];
}

export interface ManifestOption {
    value: string;
    label: string;
}

export interface ManifestField {
    key: string;
    type: ConfigType;
    label: string;
    hint: string;
    options: ManifestOption[];
    min: number | null;
    max: number | null;
    step: number | null;
    placeholder: string;
    default: ConfigValue;
}

export interface WidgetManifest {
    name: string;
    hosts: string[];
    settings: ManifestField[];
}

export interface Preset {
    id: string;
    name: string;
    savedAt: string;
    parts: Parts;
    settings: Partial<Settings>;
    customCss: string;
    hasImage: boolean;
    shortcuts: Shortcut[] | null;
    commands: Command[] | null;
    widgets: WidgetsState | null;
}

export interface ExportPayload {
    version: number;
    exportedAt: string;
    settings?: Partial<Settings>;
    customCss?: string;
    backgroundImage?: string;
    shortcuts?: Shortcut[];
    commands?: Command[];
    widgets?: WidgetsState;
    presets?: Array<Preset & { backgroundImage?: string }>;
}

export interface PreparedImage {
    blob: Blob;
    thumb: string;
}

export type Json = Record<string, unknown>;
