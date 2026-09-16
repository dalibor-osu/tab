import { widgetGrantBtn, widgetGrantHint, widgetGrantRow, widgetHosts } from '../core/dom';
import { extensionApi, hasDirectAccess, hostOrigins, isFirefox, permissionsApi } from '../core/extension';
import { widgetDocument } from '../sandbox/frames';
import { openInNewTab } from '../features/shortcuts';
import type { WidgetItem } from '../core/types';
import { showToast } from '../core/ui';
import { isHostName, isWebUrl, parseHosts } from '../core/urls';
import { showWidgetError } from './editor';
import { WIDGET_DATA_MAX, WIDGET_FETCH_MAX, saveWidgets, widgetHtml } from './model';
import { markWidgetReady, mountedWidgets } from './render';

export interface WidgetTarget {
    id: string;
    el: HTMLElement;
    frame: HTMLIFrameElement;
}

export interface WidgetTheme {
    vars: Record<string, string>;
}

type Message = Record<string, unknown>;

export const THEME_VARS = [
    '--accent',
    '--accent-light',
    '--accent-dark',
    '--accent-soft',
    '--bg',
    '--text-primary',
    '--text-secondary',
    '--panel-bg',
    '--panel-strong',
    '--card-border',
    '--radius',
    '--font-stack'
];

export const widgetDocs = new Map<string, string>();

export function widgetSize(el: HTMLElement): { width: number; height: number } {
    return { width: el.clientWidth, height: el.clientHeight };
}

export function widgetTheme(): WidgetTheme {
    const computed = getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};
    THEME_VARS.forEach(name => {
        vars[name] = computed.getPropertyValue(name).trim();
    });
    return { vars };
}

export function postToWidget(frame: HTMLIFrameElement | null, message: Message) {
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ source: 'tab-host', ...message }, '*');
    }
}

export function wrapWidgetDocument(item: WidgetItem): string {
    const themeCss = Object.entries(widgetTheme().vars)
        .map(([name, value]) => `${name}:${value}`)
        .join(';');
    return widgetDocument(widgetHtml(item), themeCss);
}

export function loadWidgetFrame(frame: HTMLIFrameElement, item: WidgetItem) {
    frame.classList.remove('ready');
    const html = wrapWidgetDocument(item);
    const api = extensionApi();
    if (!api || isFirefox()) {
        widgetDocs.delete(item.id);
        frame.srcdoc = html;
        return;
    }
    widgetDocs.set(item.id, html);
    frame.src = api.runtime.getURL('sandbox.html') + '?w=' + encodeURIComponent(item.id) + '&t=' + Date.now();
}

export function widgetForSource(source: MessageEventSource | null): WidgetTarget | null {
    for (const [id, el] of mountedWidgets) {
        const frame = el.querySelector('iframe');
        if (frame && frame.contentWindow === source) {
            return { id, el, frame };
        }
    }
    return null;
}

interface FetchResult {
    ok: boolean;
    status: number;
    contentType: string;
    text: string;
}

export async function proxyFetch(hosts: string[], url: unknown, init: unknown): Promise<FetchResult> {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
        throw new Error('Only https URLs can be fetched.');
    }
    const host = new URL(url).hostname.toLowerCase();
    if (!hosts.some(allowed => host === allowed || host.endsWith('.' + allowed))) {
        throw new Error(`Host ${host} is not allowed for this widget.`);
    }
    const options = (init && typeof init === 'object' ? init : {}) as Record<string, unknown>;
    const method = String(options.method || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
    const headers: Record<string, string> = {};
    const rawHeaders = options.headers && typeof options.headers === 'object' ? options.headers : {};
    Object.entries(rawHeaders as Record<string, unknown>).forEach(([name, value]) => {
        if (/^(accept|content-type)$/i.test(name) && typeof value === 'string') {
            headers[name] = value;
        }
    });
    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers,
            body: method === 'POST' && typeof options.body === 'string' ? options.body : undefined,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store'
        });
    } catch {
        throw new Error(fetchBlockedMessage(host));
    }
    const body = await response.text();
    if (body.length > WIDGET_FETCH_MAX) {
        throw new Error('The response is larger than 1 MB.');
    }
    return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        text: body
    };
}

export function fetchBlockedMessage(host: string): string {
    if (extensionApi()) {
        return `${host} could not be reached. If the site blocks cross-origin requests, open this widget's settings and allow the extension to reach it directly.`;
    }
    return `${host} could not be reached. The site has to allow cross-origin requests (CORS); the extension can be granted direct access instead.`;
}

export async function syncGrantRow() {
    const hosts = parseHosts(widgetHosts.value).filter(isHostName);
    widgetGrantRow.hidden = !permissionsApi() || !hosts.length;
    if (widgetGrantRow.hidden) {
        return;
    }
    const granted = await hasDirectAccess(hosts);
    widgetGrantBtn.hidden = granted;
    widgetGrantHint.textContent = granted
        ? 'The extension can reach these hosts directly, so they do not need to allow cross-origin requests.'
        : 'Sites that block cross-origin requests only work if the extension may reach them directly. Chromium asks you to confirm.';
}

export async function grantDirectAccess() {
    const hosts = parseHosts(widgetHosts.value).filter(isHostName);
    const permissions = permissionsApi();
    if (!permissions || !hosts.length) {
        return;
    }
    try {
        if (!(await permissions.request({ origins: hostOrigins(hosts) }))) {
            showToast('Direct access was not granted.');
        }
    } catch (error) {
        showWidgetError(error instanceof Error ? error.message : String(error));
    }
    await syncGrantRow();
}

export async function handleWidgetMessage(target: WidgetTarget, item: WidgetItem, message: Message) {
    const reply = (result: unknown, error?: string) =>
        postToWidget(target.frame, { type: 'reply', id: message.id, result, error });
    if (message.type === 'ready') {
        target.frame.classList.add('ready');
        markWidgetReady(target.id);
        postToWidget(target.frame, {
            type: 'init',
            theme: widgetTheme(),
            size: widgetSize(target.el),
            data: item.settings.data,
            config: item.settings.config
        });
    } else if (message.type === 'storage.get') {
        reply(item.settings.data);
    } else if (message.type === 'storage.set') {
        const json = JSON.stringify(message.value === undefined ? null : message.value);
        if (json.length > WIDGET_DATA_MAX) {
            reply(null, 'Widget storage is limited to 64 KB.');
            return;
        }
        item.settings.data = JSON.parse(json);
        saveWidgets();
        reply(true);
    } else if (message.type === 'fetch') {
        try {
            reply(await proxyFetch(item.settings.hosts, message.url, message.init));
        } catch (error) {
            reply(null, error instanceof Error && error.message ? error.message : 'The request failed.');
        }
    } else if (message.type === 'open' && typeof message.url === 'string' && isWebUrl(message.url)) {
        openInNewTab(message.url);
    }
}

export function broadcastWidgetTheme() {
    if (!mountedWidgets.size) {
        return;
    }
    const theme = widgetTheme();
    mountedWidgets.forEach(el => {
        postToWidget(el.querySelector('iframe'), { type: 'theme', theme });
    });
}

export const widgetResizeObserver = new ResizeObserver(entries => {
    entries.forEach(entry => {
        const el = entry.target as HTMLElement;
        postToWidget(el.querySelector('iframe'), { type: 'resize', size: widgetSize(el) });
    });
});
