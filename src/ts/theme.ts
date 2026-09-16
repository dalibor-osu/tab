import { clamp, rgba, shade } from './color';
import { resolveFont } from './fonts';
import { DEFAULT_SETTINGS } from './settings';
import { THUMB_KEY, readRaw } from './storage';
import type { Settings } from './types';

export { FONTS, SYSTEM_STACK, getFont, resolveFont } from './fonts';

export const safeMode = /(^|[?&#])safe(=|&|#|$)/.test(location.search + location.hash);

export const themeStyle = document.createElement('style');
export const userStyle = document.createElement('style');

const themeVars: Record<string, string> = {};
let themeFlushQueued = false;

function flushThemeVars() {
    themeFlushQueued = false;
    const body = Object.entries(themeVars)
        .map(([name, value]) => `${name}: ${value};`)
        .join(' ');
    themeStyle.textContent = `:root { ${body} }`;
}

export function setVar(name: string, value: string | number) {
    themeVars[name] = String(value);
    if (!themeFlushQueued) {
        themeFlushQueued = true;
        queueMicrotask(flushThemeVars);
    }
}

export function applyCustomCss(text: string) {
    userStyle.textContent = safeMode ? '' : text;
}

export function ensurePreconnect(url: string) {
    if (!url.startsWith('https://fonts.googleapis.com/')) {
        return;
    }
    const origin = 'https://fonts.gstatic.com';
    if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
}

export function syncFontLink(linkId: string, url: string) {
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (url) {
        ensurePreconnect(url);
        if (!link) {
            link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        if (link.href !== url) {
            link.href = url;
        }
    } else if (link) {
        link.remove();
    }
}

export function applyFont(current: Settings) {
    const body = resolveFont(current.font, current.customFont, current.customFontUrl);
    syncFontLink('fontLink', body.url);
    setVar('--font-stack', body.stack);

    if (current.titleFont === 'inherit') {
        syncFontLink('titleFontLink', '');
        setVar('--title-font', 'inherit');
        return;
    }
    const title = resolveFont(current.titleFont, current.titleCustomFont, current.titleCustomFontUrl);
    syncFontLink('titleFontLink', title.url);
    setVar('--title-font', title.stack);
}

export function setBackgroundVar(source: string, fit: string) {
    setVar('--bg-image', source ? `url("${source.replace(/"/g, '%22')}")` : 'none');
    setVar('--bg-fit', fit);
}

export function applyEarlyBackground(current: Settings) {
    const thumb = current.bgFit === 'auto' ? '' : readRaw(THUMB_KEY);
    setBackgroundVar(thumb || '', current.bgFit);
}

export function applyThemeVars(current: Settings) {
    document.documentElement.classList.toggle('no-scrollbars', current.hideScrollbars);
    document.documentElement.classList.toggle('reduced-motion', current.reduceMotion);
    document.documentElement.classList.toggle('corner-visible', current.cornerVisible);
    setVar('--accent', current.accent);
    setVar('--accent-light', shade(current.accent, 0.3));
    setVar('--accent-dark', shade(current.accent, -0.2));
    setVar('--accent-soft', rgba(current.accent, 0.14));
    setVar('--shadow-color', rgba(current.accent, 0.35));
    setVar('--bg', current.bg);
    setVar('--text-primary', current.textPrimary);
    setVar('--text-secondary', current.textSecondary);
    setVar('--panel-bg', rgba(current.panelColor, current.panelAlpha));
    setVar('--panel-strong', rgba(current.panelColor, clamp(current.panelAlpha + 0.15, 0, 1)));
    setVar('--card-border', rgba(current.textPrimary, 0.14));
    setVar('--radius', current.radius + 'px');
    setVar('--card-blur', current.cardBlur + 'px');
    setVar('--font-scale', current.fontScale);
    setVar('--logo-size', (3 * current.logoScale).toFixed(2) + 'rem');
    setVar('--title-weight', current.titleWeight);
    setVar('--title-style', current.titleItalic ? 'italic' : 'normal');
    const titleStops =
        current.titleColorMode === 'solid'
            ? [current.titleColor, current.titleColor]
            : current.titleColorMode === 'gradient'
              ? [current.titleColor, current.titleColor2]
              : [shade(current.accent, 0.3), current.accent];
    setVar(
        '--title-fill',
        `linear-gradient(${current.titleGradientAngle}deg, ${titleStops[0]} 0%, ${titleStops[1]} 100%)`
    );
    setVar('--title-outline', current.titleOutline + 'px');
    setVar('--title-outline-color', current.titleOutlineColor);
    setVar('--title-card-bg', current.titleCard ? rgba(current.panelColor, current.panelAlpha) : 'transparent');
    setVar('--title-card-border', current.titleCard ? rgba(current.textPrimary, 0.14) : 'transparent');
    setVar('--title-card-blur', current.titleCard ? current.cardBlur + 'px' : '0px');
    setVar('--title-card-padding', current.titleCard ? '18px 36px' : '0');
    setVar('--bg-dim', current.dim);
    setVar('--bg-blur', current.blur + 'px');
    setVar('--bg-scale', current.scale);
    setVar('--bg-x', current.x + '%');
    setVar('--bg-y', current.y + '%');

    document.title = current.pageTitle.trim() || DEFAULT_SETTINGS.pageTitle;
}
