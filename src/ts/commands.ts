import {
    commandList,
    commandModalTitle,
    commandName,
    commandOverlay,
    commandTemplate,
    commandTemplateGroup,
    commandType,
    commandUrls,
    commandUrlsGroup,
    searchInput,
    settingsZone
} from './dom';
import { SUGGESTION_MAX, hideSuggestions } from './search';
import { COMMANDS_KEY, readStorage, writeStorage } from './storage';
import { openPanel } from './panel';
import type { Command, SearchCommand } from './types';
import { CROSS_ICON, PENCIL_ICON, showToast } from './ui';
import { isWebUrl } from './urls';

export let commands: Command[] = [];
let editingCommand = -1;

export function setCommands(next: Command[]) {
    commands = next;
}

export function defaultCommands(): Command[] {
    return [
        { name: 'gh', type: 'search', url: 'https://github.com/search?q=%s' },
        { name: 'yt', type: 'search', url: 'https://www.youtube.com/results?search_query=%s' },
        { name: 'wiki', type: 'search', url: 'https://en.wikipedia.org/w/index.php?search=%s' }
    ];
}

export function isCommandName(name: unknown): name is string {
    return typeof name === 'string' && /^[a-z0-9_-]{1,24}$/i.test(name);
}

export function sanitizeCommands(list: unknown): Command[] | null {
    if (!Array.isArray(list)) {
        return null;
    }
    const seen = new Set<string>();
    const result: Command[] = [];
    list.forEach((entry: unknown) => {
        const command = entry as { name?: unknown; type?: unknown; url?: unknown; urls?: unknown } | null;
        if (!command || !isCommandName(command.name) || seen.has(command.name.toLowerCase())) {
            return;
        }
        seen.add(command.name.toLowerCase());
        if (command.type === 'open') {
            if (Array.isArray(command.urls) && command.urls.length > 0 && command.urls.every(isWebUrl)) {
                result.push({ name: command.name, type: 'open', urls: command.urls.map(String) });
            }
            return;
        }
        if (command.type === 'search' && isWebUrl(command.url) && String(command.url).includes('%s')) {
            result.push({ name: command.name, type: 'search', url: String(command.url) });
        }
    });
    return result;
}

export function loadCommands() {
    commands = sanitizeCommands(readStorage<unknown>(COMMANDS_KEY, null)) || defaultCommands();
}

export function saveCommands() {
    writeStorage(COMMANDS_KEY, commands);
}

export function findCommand(name: string): Command | undefined {
    const lower = name.toLowerCase();
    return commands.find(command => command.name.toLowerCase() === lower);
}

export function parseCommand(input: string): { command: Command; args: string } | null {
    const match = /^\/([a-z0-9_-]+)(?:\s+(.*))?$/i.exec(input.trim());
    if (!match) {
        return null;
    }
    const command = findCommand(match[1]);
    return command ? { command, args: (match[2] || '').trim() } : null;
}

export function matchingCommands(typed: string): Command[] {
    const prefix = typed.slice(1).toLowerCase();
    return commands
        .filter(command => command.name.toLowerCase().startsWith(prefix))
        .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
        .slice(0, SUGGESTION_MAX);
}

export function describeCommand(command: Command): string {
    if (command.type === 'open') {
        return `Opens ${command.urls.length} ${command.urls.length === 1 ? 'link' : 'links'}`;
    }
    try {
        return `Search ${new URL(command.url).hostname.replace(/^www\./, '')}`;
    } catch {
        return 'Search';
    }
}

export function commandTarget(command: SearchCommand, args: string): string | null {
    if (args) {
        return command.url.replace('%s', encodeURIComponent(args));
    }
    try {
        return new URL(command.url).origin + '/';
    } catch {
        return null;
    }
}

export function runCommand(command: Command, args: string) {
    hideSuggestions();
    if (command.type === 'open') {
        let blocked = 0;
        command.urls.forEach(url => {
            const opened = window.open(url, '_blank');
            if (opened) {
                opened.opener = null;
            } else {
                blocked++;
            }
        });
        searchInput.value = '';
        if (blocked) {
            showToast(
                `${blocked} of ${command.urls.length} tabs were blocked - allow pop-ups for this site to open them all at once.`
            );
        }
        return;
    }
    const target = commandTarget(command, args);
    if (target) {
        window.location.href = target;
    }
}

export function useCommandSuggestion(command: Command) {
    if (command.type === 'open') {
        runCommand(command, '');
        return;
    }
    searchInput.value = `/${command.name} `;
    hideSuggestions();
    searchInput.focus();
}

export function renderCommandList() {
    commandList.innerHTML = '';
    if (!commands.length) {
        const empty = document.createElement('div');
        empty.className = 'settings-hint';
        empty.textContent = 'No commands yet.';
        commandList.appendChild(empty);
        return;
    }
    commands.forEach((command, index) => {
        const row = document.createElement('div');
        row.className = 'command-row';

        const name = document.createElement('span');
        name.className = 'command-name';
        name.textContent = '/' + command.name;

        const detail = document.createElement('span');
        detail.className = 'command-detail';
        detail.textContent = describeCommand(command);
        detail.title = command.type === 'open' ? command.urls.join('\n') : command.url;

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.title = 'Edit command';
        edit.innerHTML = PENCIL_ICON;
        edit.addEventListener('click', () => openCommandModal(index));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.title = 'Remove command';
        remove.innerHTML = CROSS_ICON;
        remove.addEventListener('click', () => {
            commands.splice(index, 1);
            saveCommands();
            renderCommandList();
        });

        row.append(name, detail, edit, remove);
        commandList.appendChild(row);
    });
}

export function syncCommandForm() {
    const search = commandType.value === 'search';
    commandUrlsGroup.hidden = search;
    commandTemplateGroup.hidden = !search;
}

export function openCommandModal(index?: number) {
    editingCommand = typeof index === 'number' ? index : -1;
    const command = editingCommand >= 0 ? commands[editingCommand] : null;
    commandModalTitle.textContent = command ? 'Edit Command' : 'Add Command';
    commandName.value = command ? command.name : '';
    commandType.value = command ? command.type : 'open';
    commandUrls.value = command && command.type === 'open' ? command.urls.join('\n') : '';
    commandTemplate.value = command && command.type === 'search' ? command.url : '';
    syncCommandForm();
    settingsZone.classList.remove('open');
    commandOverlay.classList.add('active');
    setTimeout(() => commandName.focus(), 100);
}

export function closeCommandModal() {
    editingCommand = -1;
    commandOverlay.classList.remove('active');
    openPanel();
}

export function saveCommandForm() {
    const name = commandName.value.trim().replace(/^\//, '');
    if (!isCommandName(name)) {
        commandName.focus();
        return;
    }
    const duplicate = commands.findIndex(command => command.name.toLowerCase() === name.toLowerCase());
    if (duplicate !== -1 && duplicate !== editingCommand) {
        commandName.focus();
        return;
    }

    let command: Command;
    if (commandType.value === 'search') {
        const url = commandTemplate.value.trim();
        if (!isWebUrl(url) || !url.includes('%s')) {
            commandTemplate.focus();
            return;
        }
        command = { name, type: 'search', url };
    } else {
        const urls = commandUrls.value
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => (/^[a-z][a-z0-9+.-]*:\/\//i.test(line) ? line : 'https://' + line));
        if (!urls.length || !urls.every(isWebUrl)) {
            commandUrls.focus();
            return;
        }
        command = { name, type: 'open', urls };
    }

    if (editingCommand >= 0) {
        commands[editingCommand] = command;
    } else {
        commands.push(command);
    }
    saveCommands();
    renderCommandList();
    closeCommandModal();
}
