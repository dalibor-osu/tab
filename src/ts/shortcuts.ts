import {
    contextMenu,
    contextMenuTitle,
    modalOverlay,
    modalTitle,
    saveBtn,
    shortcutName,
    shortcutUrl,
    shortcutsGrid
} from './dom';
import { extensionApi } from './extension';
import { settings } from './settings';
import { ICON_CACHE_KEY, STORAGE_KEY, readStorage, removeRaw, writeStorage } from './storage';
import type { Shortcut } from './types';
import { openConfirm } from './ui';
import { WEBSITE_URL, getHostname, isLinkUrl, selfUrl } from './urls';

interface IconCacheEntry {
    src?: string;
    data?: string;
    failedAt?: number;
}

interface Reorder {
    el: HTMLElement;
    pointerId: number;
    grabX: number;
    grabY: number;
    lastX: number;
    lastY: number;
    home: DOMRect;
    active: boolean;
    slots?: Map<Element, DOMRect>;
}

type Timer = ReturnType<typeof setTimeout> | undefined;

export const LONG_PRESS_MS = 1000;
export const DOUBLE_TAP_MS = 300;
export const ICON_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export let shortcuts: Shortcut[] = [];
export let contextTarget = -1;
let longPress: Timer;
let lastPointerType = 'mouse';
let lastTap = { index: -1, time: 0 };
let tapTimer: Timer;
let editingIndex = -1;
let reorder: Reorder | null = null;
let suppressClick = false;
let iconCache: Record<string, IconCacheEntry> = {};

export function setShortcuts(next: Shortcut[]) {
    shortcuts = next;
}

export function defaultShortcuts(): Shortcut[] {
    return [{ name: 'Stuck here... forever?', url: BUILD_TARGET === 'ext' ? WEBSITE_URL : selfUrl() }];
}

export function sanitizeShortcuts(list: unknown): Shortcut[] {
    if (!Array.isArray(list)) {
        return [];
    }
    const result: Shortcut[] = [];
    list.forEach((entry: unknown) => {
        const item = entry as { name?: unknown; url?: unknown } | null;
        if (item && typeof item.name === 'string' && typeof item.url === 'string' && isLinkUrl(item.url)) {
            result.push({ name: item.name, url: item.url });
        }
    });
    return result;
}

export function loadShortcuts() {
    const stored = readStorage<unknown>(STORAGE_KEY, null);
    shortcuts = Array.isArray(stored) ? sanitizeShortcuts(stored) : defaultShortcuts();
    renderShortcuts();
}

export function saveShortcuts() {
    writeStorage(STORAGE_KEY, shortcuts);
}

export function getInitial(url: string): string {
    const hostname = getHostname(url);
    if (!hostname) {
        return 'W';
    }
    const label = hostname.replace(/^www\./, '').split('.')[0];
    return label.charAt(0).toUpperCase() || 'W';
}

export function iconSources(host: string): string[] {
    const sources: string[] = [];
    const api = extensionApi();
    if (api) {
        sources.push(api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent('https://' + host)}&size=32`));
    }
    sources.push(`https://${host}/favicon.ico`);
    if (settings.iconFallback) {
        sources.push(`https://icons.duckduckgo.com/ip3/${host}.ico`);
    }
    return sources;
}

export function loadIconCache() {
    const stored = readStorage<unknown>(ICON_CACHE_KEY, {});
    iconCache = stored && typeof stored === 'object' ? (stored as Record<string, IconCacheEntry>) : {};
}

export function saveIconCache() {
    if (!writeStorage(ICON_CACHE_KEY, iconCache)) {
        iconCache = {};
        removeRaw(ICON_CACHE_KEY);
    }
}

export function pruneIconCache() {
    const used = new Set(shortcuts.map(shortcut => getHostname(shortcut.url)));
    Object.keys(iconCache).forEach(host => {
        if (!used.has(host)) {
            delete iconCache[host];
        }
    });
    saveIconCache();
}

export function renderIcon(iconEl: HTMLElement | null, url: string) {
    const host = getHostname(url);
    if (!host || !iconEl) {
        return;
    }

    const cached = iconCache[host];
    if (cached?.data) {
        showIcon(iconEl, cached.data);
        return;
    }
    if (cached?.src) {
        const img = showIcon(iconEl, cached.src);
        img.onerror = () => {
            delete iconCache[host];
            saveIconCache();
            tryIconSource(iconEl, host, 0);
        };
        return;
    }
    if (cached?.failedAt && Date.now() - cached.failedAt < ICON_RETRY_MS) {
        return;
    }
    tryIconSource(iconEl, host, 0);
}

export function tryIconSource(iconEl: HTMLElement, host: string, index: number) {
    const sources = iconSources(host);
    if (index >= sources.length) {
        iconCache[host] = { failedAt: Date.now() };
        saveIconCache();
        return;
    }
    const img = new Image();
    img.onload = () => {
        showIcon(iconEl, sources[index]);
        iconCache[host] = { src: sources[index] };
        saveIconCache();
    };
    img.onerror = () => tryIconSource(iconEl, host, index + 1);
    img.src = sources[index];
}

export function showIcon(iconEl: HTMLElement, src: string): HTMLImageElement {
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.draggable = false;
    img.src = src;
    iconEl.textContent = '';
    iconEl.appendChild(img);
    iconEl.classList.add('has-icon');
    return img;
}

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function gridTiles(): HTMLElement[] {
    return [...shortcutsGrid.children] as HTMLElement[];
}

export function renderShortcuts() {
    shortcutsGrid.innerHTML = '';

    shortcuts.forEach((shortcut, index) => {
        const shortcutEl = document.createElement('div');
        shortcutEl.className = 'shortcut-item';
        shortcutEl.dataset.index = String(index);
        shortcutEl.innerHTML = `
        <div class="shortcut-icon">${getInitial(shortcut.url)}</div>
        <div class="shortcut-label">${escapeHtml(shortcut.name)}</div>
    `;

        shortcutEl.addEventListener('click', e => handleTileClick(index, shortcut, e));
        shortcutEl.addEventListener('auxclick', e => {
            if (e.button === 1) {
                e.preventDefault();
                openInNewTab(shortcut.url);
            }
        });
        shortcutEl.addEventListener('mousedown', e => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });
        shortcutEl.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (lastPointerType !== 'touch') {
                openContextMenu(index, e.clientX, e.clientY);
            }
        });
        shortcutEl.addEventListener('pointerdown', e => startPress(e, shortcutEl));
        shortcutEl.addEventListener('pointermove', e => trackPress(e, shortcutEl));
        shortcutEl.addEventListener('pointerup', finishReorder);
        shortcutEl.addEventListener('pointercancel', finishReorder);
        shortcutEl.addEventListener(
            'touchmove',
            e => {
                if (reorder && reorder.active) {
                    e.preventDefault();
                }
            },
            { passive: false }
        );

        shortcutsGrid.appendChild(shortcutEl);
        renderIcon(shortcutEl.querySelector<HTMLElement>('.shortcut-icon'), shortcut.url);
    });
}

export function openInNewTab(url: string) {
    if (!isLinkUrl(url)) {
        return;
    }
    const opened = window.open(url, '_blank');
    if (opened) {
        opened.opener = null;
    }
}

export function handleTileClick(index: number, shortcut: Shortcut, e?: MouseEvent) {
    if (suppressClick) {
        return;
    }
    if (e && (e.ctrlKey || e.metaKey)) {
        openInNewTab(shortcut.url);
        return;
    }
    if (lastPointerType === 'touch') {
        const now = Date.now();
        if (lastTap.index === index && now - lastTap.time < DOUBLE_TAP_MS) {
            clearTimeout(tapTimer);
            lastTap = { index: -1, time: 0 };
            const rect = shortcutsGrid.children[index].getBoundingClientRect();
            openContextMenu(index, rect.left + rect.width / 2, rect.top + rect.height / 2);
            return;
        }
        lastTap = { index, time: now };
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
            if (isLinkUrl(shortcut.url)) {
                window.location.href = shortcut.url;
            }
        }, DOUBLE_TAP_MS);
        return;
    }
    if (isLinkUrl(shortcut.url)) {
        window.location.href = shortcut.url;
    }
}

export function startPress(e: PointerEvent, el: HTMLElement) {
    lastPointerType = e.pointerType;
    if (e.button !== 0) {
        return;
    }
    if (e.pointerType === 'mouse') {
        e.preventDefault();
    }
    el.style.transition = 'none';
    el.style.transform = 'none';
    const rect = el.getBoundingClientRect();
    el.style.transform = '';
    el.style.transition = '';
    reorder = {
        el,
        pointerId: e.pointerId,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        lastX: e.clientX,
        lastY: e.clientY,
        home: rect,
        active: false
    };
    try {
        el.setPointerCapture(e.pointerId);
    } catch {}
    clearTimeout(longPress);
    longPress = setTimeout(() => {
        if (!reorder || reorder.el !== el || reorder.active) {
            return;
        }
        reorder.active = true;
        reorder.slots = tileRects(el);
        el.classList.add('lifting');
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }
        moveDragged(reorder.lastX, reorder.lastY);
    }, LONG_PRESS_MS);
}

export function trackPress(e: PointerEvent, el: HTMLElement) {
    if (!reorder || reorder.el !== el) {
        return;
    }
    reorder.lastX = e.clientX;
    reorder.lastY = e.clientY;
    if (!reorder.active) {
        return;
    }
    moveDragged(e.clientX, e.clientY);
}

export function openContextMenu(index: number, x: number, y: number) {
    contextTarget = index;
    contextMenuTitle.textContent = shortcuts[index].name;
    contextMenu.hidden = false;
    const rect = contextMenu.getBoundingClientRect();
    contextMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
    contextMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
}

export function hideContextMenu() {
    contextMenu.hidden = true;
    contextTarget = -1;
}

export function tileRects(excluded: Element | null): Map<Element, DOMRect> {
    const rects = new Map<Element, DOMRect>();
    gridTiles().forEach(el => {
        if (el !== excluded) {
            rects.set(el, el.getBoundingClientRect());
        }
    });
    return rects;
}

export function slideTiles(before: Map<Element, DOMRect>, excluded: Element): Map<Element, DOMRect> {
    const others = gridTiles().filter(el => el !== excluded);
    others.forEach(el => {
        el.style.transition = 'none';
        el.style.transform = '';
    });
    const after = tileRects(excluded);
    const moved: HTMLElement[] = [];
    others.forEach(el => {
        const from = before.get(el);
        const to = after.get(el);
        if (!from || !to) {
            return;
        }
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (dx || dy) {
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            moved.push(el);
        }
    });
    void shortcutsGrid.offsetHeight;
    moved.forEach(el => {
        el.style.transition = 'transform 0.25s ease';
        el.style.transform = '';
    });
    return after;
}

export function moveDragged(clientX: number, clientY: number) {
    if (!reorder) {
        return;
    }
    const drag = reorder;
    const { el } = drag;
    const target = gridTiles().find(other => {
        const slot = drag.slots?.get(other);
        if (other === el || !slot) {
            return false;
        }
        return clientX >= slot.left && clientX <= slot.right && clientY >= slot.top && clientY <= slot.bottom;
    });

    if (target) {
        const before = tileRects(el);
        const items = gridTiles();
        const forward = items.indexOf(target) > items.indexOf(el);
        shortcutsGrid.insertBefore(el, forward ? target.nextSibling : target);
        el.style.transition = 'none';
        el.style.transform = '';
        drag.home = el.getBoundingClientRect();
        drag.slots = slideTiles(before, el);
    }

    const dx = clientX - drag.grabX - drag.home.left;
    const dy = clientY - drag.grabY - drag.home.top;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
}

export function finishReorder() {
    clearTimeout(longPress);
    if (!reorder) {
        return;
    }
    const { el, active } = reorder;
    reorder = null;
    if (!active) {
        return;
    }
    suppressClick = true;
    el.classList.remove('lifting');
    el.style.transition = 'transform 0.25s ease';
    el.style.transform = '';
    setTimeout(() => {
        suppressClick = false;
        commitOrder();
    }, 260);
}

export function commitOrder() {
    const order = gridTiles().map(el => Number(el.dataset.index));
    if (order.some((value, position) => value !== position)) {
        shortcuts = order.map(position => shortcuts[position]);
        saveShortcuts();
    }
    renderShortcuts();
}

export function deleteShortcut(index: number) {
    openConfirm('Remove shortcut?', `"${shortcuts[index].name}" will be removed from your shortcuts.`, 'Remove', () => {
        shortcuts.splice(index, 1);
        saveShortcuts();
        pruneIconCache();
        renderShortcuts();
    });
}

export function openModal(index?: number) {
    editingIndex = typeof index === 'number' ? index : -1;
    const editing = editingIndex >= 0;
    modalTitle.textContent = editing ? 'Edit Shortcut' : 'Add New Shortcut';
    saveBtn.textContent = editing ? 'Save changes' : 'Save';
    shortcutName.value = editing ? shortcuts[editingIndex].name : '';
    shortcutUrl.value = editing ? shortcuts[editingIndex].url : '';
    modalOverlay.classList.add('active');
    setTimeout(() => shortcutName.focus(), 100);
}

export function closeModal() {
    editingIndex = -1;
    modalOverlay.classList.remove('active');
}

export function saveNewShortcut() {
    const name = shortcutName.value.trim();
    const url = shortcutUrl.value.trim();
    if (!name || !url) {
        return;
    }

    const finalUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url;
    if (!isLinkUrl(finalUrl)) {
        shortcutUrl.focus();
        return;
    }

    if (editingIndex >= 0) {
        shortcuts[editingIndex] = { name, url: finalUrl };
    } else {
        shortcuts.push({ name, url: finalUrl });
    }
    saveShortcuts();
    pruneIconCache();
    renderShortcuts();
    closeModal();
}
