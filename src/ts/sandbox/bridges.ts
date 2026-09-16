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
