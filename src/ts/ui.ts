import { confirmDeleteBtn, confirmOverlay, confirmText, confirmTitle, introTip, settingsZone, toast } from './dom';
import { openPanel } from './panel';
import { INTRO_KEY, writeRaw } from './storage';

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let pendingConfirm: (() => void) | null = null;
let confirmReopensPanel = false;

export function openConfirm(title: string, text: string, label: string, action: () => void) {
    pendingConfirm = action;
    confirmReopensPanel = settingsZone.classList.contains('open');
    settingsZone.classList.remove('open');
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmDeleteBtn.textContent = label;
    confirmOverlay.classList.add('active');
    setTimeout(() => confirmDeleteBtn.focus(), 100);
}

export function closeConfirm() {
    pendingConfirm = null;
    confirmOverlay.classList.remove('active');
    if (confirmReopensPanel) {
        confirmReopensPanel = false;
        openPanel();
    }
}

export function confirmDelete() {
    const action = pendingConfirm;
    closeConfirm();
    if (action) {
        action();
    }
}

export function downloadFile(name: string, content: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showModal(overlay: HTMLElement) {
    settingsZone.classList.remove('open');
    overlay.classList.add('active');
}

export function hideModal(overlay: HTMLElement) {
    overlay.classList.remove('active');
    openPanel();
}

export function countOf(total: number, singular: string, plural: string): string {
    return `${total} ${total === 1 ? singular : plural}`;
}

export function cloneData<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export function newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function showToast(message: string) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.hidden = true;
    }, 6000);
}

export function showIntroTip() {
    introTip.hidden = false;
    settingsZone.classList.add('hint');
}

export function hideIntroTip() {
    introTip.hidden = true;
    settingsZone.classList.remove('hint');
    writeRaw(INTRO_KEY, '1');
}

export const CROSS_ICON =
    '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M4 4l8 8M12 4l-8 8" /></svg>';

export const PENCIL_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 21.5 2 23l1.5-5.5L17 3z" stroke-width="3" stroke-linejoin="round" /></svg>';

export const OVERWRITE_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>';
