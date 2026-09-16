export type ExtensionApi = typeof chrome;

export function extensionApi(): ExtensionApi | null {
    const scope = globalThis as { browser?: ExtensionApi; chrome?: ExtensionApi };
    const api = scope.browser && scope.browser.runtime ? scope.browser : scope.chrome;
    return api && api.runtime && api.runtime.id ? api : null;
}

export function openFreshTab(api: ExtensionApi) {
    const params = new URLSearchParams(location.search);
    params.set('fresh', '1');
    const target = api.runtime.getURL('index.html?' + params.toString());
    if (!api.tabs || !api.tabs.getCurrent) {
        location.replace(target);
        return;
    }
    api.tabs.getCurrent(current => {
        if (!current || current.id == null) {
            location.replace(target);
            return;
        }
        const id = current.id;
        api.tabs
            .create({ url: target, active: true, index: current.index, windowId: current.windowId })
            .then(() => api.tabs.remove(id))
            .catch(() => location.replace(target));
    });
}

export function isNewTabPage(): boolean {
    return !new URLSearchParams(location.search).has('fresh') && history.length <= 1;
}

export function isFirefox(): boolean {
    return BUILD_BROWSER === 'firefox';
}

export function permissionsApi(): typeof chrome.permissions | null {
    const api = extensionApi();
    return api && api.permissions ? api.permissions : null;
}

export function hostOrigins(hosts: string[]): string[] {
    return hosts.flatMap(host => [`https://${host}/*`, `https://*.${host}/*`]);
}

export async function hasDirectAccess(hosts: string[]): Promise<boolean> {
    const permissions = permissionsApi();
    if (!permissions || !hosts.length) {
        return false;
    }
    try {
        return await permissions.contains({ origins: hostOrigins(hosts) });
    } catch {
        return false;
    }
}
