import { widgetGrantBtn, widgetGrantHint, widgetGrantRow, widgetHosts } from '../dom';
import { extensionApi, hasDirectAccess, hostOrigins, permissionsApi } from '../extension';
import { openInNewTab } from '../shortcuts';
import type { WidgetItem } from '../types';
import { showToast } from '../ui';
import { isHostName, isWebUrl, parseHosts } from '../urls';
import { showWidgetError } from './editor';
import { WIDGET_DATA_MAX, WIDGET_FETCH_MAX, saveWidgets, widgetHtml } from './model';
import { mountedWidgets } from './render';

export interface WidgetTarget {
    id: string;
    el: HTMLElement;
    frame: HTMLIFrameElement;
}

export interface WidgetTheme {
    vars: Record<string, string>;
}

type Message = Record<string, unknown>;

export const WIDGET_CSP =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
    "img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; " +
    "form-action 'none'; base-uri 'none'";

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

export function widgetBridge() {
    const host = window.parent;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    let seq = 0;
    const send = (message: Record<string, unknown>) => host.postMessage({ source: 'tab-widget', ...message }, '*');
    const request = (type: string, payload: Record<string, unknown>) =>
        new Promise<unknown>((resolve, reject) => {
            const id = ++seq;
            pending.set(id, { resolve, reject });
            send({ type, id, ...payload });
        });
    const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent('tab:' + name, { detail }));
    const tab = {
        theme: { vars: {} as Record<string, string> },
        size: { width: 0, height: 0 },
        data: null as unknown,
        config: {} as Record<string, unknown>,
        storage: {
            get: () => request('storage.get', {}),
            set: (value: unknown) => request('storage.set', { value })
        },
        fetch: (url: string, init?: Record<string, unknown>) => request('fetch', { url, init: init || {} }),
        open: (url: string) => send({ type: 'open', url }),
        on: (name: string, handler: (detail: unknown) => void) =>
            window.addEventListener('tab:' + name, event => handler((event as CustomEvent).detail))
    };
    const applyTheme = (theme: { vars?: Record<string, string> }) => {
        tab.theme = { vars: theme.vars || {} };
        Object.entries(theme.vars || {}).forEach(([name, value]) => {
            document.documentElement.style.setProperty(name, value);
        });
    };
    window.addEventListener('message', event => {
        const message = event.data as Record<string, unknown> | null;
        if (event.source !== host || !message || message.source !== 'tab-host') {
            return;
        }
        if (message.type === 'init') {
            applyTheme(message.theme as { vars?: Record<string, string> });
            tab.size = message.size as { width: number; height: number };
            tab.data = message.data;
            tab.config = (message.config as Record<string, unknown>) || {};
            emit('init', tab);
        } else if (message.type === 'config') {
            tab.config = (message.config as Record<string, unknown>) || {};
            emit('config', tab.config);
        } else if (message.type === 'theme') {
            applyTheme(message.theme as { vars?: Record<string, string> });
            emit('theme', message.theme);
        } else if (message.type === 'resize') {
            tab.size = message.size as { width: number; height: number };
            emit('resize', message.size);
        } else if (message.type === 'reply') {
            const waiting = pending.get(message.id as number);
            if (!waiting) {
                return;
            }
            pending.delete(message.id as number);
            if (message.error) {
                waiting.reject(new Error(String(message.error)));
            } else {
                waiting.resolve(message.result);
            }
        }
    });
    (window as unknown as { tab: unknown }).tab = tab;
    send({ type: 'ready' });
}

export function wrapWidgetDocument(item: WidgetItem): string {
    const vars = widgetTheme().vars;
    const themeCss = Object.entries(vars)
        .map(([name, value]) => `${name}:${value}`)
        .join(';');
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">` +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        `<style>:root{${themeCss}}html,body{margin:0;height:100%;overflow:hidden}` +
        'body{box-sizing:border-box;font-family:var(--font-stack);color:var(--text-primary)}*{box-sizing:inherit}</style>' +
        '<scr' +
        `ipt>(${widgetBridge.toString()})();</scr` +
        'ipt></head><body>' +
        widgetHtml(item) +
        '</body></html>'
    );
}

export function postToWidget(frame: HTMLIFrameElement | null, message: Message) {
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ source: 'tab-host', ...message }, '*');
    }
}

export function loadWidgetFrame(frame: HTMLIFrameElement, item: WidgetItem) {
    frame.classList.remove('ready');
    const html = wrapWidgetDocument(item);
    const api = extensionApi();
    if (!api) {
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
