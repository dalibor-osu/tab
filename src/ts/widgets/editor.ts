import {
    widgetCard,
    widgetClockHour12,
    widgetClockSeconds,
    widgetClockStyle,
    widgetCode,
    widgetConfigFields,
    widgetConfigGroup,
    widgetDateFormat,
    widgetError,
    widgetFetchBtn,
    widgetH,
    widgetHosts,
    widgetHostsHint,
    widgetModalTitle,
    widgetNoteColor,
    widgetOverlay,
    widgetSaveBtn,
    widgetSource,
    widgetTodoTitle,
    widgetType,
    widgetW,
    widgetX,
    widgetY
} from '../dom';
import { buildSelect } from '../panel';
import type { ConfigValue, WidgetManifest, WidgetSettings, WidgetType } from '../types';
import { clampInt, hideModal, newId, showModal } from '../ui';
import { isHostName, isSourceUrl, parseHosts } from '../urls';
import { syncGrantRow } from './external';
import {
    CONFIG_TEXT_MAX,
    WIDGET_CODE_MAX,
    WIDGET_TYPES,
    coerceConfigValue,
    findFreeSlot,
    fitsGrid,
    isWidgetType,
    rectFree,
    sanitizeWidgetSettings,
    saveWidgets,
    widgetManifest,
    widgetsState
} from './model';
import { renderWidgetList, renderWidgets } from './render';

let editingWidget = -1;

export function widgetFieldsFor(type: WidgetType) {
    document.querySelectorAll<HTMLElement>('[data-widget-fields]').forEach(el => {
        el.hidden = el.dataset.widgetFields !== type;
    });
}

export function fillWidgetForm(type: WidgetType, values: Partial<WidgetSettings>) {
    widgetType.value = type;
    widgetFieldsFor(type);
    widgetClockStyle.value = type === 'clock' ? (values.style ?? 'digital') : 'digital';
    widgetClockSeconds.checked = type === 'clock' ? Boolean(values.seconds) : false;
    widgetClockHour12.checked = type === 'clock' ? Boolean(values.hour12) : false;
    widgetDateFormat.value = type === 'date' ? (values.format ?? 'full') : 'full';
    widgetNoteColor.value = type === 'notes' ? (values.color ?? '#fde68a') : '#fde68a';
    widgetTodoTitle.value = type === 'todo' ? (values.title ?? '') : '';
    widgetCode.value = type === 'external' ? (values.html ?? '') : '';
    widgetHosts.value = type === 'external' ? (values.hosts ?? []).join(', ') : '';
    widgetSource.value = type === 'external' ? (values.source ?? '') : '';
    syncWidgetManifest(type === 'external' ? values.config : {});
}

export function showWidgetNotice(message: string) {
    widgetError.textContent = message;
    widgetError.classList.add('notice');
    widgetError.hidden = false;
}

export function showWidgetError(message: string) {
    widgetError.textContent = message;
    widgetError.classList.remove('notice');
    widgetError.hidden = false;
}

export function applyWidgetCode(text: string, source: string) {
    if (!text.trim()) {
        showWidgetError('That file is empty.');
        return;
    }
    if (text.length > WIDGET_CODE_MAX) {
        showWidgetError('That file is larger than 200 KB.');
        return;
    }
    const previousHosts = parseHosts(widgetHosts.value);
    widgetCode.value = text;
    widgetSource.value = source;
    widgetError.hidden = true;
    syncWidgetManifest();
    const manifest = widgetManifest(text);
    const added = manifest ? manifest.hosts.filter(host => !previousHosts.includes(host)) : [];
    if (added.length && previousHosts.length) {
        showWidgetNotice(
            `This code asks for new hosts: ${added.join(', ')}. Add them to “Allowed hosts” only if you agree.`
        );
    }
}

export async function fetchWidgetSource() {
    const url = widgetSource.value.trim();
    if (!isSourceUrl(url)) {
        showWidgetError('Enter an https link to the widget file.');
        return;
    }
    widgetFetchBtn.disabled = true;
    try {
        const response = await fetch(url, {
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer'
        });
        if (!response.ok) {
            throw new Error(`The server answered ${response.status}.`);
        }
        applyWidgetCode(await response.text(), url);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showWidgetError(
            message === 'Failed to fetch'
                ? 'The file could not be downloaded. The site has to allow cross-origin requests; raw GitHub files and release assets do.'
                : message
        );
    }
    widgetFetchBtn.disabled = false;
}

export async function loadWidgetFile(file: File | undefined) {
    if (!file) {
        return;
    }
    if (file.size > WIDGET_CODE_MAX) {
        showWidgetError('That file is larger than 200 KB.');
        return;
    }
    try {
        applyWidgetCode(await file.text(), '');
    } catch {
        showWidgetError('That file could not be read.');
    }
}

export function renderWidgetConfigFields(manifest: WidgetManifest | null, values: Record<string, unknown> | undefined) {
    widgetConfigFields.innerHTML = '';
    const fields = manifest ? manifest.settings : [];
    widgetConfigGroup.hidden = !fields.length;
    const hosts = manifest ? manifest.hosts : [];
    widgetHostsHint.hidden = !hosts.length;
    widgetHostsHint.textContent = hosts.length ? `This widget asks for: ${hosts.join(', ')}` : '';
    fields.forEach(field => {
        const value = coerceConfigValue(field, values ? values[field.key] : undefined, field.default);
        const group = document.createElement('div');
        let control: HTMLInputElement | HTMLSelectElement;
        if (field.type === 'toggle') {
            group.className = 'form-group modal-options compact';
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `widgetConfig-${field.key}`;
            checkbox.checked = Boolean(value);
            label.append(checkbox, ` ${field.label}`);
            group.appendChild(label);
            control = checkbox;
        } else {
            group.className = 'form-group';
            const label = document.createElement('label');
            label.className = 'form-label';
            label.textContent = field.label;
            if (field.type === 'select') {
                const select = document.createElement('select');
                select.className = 'form-select';
                buildSelect(
                    select,
                    field.options.map(option => ({ id: option.value, label: option.label }))
                );
                control = select;
            } else {
                const input = document.createElement('input');
                input.className = 'form-input';
                input.type = field.type;
                if (field.type === 'number') {
                    if (field.min != null) {
                        input.min = String(field.min);
                    }
                    if (field.max != null) {
                        input.max = String(field.max);
                    }
                    if (field.step != null) {
                        input.step = String(field.step);
                    }
                }
                if (field.type === 'text') {
                    input.placeholder = field.placeholder;
                    input.maxLength = CONFIG_TEXT_MAX;
                }
                control = input;
            }
            control.id = `widgetConfig-${field.key}`;
            label.htmlFor = control.id;
            control.value = String(value);
            group.append(label, control);
        }
        control.dataset.configKey = field.key;
        control.dataset.configType = field.type;
        if (field.hint) {
            const hint = document.createElement('div');
            hint.className = 'settings-hint';
            hint.textContent = field.hint;
            group.appendChild(hint);
        }
        widgetConfigFields.appendChild(group);
    });
}

export function readWidgetConfig(): Record<string, ConfigValue> {
    const values: Record<string, ConfigValue> = {};
    widgetConfigFields.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-config-key]').forEach(control => {
        const key = control.dataset.configKey as string;
        values[key] =
            control.dataset.configType === 'toggle' && control instanceof HTMLInputElement
                ? control.checked
                : control.value;
    });
    return values;
}

export function syncWidgetManifest(values?: Record<string, unknown>) {
    const manifest = widgetManifest(widgetCode.value);
    renderWidgetConfigFields(manifest, values || readWidgetConfig());
    if (manifest && manifest.hosts.length && !widgetHosts.value.trim()) {
        widgetHosts.value = manifest.hosts.join(', ');
    }
    syncGrantRow();
}

export function setGeometryFields(w: number, h: number, x: number, y: number) {
    const { cols, rows } = widgetsState.grid;
    widgetW.max = String(cols);
    widgetH.max = String(rows);
    widgetX.max = String(cols);
    widgetY.max = String(rows);
    widgetW.value = String(w);
    widgetH.value = String(h);
    widgetX.value = String(x + 1);
    widgetY.value = String(y + 1);
}

export function openWidgetModal(index?: number) {
    editingWidget = typeof index === 'number' ? index : -1;
    const item = editingWidget >= 0 ? widgetsState.items[editingWidget] : null;
    const type: WidgetType = item ? item.type : 'clock';
    widgetModalTitle.textContent = item ? 'Edit Widget' : 'Add Widget';
    widgetSaveBtn.textContent = item ? 'Save changes' : 'Add';
    widgetType.disabled = Boolean(item);
    fillWidgetForm(type, item ? item.settings : WIDGET_TYPES[type].defaults());
    const [w, h] = item ? [item.w, item.h] : WIDGET_TYPES[type].size;
    const slot = item ? { x: item.x, y: item.y } : findFreeSlot(w, h) || { x: 0, y: 0 };
    setGeometryFields(w, h, slot.x, slot.y);
    widgetCard.checked = item ? item.card : true;
    widgetError.hidden = true;
    showModal(widgetOverlay);
}

export function closeWidgetModal() {
    editingWidget = -1;
    hideModal(widgetOverlay);
}

export function changeWidgetType() {
    const type = widgetType.value;
    if (!isWidgetType(type)) {
        return;
    }
    fillWidgetForm(type, WIDGET_TYPES[type].defaults());
    const [w, h] = WIDGET_TYPES[type].size;
    const slot = findFreeSlot(w, h) || { x: 0, y: 0 };
    setGeometryFields(w, h, slot.x, slot.y);
}

export function readWidgetForm(type: WidgetType, existing: WidgetSettings | null): Partial<WidgetSettings> {
    const base = existing || WIDGET_TYPES[type].defaults();
    if (type === 'clock') {
        return {
            style: widgetClockStyle.value as WidgetSettings['style'],
            seconds: widgetClockSeconds.checked,
            hour12: widgetClockHour12.checked
        };
    }
    if (type === 'date') {
        return { format: widgetDateFormat.value as WidgetSettings['format'] };
    }
    if (type === 'notes') {
        return { color: widgetNoteColor.value, text: base.text ?? '' };
    }
    if (type === 'todo') {
        return { title: widgetTodoTitle.value.trim() || 'To-do', items: base.items ?? [] };
    }
    return {
        html: widgetCode.value,
        hosts: parseHosts(widgetHosts.value),
        data: base.data ?? null,
        config: readWidgetConfig(),
        source: widgetSource.value.trim()
    };
}

export function saveWidgetForm() {
    const existing = editingWidget >= 0 ? widgetsState.items[editingWidget] : null;
    const type = existing ? existing.type : widgetType.value;
    if (!isWidgetType(type)) {
        return;
    }
    const values = readWidgetForm(type, existing ? existing.settings : null);
    if (type === 'external') {
        if (!(values.html ?? '').trim()) {
            showWidgetError('Paste the widget code first.');
            return;
        }
        const invalid = (values.hosts ?? []).filter(host => !isHostName(host));
        if (invalid.length) {
            showWidgetError(`"${invalid[0]}" is not a valid host name.`);
            return;
        }
    }
    const { cols, rows } = widgetsState.grid;
    const rect = {
        w: clampInt(widgetW.value, 1, cols, 0),
        h: clampInt(widgetH.value, 1, rows, 0),
        x: clampInt(widgetX.value, 1, cols, 0) - 1,
        y: clampInt(widgetY.value, 1, rows, 0) - 1
    };
    if (!fitsGrid(rect)) {
        showWidgetError('That size and position do not fit the grid.');
        return;
    }
    if (!rectFree(rect, existing ? existing.id : null)) {
        showWidgetError('That spot overlaps another widget.');
        return;
    }
    if (existing) {
        Object.assign(existing, rect, {
            card: widgetCard.checked,
            settings: sanitizeWidgetSettings(type, values)
        });
    } else {
        widgetsState.items.push({
            id: newId(),
            type,
            ...rect,
            card: widgetCard.checked,
            settings: sanitizeWidgetSettings(type, values)
        });
    }
    saveWidgets();
    renderWidgets();
    renderWidgetList();
    closeWidgetModal();
}
