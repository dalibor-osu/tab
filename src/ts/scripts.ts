import { commands } from './commands';
import { extensionApi, permissionsApi } from './extension';
import { applySettings, syncControls } from './panel';
import { clearHistory, performSearch, rememberSearch, searchHistory } from './search';
import { DEFAULT_SETTINGS, PRESET_KEYS, pickSettings, saveSettings, setSettings, settings } from './settings';
import { openInNewTab, renderShortcuts, sanitizeShortcuts, saveShortcuts, setShortcuts, shortcuts } from './shortcuts';
import type { Capability, ScriptCommand } from './types';
import { cloneData, newId, showToast } from './ui';
import { isWebUrl } from './urls';
import { WIDGET_CSP, proxyFetch } from './widgets/external';
import {
    findWidget,
    sanitizeWidgetConfig,
    saveWidgets,
    widgetHtml,
    widgetManifest,
    widgetsState
} from './widgets/model';
import { renderWidgetList, renderWidgets } from './widgets/render';

export interface CapabilityInfo {
    label: string;
    detail: string;
    extension: boolean;
    permission: string | null;
}

export interface ScriptRun {
    id: string;
    command: ScriptCommand;
    frame: HTMLIFrameElement;
    html: string;
    timer: ReturnType<typeof setTimeout>;
}

type Message = Record<string, unknown>;

export const SCRIPT_TIMEOUT_MS = 60000;
export const scriptRuns = new Map<string, ScriptRun>();

export const CAPABILITIES: Record<Capability, CapabilityInfo> = {
    settings: {
        label: 'Settings',
        detail: 'read and change the look and content settings',
        extension: false,
        permission: null
    },
    shortcuts: { label: 'Shortcuts', detail: 'list, add and remove shortcuts', extension: false, permission: null },
    commands: {
        label: 'Commands',
        detail: 'list the other commands (names and descriptions only)',
        extension: false,
        permission: null
    },
    history: {
        label: 'Search history',
        detail: 'read, add to and clear the search history',
        extension: false,
        permission: null
    },
    widgets: {
        label: 'Widgets',
        detail: 'list widgets and change their settings',
        extension: false,
        permission: null
    },
    clipboard: {
        label: 'Clipboard',
        detail: 'copy text and read what is on the clipboard',
        extension: false,
        permission: 'clipboardRead'
    },
    tabs: {
        label: 'Browser tabs',
        detail: 'list, open, switch to and close tabs',
        extension: true,
        permission: 'tabs'
    },
    bookmarks: { label: 'Bookmarks', detail: 'search and add bookmarks', extension: true, permission: 'bookmarks' }
};

export function isCapability(value: unknown): value is Capability {
    return typeof value === 'string' && value in CAPABILITIES;
}

export function availableCapabilities(): Capability[] {
    const extension = Boolean(extensionApi());
    return (Object.keys(CAPABILITIES) as Capability[]).filter(key => extension || !CAPABILITIES[key].extension);
}

type Permission = chrome.runtime.ManifestPermission;

export function neededPermissions(grants: Capability[]): Permission[] {
    return grants
        .map(grant => CAPABILITIES[grant].permission)
        .filter((name): name is string => Boolean(name)) as Permission[];
}

export async function requestGrantPermissions(grants: Capability[]): Promise<boolean> {
    const permissions = permissionsApi();
    const names = neededPermissions(grants);
    if (!permissions || !names.length) {
        return true;
    }
    try {
        return await permissions.request({ permissions: names });
    } catch {
        return false;
    }
}

export function scriptBridge(args: string) {
    const host = window.parent;
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    let seq = 0;
    const send = (message: Record<string, unknown>) => host.postMessage({ source: 'tab-script', ...message }, '*');
    const request = (type: string, params: unknown[]) =>
        new Promise<unknown>((resolve, reject) => {
            const id = ++seq;
            pending.set(id, { resolve, reject });
            send({ type, id, params });
        });
    const remote = (space: string, methods: string[]) => {
        const api: Record<string, (...params: unknown[]) => Promise<unknown>> = {};
        methods.forEach(method => {
            api[method] = (...params: unknown[]) => request(space + '.' + method, params);
        });
        return api;
    };
    const describe = (error: unknown) =>
        error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
    window.addEventListener('message', event => {
        const message = event.data as Record<string, unknown> | null;
        if (event.source !== host || !message || message.source !== 'tab-host' || message.type !== 'reply') {
            return;
        }
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
    });
    window.addEventListener('error', event => send({ type: 'error', message: event.message }));
    window.addEventListener('unhandledrejection', event => send({ type: 'error', message: describe(event.reason) }));
    (window as unknown as { tab: unknown }).tab = {
        args,
        open: (url: string) => send({ type: 'open', url }),
        search: (text: string, newTab?: boolean) => send({ type: 'search', text, newTab: Boolean(newTab) }),
        toast: (text: string) => send({ type: 'toast', text }),
        copy: (text: string) => request('clipboard.copy', [text]),
        paste: () => request('clipboard.paste', []),
        fetch: (url: string, init?: Record<string, unknown>) => request('fetch', [url, init || {}]),
        settings: remote('settings', ['get', 'set']),
        shortcuts: remote('shortcuts', ['list', 'add', 'remove']),
        commands: remote('commands', ['list']),
        history: remote('history', ['list', 'add', 'clear']),
        widgets: remote('widgets', ['list', 'update']),
        tabs: remote('tabs', ['list', 'open', 'activate', 'close']),
        bookmarks: remote('bookmarks', ['search', 'add']),
        done: (value: unknown) => {
            try {
                send({ type: 'done', value });
            } catch {
                send({ type: 'done', value: String(value) });
            }
        },
        fail: (error: unknown) => send({ type: 'error', message: describe(error) })
    };
}

export function wrapScriptDocument(command: ScriptCommand, args: string): string {
    const code = command.code.replace(/<\/script/gi, '<\\/script');
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        `<meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}">` +
        '<scr' +
        `ipt>(${scriptBridge.toString()})(${JSON.stringify(args)});</scr` +
        'ipt><scr' +
        `ipt>(async () => {\n${code}\n})().then(value => tab.done(value), error => tab.fail(error));</scr` +
        'ipt></head><body></body></html>'
    );
}

export function runScript(command: ScriptCommand, args: string) {
    const id = newId();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.hidden = true;
    frame.title = 'Script command';
    const run: ScriptRun = {
        id,
        command,
        frame,
        html: wrapScriptDocument(command, args),
        timer: setTimeout(() => finishScript(id, `/${command.name} was stopped after 60 seconds.`), SCRIPT_TIMEOUT_MS)
    };
    scriptRuns.set(id, run);
    document.body.appendChild(frame);
    const api = extensionApi();
    if (api) {
        frame.src = api.runtime.getURL('sandbox.html') + '?w=' + encodeURIComponent('script-' + id);
    } else {
        frame.srcdoc = run.html;
    }
}

export function finishScript(id: string, notice?: string) {
    const run = scriptRuns.get(id);
    if (!run) {
        return;
    }
    clearTimeout(run.timer);
    run.frame.remove();
    scriptRuns.delete(id);
    if (notice) {
        showToast(notice);
    }
}

export function scriptForSource(source: MessageEventSource | null): ScriptRun | null {
    for (const run of scriptRuns.values()) {
        if (run.frame.contentWindow === source) {
            return run;
        }
    }
    return null;
}

export function postToScript(run: ScriptRun, message: Message) {
    if (run.frame.contentWindow) {
        run.frame.contentWindow.postMessage({ source: 'tab-host', ...message }, '*');
    }
}

function describeValue(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function requireGrant(run: ScriptRun, capability: Capability) {
    if (!run.command.grants.includes(capability)) {
        throw new Error(
            `/${run.command.name} may not use ${CAPABILITIES[capability].label.toLowerCase()}. Tick it in the command's settings.`
        );
    }
}

async function ensurePermission(capability: Capability) {
    const permissions = permissionsApi();
    const name = CAPABILITIES[capability].permission;
    if (!permissions || !name) {
        return;
    }
    if (!(await permissions.contains({ permissions: [name as Permission] }))) {
        throw new Error(`The extension was not allowed to use ${name}. Save the command again and allow it.`);
    }
}

function requireExtension(capability: Capability): typeof chrome {
    const api = extensionApi();
    if (!api) {
        throw new Error(`${CAPABILITIES[capability].label} are available in the extension only.`);
    }
    return api;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

async function settingsCall(method: string, params: unknown[]): Promise<unknown> {
    if (method === 'get') {
        return pickSettings(settings, PRESET_KEYS);
    }
    if (method === 'set') {
        const source = (params[0] && typeof params[0] === 'object' ? params[0] : {}) as Record<string, unknown>;
        const next = { ...settings } as Record<string, unknown>;
        let changed = 0;
        PRESET_KEYS.forEach(key => {
            if (key in source && typeof source[key] === typeof DEFAULT_SETTINGS[key]) {
                next[key] = source[key];
                changed++;
            }
        });
        if (!changed) {
            throw new Error('No known settings were given.');
        }
        setSettings(next as typeof settings);
        saveSettings();
        applySettings();
        syncControls();
        return pickSettings(settings, PRESET_KEYS);
    }
    throw new Error(`Unknown settings method ${method}.`);
}

async function shortcutsCall(method: string, params: unknown[]): Promise<unknown> {
    if (method === 'list') {
        return cloneData(shortcuts);
    }
    if (method === 'add') {
        const added = sanitizeShortcuts([{ name: params[0], url: params[1] }]);
        if (!added.length) {
            throw new Error('A shortcut needs a name and an http(s) URL.');
        }
        shortcuts.push(added[0]);
        saveShortcuts();
        renderShortcuts();
        return shortcuts.length;
    }
    if (method === 'remove') {
        const name = text(params[0]).toLowerCase();
        const kept = shortcuts.filter(item => item.name.toLowerCase() !== name);
        const removed = shortcuts.length - kept.length;
        if (removed) {
            setShortcuts(kept);
            saveShortcuts();
            renderShortcuts();
        }
        return removed;
    }
    throw new Error(`Unknown shortcuts method ${method}.`);
}

async function historyCall(method: string, params: unknown[]): Promise<unknown> {
    if (method === 'list') {
        return [...searchHistory];
    }
    if (method === 'add') {
        const entry = text(params[0]).trim();
        if (!entry) {
            throw new Error('Nothing to add to the history.');
        }
        rememberSearch(entry);
        return searchHistory.length;
    }
    if (method === 'clear') {
        clearHistory();
        return true;
    }
    throw new Error(`Unknown history method ${method}.`);
}

async function widgetsCall(method: string, params: unknown[]): Promise<unknown> {
    if (method === 'list') {
        return widgetsState.items.map(item => ({
            id: item.id,
            type: item.type,
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            card: item.card,
            config: cloneData(item.settings.config)
        }));
    }
    if (method === 'update') {
        const item = findWidget(text(params[0]));
        if (!item) {
            throw new Error('No widget has that id.');
        }
        const patch = (params[1] && typeof params[1] === 'object' ? params[1] : {}) as Record<string, unknown>;
        item.settings.config = sanitizeWidgetConfig(widgetManifest(widgetHtml(item)), {
            ...item.settings.config,
            ...patch
        });
        saveWidgets();
        renderWidgets();
        renderWidgetList();
        return cloneData(item.settings.config);
    }
    throw new Error(`Unknown widgets method ${method}.`);
}

async function clipboardCall(method: string, params: unknown[]): Promise<unknown> {
    if (method === 'copy') {
        try {
            await navigator.clipboard.writeText(text(params[0]));
            return true;
        } catch {
            throw new Error('Copying to the clipboard was not allowed.');
        }
    }
    if (method === 'paste') {
        try {
            return await navigator.clipboard.readText();
        } catch {
            throw new Error('Reading the clipboard was not allowed.');
        }
    }
    throw new Error(`Unknown clipboard method ${method}.`);
}

async function tabsCall(method: string, params: unknown[]): Promise<unknown> {
    const api = requireExtension('tabs');
    await ensurePermission('tabs');
    if (method === 'list') {
        const tabs = await api.tabs.query({});
        return tabs.map(tab => ({
            id: tab.id,
            title: tab.title || '',
            url: tab.url || '',
            active: tab.active,
            windowId: tab.windowId
        }));
    }
    if (method === 'open') {
        const url = text(params[0]);
        if (!isWebUrl(url)) {
            throw new Error('Only http(s) URLs can be opened.');
        }
        const tab = await api.tabs.create({ url });
        return tab.id;
    }
    if (method === 'activate') {
        const tab = await api.tabs.update(Number(params[0]), { active: true });
        if (tab && tab.windowId != null) {
            await api.windows.update(tab.windowId, { focused: true });
        }
        return true;
    }
    if (method === 'close') {
        await api.tabs.remove(Number(params[0]));
        return true;
    }
    throw new Error(`Unknown tabs method ${method}.`);
}

async function bookmarksCall(method: string, params: unknown[]): Promise<unknown> {
    const api = requireExtension('bookmarks');
    await ensurePermission('bookmarks');
    if (method === 'search') {
        const found = await api.bookmarks.search(text(params[0]));
        return found.filter(node => node.url).map(node => ({ id: node.id, title: node.title, url: node.url }));
    }
    if (method === 'add') {
        const url = text(params[1]);
        if (!isWebUrl(url)) {
            throw new Error('Only http(s) URLs can be bookmarked.');
        }
        const node = await api.bookmarks.create({ title: text(params[0]) || url, url });
        return node.id;
    }
    throw new Error(`Unknown bookmarks method ${method}.`);
}

const CAPABILITY_CALLS: Record<Capability, (method: string, params: unknown[]) => Promise<unknown>> = {
    settings: settingsCall,
    shortcuts: shortcutsCall,
    commands: async method => {
        if (method === 'list') {
            return commands.map(command => ({ name: command.name, type: command.type, hint: command.hint }));
        }
        throw new Error(`Unknown commands method ${method}.`);
    },
    history: historyCall,
    widgets: widgetsCall,
    clipboard: clipboardCall,
    tabs: tabsCall,
    bookmarks: bookmarksCall
};

async function callCapability(run: ScriptRun, type: string, params: unknown[]): Promise<unknown> {
    const [space, method] = type.split('.');
    if (!isCapability(space) || !method) {
        throw new Error(`Unknown call ${type}.`);
    }
    requireGrant(run, space);
    return CAPABILITY_CALLS[space](method, params);
}

export async function handleScriptMessage(run: ScriptRun, message: Message) {
    const reply = (result: unknown, error?: string) =>
        postToScript(run, { type: 'reply', id: message.id, result, error });
    const params = Array.isArray(message.params) ? (message.params as unknown[]) : [];
    const type = String(message.type || '');
    if (type === 'open') {
        if (typeof message.url === 'string' && isWebUrl(message.url)) {
            openInNewTab(message.url);
        }
    } else if (type === 'search') {
        if (text(message.text).trim()) {
            performSearch(text(message.text), Boolean(message.newTab));
        }
    } else if (type === 'toast') {
        showToast(text(message.text).slice(0, 200));
    } else if (type === 'error') {
        finishScript(
            run.id,
            `/${run.command.name} failed: ${String(message.message || 'unknown error').slice(0, 200)}`
        );
    } else if (type === 'done') {
        const shown = describeValue(message.value).slice(0, 200);
        finishScript(run.id, shown || undefined);
    } else if (type === 'fetch') {
        try {
            reply(await proxyFetch(run.command.hosts, params[0], params[1]));
        } catch (error) {
            reply(null, error instanceof Error && error.message ? error.message : 'The request failed.');
        }
    } else if (type.includes('.')) {
        try {
            reply(await callCapability(run, type, params));
        } catch (error) {
            reply(null, error instanceof Error && error.message ? error.message : 'The call failed.');
        }
    }
}
