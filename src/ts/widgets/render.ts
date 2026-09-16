import { gridCols, gridColsValue, gridRows, gridRowsValue, widgetLayer, widgetList } from '../dom';
import { setVar } from '../theme';
import type { WidgetItem } from '../types';
import { CROSS_ICON, PENCIL_ICON, openConfirm } from '../ui';
import { openWidgetModal } from './editor';
import { loadWidgetFrame, postToWidget, widgetDocs, widgetResizeObserver } from './external';
import { WIDGET_TYPES, saveWidgets, widgetHtml, widgetManifest, widgetsState } from './model';

interface FrameKeys {
    code: string;
    config: string;
}

export const mountedWidgets = new Map<string, HTMLElement>();
const frameKeys = new Map<string, FrameKeys>();

export function placeWidget(el: HTMLElement, item: { x: number; y: number; w: number; h: number }) {
    el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    el.style.gridRow = `${item.y + 1} / span ${item.h}`;
}

export function mountWidget(item: WidgetItem): HTMLElement {
    const el = document.createElement('div');
    el.className = `widget widget-${item.type}`;
    el.dataset.type = item.type;
    el.dataset.id = item.id;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.title = describeWidget(item);
    frame.referrerPolicy = 'no-referrer';
    el.appendChild(frame);
    widgetResizeObserver.observe(el);
    return el;
}

export function updateWidget(el: HTMLElement, item: WidgetItem) {
    const keys: FrameKeys = {
        code: JSON.stringify([widgetHtml(item), item.settings.hosts]),
        config: JSON.stringify(item.settings.config)
    };
    const previous = frameKeys.get(item.id);
    const frame = el.querySelector('iframe') as HTMLIFrameElement;
    frameKeys.set(item.id, keys);
    if (!previous || previous.code !== keys.code) {
        loadWidgetFrame(frame, item);
    } else if (previous.config !== keys.config) {
        postToWidget(frame, { type: 'config', config: item.settings.config });
    }
}

export function unmountWidget(id: string) {
    const el = mountedWidgets.get(id);
    if (el) {
        widgetResizeObserver.unobserve(el);
        el.remove();
    }
    mountedWidgets.delete(id);
    frameKeys.delete(id);
    widgetDocs.delete(id);
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
        updateWidget(el, item);
        seen.add(item.id);
    });
    [...mountedWidgets.keys()].forEach(id => {
        if (!seen.has(id)) {
            unmountWidget(id);
        }
    });
}

export function describeWidget(item: WidgetItem): string {
    const manifest = widgetManifest(widgetHtml(item));
    const fallback = item.type === 'external' ? 'External widget' : WIDGET_TYPES[item.type].label;
    const name = manifest && manifest.name ? manifest.name : fallback;
    let detail = '';
    if (item.type === 'clock') {
        detail = String(item.settings.config.style ?? '');
    } else if (item.type === 'todo') {
        detail = String(item.settings.config.title ?? '').trim();
    }
    return detail ? `${name} · ${detail}` : name;
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
