export const WEBSITE_URL = 'https://dalibor.codes/tab/';

export function isWebUrl(value: unknown): boolean {
    return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

export function isLinkUrl(value: unknown): boolean {
    const trimmed = String(value || '').trim();
    if (!/^(https?|file):\/\/\S+$/i.test(trimmed)) {
        return false;
    }
    try {
        new URL(trimmed);
        return true;
    } catch {
        return false;
    }
}

export function selfUrl(): string {
    return location.href.split(/[?#]/)[0];
}

export function webUrl(value: unknown): string {
    const trimmed = String(value || '').trim();
    return isWebUrl(trimmed) ? trimmed : '';
}

export function getHostname(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

export function isHostName(value: string): boolean {
    return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value);
}

export function parseHosts(text: unknown): string[] {
    return [
        ...new Set(
            String(text)
                .split(/[\s,]+/)
                .map(host =>
                    host
                        .trim()
                        .toLowerCase()
                        .replace(/^https?:\/\//, '')
                        .replace(/\/.*$/, '')
                )
                .filter(Boolean)
        )
    ].slice(0, 20);
}

export function isSourceUrl(value: string): boolean {
    return /^https:\/\//i.test(value) && isWebUrl(value);
}
