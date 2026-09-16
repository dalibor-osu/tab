import { describeCommand, matchingCommands, parseCommand, runCommand, useCommandSuggestion } from './commands';
import { searchForm, searchInput, searchSuggestions } from './dom';
import { settings } from './settings';
import { openInNewTab } from './shortcuts';
import { HISTORY_KEY, readStorage, writeStorage } from './storage';
import type { Engine } from './types';
import { CROSS_ICON } from './ui';
import { isWebUrl } from './urls';

export type Classified = { kind: 'search'; query: string } | { kind: 'url'; url: string };

export const HISTORY_MAX = 25;
export const SUGGESTION_MAX = 8;

export const ENGINES: Engine[] = [
    { id: 'duckduckgo', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    { id: 'google', label: 'Google', url: 'https://www.google.com/search?q=%s' },
    { id: 'bing', label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
    { id: 'brave', label: 'Brave', url: 'https://search.brave.com/search?q=%s' },
    { id: 'startpage', label: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
    { id: 'ecosia', label: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
    { id: 'seznam', label: 'Seznam', url: 'https://search.seznam.cz/?q=%s' },
    { id: 'yandex', label: 'Yandex', url: 'https://yandex.com/search/?text=%s' },
    { id: 'perplexity', label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=%s' },
    { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
    { id: 'wikipedia', label: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s' },
    { id: 'custom', label: 'Custom…', url: '' }
];

export let searchHistory: string[] = [];
export let activeSuggestion = -1;

export function setSearchHistory(next: string[]) {
    searchHistory = next;
}

export function getEngine(id: string): Engine {
    return ENGINES.find(engine => engine.id === id) || ENGINES[0];
}

export function searchUrlFor(query: string): string | null {
    const engine = getEngine(settings.engine);
    const template = engine.id === 'custom' ? settings.customEngineUrl.trim() : engine.url;
    if (!isWebUrl(template)) {
        return null;
    }
    return template.includes('%s')
        ? template.replace('%s', encodeURIComponent(query))
        : template + encodeURIComponent(query);
}

export function loadHistory() {
    const stored = readStorage<unknown>(HISTORY_KEY, []);
    searchHistory = Array.isArray(stored)
        ? stored.filter((item): item is string => typeof item === 'string').slice(0, HISTORY_MAX)
        : [];
}

export function saveHistory() {
    writeStorage(HISTORY_KEY, searchHistory);
}

export function rememberSearch(query: string) {
    if (!settings.rememberSearches) {
        return;
    }
    const lower = query.toLowerCase();
    searchHistory = [query, ...searchHistory.filter(item => item.toLowerCase() !== lower)].slice(0, HISTORY_MAX);
    saveHistory();
}

export function forgetSearch(query: string) {
    searchHistory = searchHistory.filter(item => item !== query);
    saveHistory();
    renderSuggestions(true);
}

export function clearHistory() {
    searchHistory = [];
    saveHistory();
    hideSuggestions();
}

export function matchingHistory(): string[] {
    const typed = searchInput.value.trim().toLowerCase().replace(/^\?/, '');
    const matches = searchHistory.filter(item => {
        const lower = item.toLowerCase();
        if (!typed) {
            return true;
        }
        if (lower === typed) {
            return false;
        }
        return lower.includes(typed) || historyHost(item).startsWith(typed);
    });
    const sites = matches.filter(item => classifyInput(item).kind === 'url');
    const searches = matches.filter(item => classifyInput(item).kind !== 'url');
    return [...sites, ...searches].slice(0, SUGGESTION_MAX);
}

export function hideSuggestions() {
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = '';
    activeSuggestion = -1;
}

export function renderCommandSuggestions(typed: string) {
    const matches = matchingCommands(typed);
    if (!matches.length || document.activeElement !== searchInput) {
        hideSuggestions();
        return;
    }

    activeSuggestion = -1;
    searchSuggestions.innerHTML = '';
    matches.forEach(command => {
        const item = document.createElement('li');
        item.className = 'search-suggestion';
        item.dataset.command = command.name;
        item.innerHTML =
            '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<path d="M4 3l5 5-5 5M9 13h4" /></svg>';

        const text = document.createElement('span');
        text.textContent = '/' + command.name;

        const badge = document.createElement('span');
        badge.className = 'command-badge';
        badge.textContent = describeCommand(command);

        item.addEventListener('click', () => useCommandSuggestion(command));
        item.append(text, badge);
        searchSuggestions.appendChild(item);
    });
    searchSuggestions.hidden = false;
}

export function renderSuggestions(showAll: boolean) {
    const typed = searchInput.value.trim();
    if (typed.startsWith('/') && !/\s/.test(typed)) {
        renderCommandSuggestions(typed);
        return;
    }

    const matches = settings.rememberSearches && (typed || showAll) ? matchingHistory() : [];
    if (!matches.length || document.activeElement !== searchInput) {
        hideSuggestions();
        return;
    }

    activeSuggestion = -1;
    searchSuggestions.innerHTML = '';
    matches.forEach(query => {
        const item = document.createElement('li');
        item.className = 'search-suggestion';
        item.dataset.value = query;
        item.innerHTML =
            classifyInput(query).kind === 'url'
                ? '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                  '<path d="M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM2 8h12M8 2c2 2 2 10 0 12M8 2C6 4 6 12 8 14" /></svg>'
                : '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                  '<path d="M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z" /></svg>';

        const text = document.createElement('span');
        text.textContent = displayHistoryItem(query);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'suggestion-remove';
        remove.title = 'Forget this search';
        remove.innerHTML = CROSS_ICON;
        remove.addEventListener('click', e => {
            e.stopPropagation();
            forgetSearch(query);
        });

        item.addEventListener('click', () => useSuggestion(query));
        item.append(text, remove);
        searchSuggestions.appendChild(item);
    });
    searchSuggestions.hidden = false;
}

export function moveSuggestion(step: number) {
    const items = searchSuggestions.querySelectorAll('.search-suggestion');
    if (!items.length) {
        return;
    }
    activeSuggestion = (activeSuggestion + step + items.length) % items.length;
    items.forEach((item, index) => item.classList.toggle('active', index === activeSuggestion));
}

export function useSuggestion(query: string) {
    searchInput.value = query;
    hideSuggestions();
    searchForm.requestSubmit();
}

export function classifyInput(raw: string): Classified {
    const text = raw.trim();
    if (text.startsWith('?')) {
        return { kind: 'search', query: text.slice(1).trim() };
    }
    if (/\s/.test(text)) {
        return { kind: 'search', query: text };
    }
    let url = '';
    if (/^https?:\/\//i.test(text)) {
        url = text;
    } else {
        const host = text.split(/[/?#]/)[0].split(':')[0];
        const isLocal = /^localhost$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
        const isDomain = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
        if (isLocal) {
            url = 'http://' + text;
        } else if (isDomain) {
            url = 'https://' + text;
        }
    }
    return url && isWebUrl(url) ? { kind: 'url', url } : { kind: 'search', query: text };
}

export function historyHost(item: string): string {
    const entry = classifyInput(item);
    if (entry.kind !== 'url') {
        return '';
    }
    try {
        return new URL(entry.url).host.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

export function displayHistoryItem(item: string): string {
    return classifyInput(item).kind === 'url' ? item.replace(/^https?:\/\//i, '').replace(/\/$/, '') : item;
}

export function goTo(url: string, newTab: boolean) {
    if (newTab) {
        openInNewTab(url);
        return;
    }
    window.location.href = url;
}

export function performSearch(raw: string, newTab: boolean) {
    const text = raw.trim();
    if (!text) {
        return;
    }
    const parsed = parseCommand(text);
    if (parsed) {
        runCommand(parsed.command, parsed.args);
        return;
    }
    const entry = classifyInput(text);
    if (entry.kind === 'url') {
        rememberSearch(text);
        hideSuggestions();
        goTo(entry.url, newTab);
        return;
    }
    if (!entry.query) {
        return;
    }
    const url = searchUrlFor(entry.query);
    if (url) {
        rememberSearch(entry.query);
        hideSuggestions();
        goTo(url, newTab);
    }
}
