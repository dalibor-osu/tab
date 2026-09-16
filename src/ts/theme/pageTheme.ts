import { rgba, shade } from '../core/color';
import { resolveFont } from './fonts';
import { SETTINGS_KEY, readStorage } from '../core/storage';
import type { Settings } from '../core/types';

type StoredSettings = Partial<Settings> & { bgStart?: string };

export function applyStoredTheme() {
    const settings = readStorage<StoredSettings | null>(SETTINGS_KEY, null);
    if (!settings) {
        return;
    }

    const root = document.documentElement.style;
    if (settings.accent) {
        root.setProperty('--accent', settings.accent);
        root.setProperty('--accent-light', shade(settings.accent, 0.3));
        root.setProperty('--accent-dark', shade(settings.accent, -0.2));
        root.setProperty('--shadow-color', rgba(settings.accent, 0.35));
    }
    const bg = settings.bg || settings.bgStart;
    if (bg) {
        root.setProperty('--bg', bg);
    }
    if (settings.textPrimary) {
        root.setProperty('--text-primary', settings.textPrimary);
        root.setProperty('--card-border', rgba(settings.textPrimary, 0.14));
    }
    if (settings.textSecondary) {
        root.setProperty('--text-secondary', settings.textSecondary);
    }
    if (settings.panelColor && settings.panelAlpha != null) {
        root.setProperty('--panel-bg', rgba(settings.panelColor, settings.panelAlpha));
    }
    if (settings.radius != null) {
        root.setProperty('--radius', settings.radius + 'px');
    }
    if (settings.cardBlur != null) {
        root.setProperty('--card-blur', settings.cardBlur + 'px');
    }
    if (settings.fontScale) {
        root.setProperty('--font-scale', String(settings.fontScale));
    }

    const font = resolveFont(settings.font || 'system', settings.customFont || '', settings.customFontUrl || '');
    if (font.url) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = font.url;
        document.head.appendChild(link);
    }
    root.setProperty('--font-stack', font.stack);
}
