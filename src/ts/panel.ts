import { applyBackground, backgroundBlob, backgroundImage, formatBytes } from './background';
import type { Palette } from './background';
import {
    cssEditor,
    customEngineRow,
    customFontRow,
    customTitleFontRow,
    engineSelect,
    fontSelect,
    footerEl,
    imageHint,
    logoEl,
    presetsEl,
    searchInput,
    settingsZone,
    shortcutsTitleEl,
    subtitleEl,
    titleAngleRow,
    titleColor2Row,
    titleColorRow,
    titleFontSelect
} from './dom';
import { renderCommandList } from './commands';
import { clearStoredFiles, renderPresetList } from './presets';
import { ENGINES, getEngine } from './search';
import { DEFAULT_SETTINGS, LOOK_KEYS, customCss, saveSettings, setCustomCss, setSettings, settings } from './settings';
import {
    COMMANDS_KEY,
    CUSTOM_CSS_KEY,
    HISTORY_KEY,
    ICON_CACHE_KEY,
    INTRO_KEY,
    PRESETS_KEY,
    SETTINGS_KEY,
    STORAGE_KEY,
    WIDGETS_KEY,
    removeRaw
} from './storage';
import { FONTS, applyCustomCss, applyFont, applyThemeVars } from './theme';
import type { SettingKey } from './types';
import { broadcastWidgetTheme } from './widgets/external';
import { renderWidgetList, syncGridControls } from './widgets/render';

let panelReady = false;

type ControlElement = HTMLInputElement | HTMLSelectElement;

export const PRESETS: Array<Palette & { name: string }> = [
    {
        name: 'Nebula',
        accent: '#c44dff',
        bg: '#12121c',
        textPrimary: '#ffffff',
        textSecondary: '#9ca3af',
        panelColor: '#000000',
        panelAlpha: 0.35
    },
    {
        name: 'Ocean',
        accent: '#38bdf8',
        bg: '#071a29',
        textPrimary: '#ffffff',
        textSecondary: '#94a3b8',
        panelColor: '#000000',
        panelAlpha: 0.35
    },
    {
        name: 'Forest',
        accent: '#4ade80',
        bg: '#0b1d12',
        textPrimary: '#f0fdf4',
        textSecondary: '#9ca3af',
        panelColor: '#000000',
        panelAlpha: 0.35
    },
    {
        name: 'Ember',
        accent: '#fb7185',
        bg: '#200c0e',
        textPrimary: '#fff1f2',
        textSecondary: '#a8a29e',
        panelColor: '#000000',
        panelAlpha: 0.35
    },
    {
        name: 'Sand',
        accent: '#f59e0b',
        bg: '#1e190e',
        textPrimary: '#fefce8',
        textSecondary: '#a8a29e',
        panelColor: '#000000',
        panelAlpha: 0.35
    },
    {
        name: 'Mono',
        accent: '#e5e7eb',
        bg: '#141414',
        textPrimary: '#ffffff',
        textSecondary: '#9ca3af',
        panelColor: '#000000',
        panelAlpha: 0.4
    },
    {
        name: 'Daylight',
        accent: '#7c3aed',
        bg: '#eef2f7',
        textPrimary: '#0f172a',
        textSecondary: '#475569',
        panelColor: '#ffffff',
        panelAlpha: 0.55
    },
    {
        name: 'Paper',
        accent: '#0f766e',
        bg: '#f5f1e8',
        textPrimary: '#1c1917',
        textSecondary: '#57534e',
        panelColor: '#ffffff',
        panelAlpha: 0.6
    }
];

export const FORMAT: Partial<Record<SettingKey, (value: number) => string>> = {
    panelAlpha: v => Math.round(v * 100) + '%',
    cardBlur: v => v + 'px',
    radius: v => v + 'px',
    fontScale: v => Math.round(v * 100) + '%',
    logoScale: v => Math.round(v * 100) + '%',
    titleOutline: v => v + 'px',
    titleGradientAngle: v => v + '°',
    dim: v => Math.round(v * 100) + '%',
    blur: v => v + 'px',
    scale: v => v.toFixed(2) + '×',
    x: v => v + '%',
    y: v => v + '%'
};

export function applySettings() {
    applyThemeVars(settings);
    applyCustomCss(settings.customCssEnabled ? customCss : '');

    logoEl.textContent = settings.greeting;
    logoEl.dataset.text = settings.greeting;
    logoEl.hidden = !settings.greeting.trim();
    subtitleEl.textContent = settings.subtitle;
    subtitleEl.hidden = !settings.showSubtitle || !settings.subtitle.trim();
    shortcutsTitleEl.textContent = settings.shortcutsTitle;
    shortcutsTitleEl.hidden = !settings.showShortcutsTitle || !settings.shortcutsTitle.trim();
    if (footerEl) {
        footerEl.hidden = !settings.showFooter;
    }

    const engine = getEngine(settings.engine);
    searchInput.placeholder = engine.id === 'custom' ? 'Search…' : `Search ${engine.label}...`;

    applyFont(settings);
    applyBackground();
    Promise.resolve().then(broadcastWidgetTheme);
}

export function buildSelect(select: HTMLSelectElement, items: Array<{ id: string; label: string }>) {
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.label;
        select.appendChild(option);
    });
}

export function buildPresets() {
    PRESETS.forEach(preset => {
        const button = document.createElement('button');
        button.className = 'preset';
        button.type = 'button';
        button.title = preset.name;
        button.style.background = preset.bg;
        const dot = document.createElement('span');
        dot.style.background = preset.accent;
        button.appendChild(dot);
        button.addEventListener('click', () => {
            const { name, ...values } = preset;
            void name;
            setSettings({ ...settings, ...values });
            saveSettings();
            applySettings();
            syncControls();
        });
        presetsEl.appendChild(button);
    });
}

export function readControl(el: ControlElement): string | number | boolean {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        return el.checked;
    }
    if (el instanceof HTMLInputElement && el.type === 'range') {
        return parseFloat(el.value);
    }
    return el.value;
}

export function writeControl(el: ControlElement, value: unknown) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = Boolean(value);
    } else {
        el.value = String(value);
    }
}

export function preparePanel() {
    if (panelReady) {
        return;
    }
    panelReady = true;
    buildSelect(fontSelect, FONTS);
    buildSelect(titleFontSelect, [{ id: 'inherit', label: 'Same as text' }, ...FONTS]);
    buildSelect(engineSelect, ENGINES);
    buildPresets();
    bindControls();
    syncControls();
    renderCommandList();
    renderPresetList();
    renderWidgetList();
    syncGridControls();
}

export function openPanel() {
    preparePanel();
    settingsZone.classList.add('open');
}

export function togglePanel() {
    if (settingsZone.classList.contains('open')) {
        settingsZone.classList.remove('open');
    } else {
        openPanel();
    }
}

export function syncControls() {
    if (!panelReady) {
        return;
    }
    document.querySelectorAll<ControlElement>('[data-setting]').forEach(el => {
        const key = el.dataset.setting as SettingKey;
        writeControl(el, settings[key]);
    });
    document.querySelectorAll<HTMLElement>('[data-value]').forEach(el => {
        const key = el.dataset.value as SettingKey;
        const format = FORMAT[key];
        el.textContent = format ? format(Number(settings[key])) : String(settings[key]);
    });
    customFontRow.hidden = settings.font !== 'custom';
    customTitleFontRow.hidden = settings.titleFont !== 'custom';
    titleColorRow.hidden = settings.titleColorMode === 'accent';
    titleColor2Row.hidden = settings.titleColorMode !== 'gradient';
    titleAngleRow.hidden = settings.titleColorMode === 'solid';
    if (cssEditor.value !== customCss) {
        cssEditor.value = customCss;
    }
    customEngineRow.hidden = settings.engine !== 'custom';
    imageHint.textContent = backgroundBlob
        ? `A stored image is in use (${formatBytes(backgroundBlob.size)}).`
        : backgroundImage
          ? 'A stored image is in use.'
          : 'No image selected.';
}

export function bindControls() {
    document.querySelectorAll<ControlElement>('[data-setting]').forEach(el => {
        const isCheckbox = el instanceof HTMLInputElement && el.type === 'checkbox';
        const eventName = isCheckbox || el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            (settings as Record<string, unknown>)[el.dataset.setting as string] = readControl(el);
            saveSettings();
            applySettings();
            syncControls();
        });
    });
}

export function resetLook() {
    const target = settings as Record<string, unknown>;
    LOOK_KEYS.forEach(key => {
        target[key] = DEFAULT_SETTINGS[key];
    });
    setCustomCss('');
    saveSettings();
    applySettings();
    syncControls();
}

export async function resetAll() {
    if (!confirm('Remove all shortcuts and customization stored in this browser?')) {
        return;
    }
    removeRaw(SETTINGS_KEY);
    removeRaw(STORAGE_KEY);
    removeRaw(ICON_CACHE_KEY);
    removeRaw(HISTORY_KEY);
    removeRaw(INTRO_KEY);
    removeRaw(COMMANDS_KEY);
    removeRaw(CUSTOM_CSS_KEY);
    removeRaw(PRESETS_KEY);
    removeRaw(WIDGETS_KEY);
    await clearStoredFiles();
    location.reload();
}
