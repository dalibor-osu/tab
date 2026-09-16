import { gridCols, gridColsValue, gridRows, gridRowsValue, widgetLayer, widgetList } from '../dom';
import { setVar } from '../theme';
import type { WidgetItem, WidgetType } from '../types';
import { CROSS_ICON, PENCIL_ICON, openConfirm, showToast } from '../ui';
import { openWidgetModal } from './editor';
import { externalDocs, loadExternalWidget, postToWidget, widgetResizeObserver } from './external';
import { WIDGET_TEXT_MAX, WIDGET_TYPES, findWidget, saveWidgets, widgetManifest, widgetsState } from './model';

interface Renderer {
    mount(el: HTMLElement, item: WidgetItem): void;
    update(el: HTMLElement, item: WidgetItem): void;
}

let widgetTimer: ReturnType<typeof setTimeout> | null = null;

export const mountedWidgets = new Map<string, HTMLElement>();

export function widgetTickerRunning(): boolean {
    return widgetTimer !== null;
}

export const ANALOG_CLOCK_SVG = (() => {
    const ticks = Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const angle = (i * 6 * Math.PI) / 180;
        const inner = major ? 40 : 43.5;
        const point = (r: number) =>
            `${(50 + r * Math.sin(angle)).toFixed(2)} ${(50 - r * Math.cos(angle)).toFixed(2)}`;
        const [x1, y1] = point(inner).split(' ');
        const [x2, y2] = point(46.5).split(' ');
        return `<line class="tick${major ? ' major' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
    }).join('');
    return (
        '<svg class="clock-analog" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<circle class="face" cx="50" cy="50" r="48.5" />' +
        ticks +
        '<line class="hand hour" x1="50" y1="54" x2="50" y2="27" />' +
        '<line class="hand minute" x1="50" y1="55" x2="50" y2="16" />' +
        '<line class="hand second" x1="50" y1="60" x2="50" y2="13" />' +
        '<circle class="pin" cx="50" cy="50" r="2.2" /></svg>'
    );
})();

function part<T extends Element>(el: HTMLElement, selector: string): T {
    return el.querySelector(selector) as T;
}

export function tickClock(el: HTMLElement, item: WidgetItem, now: Date) {
    const { seconds, hour12, style } = item.settings;
    if (style === 'analog') {
        const second = now.getSeconds();
        const minute = now.getMinutes() + second / 60;
        const hour = (now.getHours() % 12) + minute / 60;
        part<SVGElement>(el, '.hand.hour').setAttribute('transform', `rotate(${hour * 30} 50 50)`);
        part<SVGElement>(el, '.hand.minute').setAttribute('transform', `rotate(${minute * 6} 50 50)`);
        const secondHand = part<SVGElement>(el, '.hand.second');
        secondHand.style.display = seconds ? '' : 'none';
        secondHand.setAttribute('transform', `rotate(${second * 6} 50 50)`);
        return;
    }
    const pad = (value: number) => String(value).padStart(2, '0');
    let hours = now.getHours();
    let suffix = '';
    if (hour12) {
        suffix = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
    }
    const digital = part<HTMLElement>(el, '.clock-digital');
    digital.classList.toggle('with-seconds', seconds);
    digital.classList.toggle('with-suffix', hour12);
    part<HTMLElement>(el, '.clock-time').textContent = `${hour12 ? hours : pad(hours)}:${pad(now.getMinutes())}`;
    part<HTMLElement>(el, '.clock-seconds').textContent = seconds ? pad(now.getSeconds()) : '';
    part<HTMLElement>(el, '.clock-suffix').textContent = suffix;
}

export function dateLines(format: string, now: Date): [string, string] {
    if (format === 'full') {
        return [
            now.toLocaleDateString(undefined, { weekday: 'long' }),
            now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
        ];
    }
    if (format === 'long') {
        return [now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), ''];
    }
    if (format === 'short') {
        return [now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), ''];
    }
    return [now.toLocaleDateString(), ''];
}

export function renderTodoList(el: HTMLElement, item: WidgetItem) {
    const list = part<HTMLElement>(el, '.todo-list');
    list.innerHTML = '';
    if (!item.settings.items.length) {
        const empty = document.createElement('li');
        empty.className = 'todo-empty';
        empty.textContent = 'Nothing to do.';
        list.appendChild(empty);
        return;
    }
    item.settings.items.forEach((task, index) => {
        const row = document.createElement('li');
        row.className = 'todo-item' + (task.done ? ' done' : '');
        const main = document.createElement('label');
        main.className = 'todo-main';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = task.done;
        check.addEventListener('change', () => {
            const current = findWidget(item.id);
            if (!current || !current.settings.items[index]) {
                return;
            }
            current.settings.items[index].done = check.checked;
            saveWidgets();
            renderTodoList(el, current);
        });
        const text = document.createElement('span');
        text.textContent = task.text;
        main.append(check, text);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.title = 'Remove task';
        remove.innerHTML = CROSS_ICON;
        remove.addEventListener('click', () => {
            const current = findWidget(item.id);
            if (!current) {
                return;
            }
            current.settings.items.splice(index, 1);
            saveWidgets();
            renderTodoList(el, current);
        });
        row.append(main, remove);
        list.appendChild(row);
    });
}

export const WIDGET_RENDERERS: Record<WidgetType, Renderer> = {
    clock: {
        mount(el) {
            const body = document.createElement('div');
            body.className = 'widget-body';
            el.appendChild(body);
        },
        update(el, item) {
            const body = part<HTMLElement>(el, '.widget-body');
            if (body.dataset.style !== item.settings.style) {
                body.dataset.style = item.settings.style;
                body.innerHTML =
                    item.settings.style === 'analog'
                        ? ANALOG_CLOCK_SVG
                        : '<div class="clock-digital"><span class="clock-time"></span>' +
                          '<span class="clock-seconds"></span><span class="clock-suffix"></span></div>';
            }
            tickClock(el, item, new Date());
        }
    },
    date: {
        mount(el) {
            const body = document.createElement('div');
            body.className = 'widget-body';
            const primary = document.createElement('div');
            primary.className = 'date-primary';
            const secondary = document.createElement('div');
            secondary.className = 'date-secondary';
            body.append(primary, secondary);
            el.appendChild(body);
        },
        update(el, item) {
            const now = new Date();
            const [primary, secondary] = dateLines(item.settings.format, now);
            part<HTMLElement>(el, '.date-primary').textContent = primary;
            const secondaryEl = part<HTMLElement>(el, '.date-secondary');
            secondaryEl.textContent = secondary;
            secondaryEl.hidden = !secondary;
            el.classList.toggle('single', !secondary);
            el.dataset.day = now.toDateString();
        }
    },
    notes: {
        mount(el, item) {
            const area = document.createElement('textarea');
            area.className = 'notes-text';
            area.placeholder = 'Write something…';
            area.spellcheck = false;
            let timer: ReturnType<typeof setTimeout> | undefined;
            area.addEventListener('input', () => {
                const current = findWidget(item.id);
                if (!current) {
                    return;
                }
                current.settings.text = area.value.slice(0, WIDGET_TEXT_MAX);
                clearTimeout(timer);
                timer = setTimeout(saveWidgets, 250);
            });
            el.appendChild(area);
        },
        update(el, item) {
            el.style.setProperty('--note-color', item.settings.color);
            const area = part<HTMLTextAreaElement>(el, '.notes-text');
            if (area.value !== item.settings.text && document.activeElement !== area) {
                area.value = item.settings.text;
            }
        }
    },
    todo: {
        mount(el, item) {
            const title = document.createElement('div');
            title.className = 'todo-title';
            const list = document.createElement('ul');
            list.className = 'todo-list';
            const form = document.createElement('form');
            form.className = 'todo-add';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Add a task…';
            input.maxLength = 500;
            input.autocomplete = 'off';
            form.appendChild(input);
            form.addEventListener('submit', e => {
                e.preventDefault();
                const text = input.value.trim();
                const current = findWidget(item.id);
                if (!text || !current) {
                    return;
                }
                if (current.settings.items.length >= 200) {
                    showToast('A to-do list holds at most 200 tasks.');
                    return;
                }
                current.settings.items.push({ text, done: false });
                input.value = '';
                saveWidgets();
                renderTodoList(el, current);
            });
            el.append(title, list, form);
        },
        update(el, item) {
            const title = part<HTMLElement>(el, '.todo-title');
            title.textContent = item.settings.title;
            title.hidden = !item.settings.title.trim();
            renderTodoList(el, item);
        }
    },
    external: {
        mount(el) {
            const frame = document.createElement('iframe');
            frame.setAttribute('sandbox', 'allow-scripts allow-forms');
            frame.title = 'Widget';
            frame.referrerPolicy = 'no-referrer';
            el.appendChild(frame);
            widgetResizeObserver.observe(el);
        },
        update(el, item) {
            const key = JSON.stringify([item.settings.html, item.settings.hosts]);
            const configKey = JSON.stringify(item.settings.config);
            const frame = part<HTMLIFrameElement>(el, 'iframe');
            if (el.dataset.key !== key) {
                el.dataset.key = key;
                el.dataset.config = configKey;
                loadExternalWidget(frame, item);
            } else if (el.dataset.config !== configKey) {
                el.dataset.config = configKey;
                postToWidget(frame, { type: 'config', config: item.settings.config });
            }
        }
    }
};

export function placeWidget(el: HTMLElement, item: { x: number; y: number; w: number; h: number }) {
    el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    el.style.gridRow = `${item.y + 1} / span ${item.h}`;
}

export function mountWidget(item: WidgetItem): HTMLElement {
    const el = document.createElement('div');
    el.className = `widget widget-${item.type}`;
    el.dataset.type = item.type;
    el.dataset.id = item.id;
    WIDGET_RENDERERS[item.type].mount(el, item);
    return el;
}

export function unmountWidget(id: string) {
    const el = mountedWidgets.get(id);
    if (el) {
        widgetResizeObserver.unobserve(el);
        el.remove();
    }
    mountedWidgets.delete(id);
    externalDocs.delete(id);
}

export function applyGrid() {
    setVar('--grid-cols', widgetsState.grid.cols);
    setVar('--grid-rows', widgetsState.grid.rows);
}

export function renderWidgets() {
    applyGrid();
    const seen = new Set<string>();
    widgetsState.items.forEach(item => {
        let el = mountedWidgets.get(item.id);
        if (el && el.dataset.type !== item.type) {
            unmountWidget(item.id);
            el = undefined;
        }
        if (!el) {
            el = mountWidget(item);
            mountedWidgets.set(item.id, el);
            widgetLayer.appendChild(el);
        }
        el.classList.toggle('plain', !item.card);
        placeWidget(el, item);
        WIDGET_RENDERERS[item.type].update(el, item);
        seen.add(item.id);
    });
    [...mountedWidgets.keys()].forEach(id => {
        if (!seen.has(id)) {
            unmountWidget(id);
        }
    });
    syncWidgetTicker();
}

export function scheduleWidgetTick() {
    if (widgetTimer) {
        clearTimeout(widgetTimer);
    }
    widgetTimer = setTimeout(widgetTick, 1000 - (Date.now() % 1000) + 5);
}

export function widgetTick() {
    const now = new Date();
    widgetsState.items.forEach(item => {
        const el = mountedWidgets.get(item.id);
        if (!el) {
            return;
        }
        if (item.type === 'clock') {
            tickClock(el, item, now);
        } else if (item.type === 'date' && el.dataset.day !== now.toDateString()) {
            WIDGET_RENDERERS.date.update(el, item);
        }
    });
    scheduleWidgetTick();
}

export function syncWidgetTicker() {
    const needed = widgetsState.items.some(item => item.type === 'clock' || item.type === 'date');
    if (!needed) {
        if (widgetTimer) {
            clearTimeout(widgetTimer);
        }
        widgetTimer = null;
    } else if (!widgetTimer) {
        scheduleWidgetTick();
    }
}

export function describeWidget(item: WidgetItem): string {
    if (item.type === 'clock') {
        return `Clock · ${item.settings.style}`;
    }
    if (item.type === 'todo' && item.settings.title.trim()) {
        return `To-do · ${item.settings.title.trim()}`;
    }
    if (item.type === 'external') {
        const manifest = widgetManifest(item.settings.html);
        return manifest && manifest.name ? manifest.name : 'External widget';
    }
    return WIDGET_TYPES[item.type].label;
}

export function renderWidgetList() {
    widgetList.innerHTML = '';
    if (!widgetsState.items.length) {
        const empty = document.createElement('div');
        empty.className = 'settings-hint';
        empty.textContent = 'No widgets yet.';
        widgetList.appendChild(empty);
        return;
    }
    widgetsState.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'command-row';

        const info = document.createElement('div');
        info.className = 'preset-info';
        const name = document.createElement('span');
        name.className = 'preset-name';
        name.textContent = describeWidget(item);
        const detail = document.createElement('span');
        detail.className = 'command-detail';
        detail.textContent = `${item.w}×${item.h} cells at ${item.x + 1}, ${item.y + 1}`;
        info.append(name, detail);

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.title = 'Edit widget';
        edit.innerHTML = PENCIL_ICON;
        edit.addEventListener('click', () => openWidgetModal(index));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.title = 'Remove widget';
        remove.innerHTML = CROSS_ICON;
        remove.addEventListener('click', () => {
            openConfirm('Remove widget?', `The ${describeWidget(item)} widget will be removed.`, 'Remove', () => {
                widgetsState.items = widgetsState.items.filter(other => other.id !== item.id);
                saveWidgets();
                renderWidgets();
                renderWidgetList();
            });
        });

        row.append(info, edit, remove);
        widgetList.appendChild(row);
    });
}

export function syncGridControls() {
    gridCols.value = String(widgetsState.grid.cols);
    gridRows.value = String(widgetsState.grid.rows);
    gridColsValue.textContent = String(widgetsState.grid.cols);
    gridRowsValue.textContent = String(widgetsState.grid.rows);
}
