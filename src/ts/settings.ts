import { CUSTOM_CSS_KEY, SETTINGS_KEY, readRaw, readStorage, removeRaw, writeRaw, writeStorage } from './storage';
import type { PartKey, Parts, SettingKey, Settings } from './types';

export const DEFAULT_SETTINGS = {
    pageTitle: 'New Tab',
    greeting: 'Hello',
    subtitle: 'Where would you like to go?',
    showSubtitle: true,
    shortcutsTitle: 'Quick Access',
    showShortcutsTitle: true,
    engine: 'duckduckgo',
    customEngineUrl: '',
    iconFallback: true,
    font: 'system',
    customFont: '',
    customFontUrl: '',
    fontScale: 1,
    logoScale: 1,
    titleFont: 'inherit',
    titleCustomFont: '',
    titleCustomFontUrl: '',
    titleWeight: '700',
    titleItalic: false,
    titleColorMode: 'accent',
    titleColor: '#ffffff',
    titleColor2: '#c44dff',
    titleGradientAngle: 135,
    titleOutline: 0,
    titleOutlineColor: '#000000',
    titleCard: false,
    accent: '#c44dff',
    bg: '#12121c',
    textPrimary: '#ffffff',
    textSecondary: '#9ca3af',
    panelColor: '#000000',
    panelAlpha: 0.35,
    cardBlur: 10,
    radius: 15,
    hideScrollbars: false,
    reduceMotion: false,
    cornerVisible: false,
    bgUrl: '',
    bgFit: 'cover',
    autoTheme: true,
    rememberSearches: true,
    customCssEnabled: true,
    newTabFocus: false,
    showFooter: true,
    dim: 0.85,
    blur: 0,
    scale: 1,
    x: 0,
    y: 0
};

type StoredSettings = Partial<Settings> & { bgStart?: string; bgEnd?: string };

export function mergeSettings(stored: StoredSettings | null | undefined): Settings {
    const merged: Settings & { bgStart?: string; bgEnd?: string } = { ...DEFAULT_SETTINGS, ...(stored || {}) };
    if (stored && stored.bg == null && stored.bgStart) {
        merged.bg = stored.bgStart;
    }
    delete merged.bgStart;
    delete merged.bgEnd;
    return merged;
}

export function loadSettings(): Settings {
    return mergeSettings(readStorage<StoredSettings | null>(SETTINGS_KEY, null));
}

export let settings: Settings = loadSettings();

export function setSettings(next: Settings) {
    settings = next;
}

export function saveSettings() {
    writeStorage(SETTINGS_KEY, settings);
}

export let customCss = readRaw(CUSTOM_CSS_KEY) || '';

export function setCustomCss(text: string) {
    customCss = text;
    if (text) {
        writeRaw(CUSTOM_CSS_KEY, text);
    } else {
        removeRaw(CUSTOM_CSS_KEY);
    }
}

export const LOOK_KEYS: SettingKey[] = [
    'font',
    'customFont',
    'customFontUrl',
    'fontScale',
    'logoScale',
    'titleFont',
    'titleCustomFont',
    'titleCustomFontUrl',
    'titleWeight',
    'titleItalic',
    'titleColorMode',
    'titleColor',
    'titleColor2',
    'titleGradientAngle',
    'titleOutline',
    'titleOutlineColor',
    'titleCard',
    'accent',
    'bg',
    'textPrimary',
    'textSecondary',
    'panelColor',
    'panelAlpha',
    'cardBlur',
    'radius',
    'hideScrollbars',
    'reduceMotion',
    'cornerVisible'
];

export const BACKGROUND_KEYS: SettingKey[] = ['bgUrl', 'bgFit', 'autoTheme', 'dim', 'blur', 'scale', 'x', 'y'];

export const STYLE_KEYS: SettingKey[] = [...LOOK_KEYS, ...BACKGROUND_KEYS, 'customCssEnabled'];

export const INSTANCE_KEYS: SettingKey[] = ['newTabFocus'];

export const CONTENT_KEYS: SettingKey[] = (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).filter(
    key => !STYLE_KEYS.includes(key) && !INSTANCE_KEYS.includes(key)
);

export const PRESET_KEYS: SettingKey[] = [...STYLE_KEYS, ...CONTENT_KEYS];

export const PART_KEYS: PartKey[] = ['style', 'content', 'shortcuts', 'commands', 'widgets'];

export const PART_LABELS: Record<PartKey, string> = {
    style: 'Styling',
    content: 'Content',
    shortcuts: 'Shortcuts',
    commands: 'Commands',
    widgets: 'Widgets'
};

export const ALL_PARTS: Parts = { style: true, content: true, shortcuts: true, commands: true, widgets: true };

export function pickSettings(source: Partial<Settings> | null | undefined, keys: SettingKey[]): Partial<Settings> {
    const picked: Record<string, unknown> = {};
    keys.forEach(key => {
        picked[key] = source && key in source ? source[key] : DEFAULT_SETTINGS[key];
    });
    return picked as Partial<Settings>;
}

export function assignSettings(source: Partial<Settings>, keys: SettingKey[]) {
    const target = settings as Record<string, unknown>;
    keys.forEach(key => {
        target[key] = key in source ? source[key] : DEFAULT_SETTINGS[key];
    });
}
