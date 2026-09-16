import { arrangeDoneBtn, settingsZone, widgetLayer } from '../dom';
import type { Rect, WidgetItem } from '../types';
import { openPanel } from '../panel';
import { clampInt, showToast } from '../ui';
import { GRID_LIMITS, clampWidgetsToGrid, findWidget, rectFree, saveWidgets, widgetsState } from './model';
import { mountedWidgets, placeWidget, renderWidgetList, renderWidgets, syncGridControls } from './render';

interface Edges {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
}

interface ArrangeDrag {
    id: string;
    el: HTMLElement;
    edges: Edges;
    resize: boolean;
    startX: number;
    startY: number;
    origin: Rect;
    rect: Rect;
    metrics: { pitchX: number; pitchY: number };
    valid: boolean;
}

export const RESIZE_EDGE_PX = 14;

export let arranging = false;
export let arrangeDrag: ArrangeDrag | null = null;
let gridPreviewTimer: ReturnType<typeof setTimeout> | undefined;

export function renderGridCells() {
    clearGridCells();
    const { cols, rows } = widgetsState.grid;
    const fragment = document.createDocumentFragment();
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cell = document.createElement('div');
            cell.className = 'widget-cell';
            cell.style.gridArea = `${y + 1} / ${x + 1}`;
            fragment.appendChild(cell);
        }
    }
    widgetLayer.prepend(fragment);
}

export function clearGridCells() {
    widgetLayer.querySelectorAll('.widget-cell').forEach(cell => cell.remove());
}

export function previewGrid() {
    renderGridCells();
    clearTimeout(gridPreviewTimer);
    gridPreviewTimer = setTimeout(() => {
        if (!arranging) {
            clearGridCells();
        }
    }, 1200);
}

export function changeGrid(axis: 'cols' | 'rows', value: unknown) {
    const [min, max] = GRID_LIMITS[axis];
    widgetsState.grid[axis] = clampInt(value, min, max, widgetsState.grid[axis]);
    clampWidgetsToGrid();
    if (widgetsState.items.some(item => !rectFree(item, item.id))) {
        showToast('Not enough room for every widget - some overlap now. Enlarge the grid or shrink them.');
    }
    saveWidgets();
    renderWidgets();
    renderWidgetList();
    syncGridControls();
    previewGrid();
}

export function startArranging() {
    arranging = true;
    document.body.classList.add('arranging');
    settingsZone.classList.remove('open');
    arrangeDoneBtn.hidden = false;
    renderGridCells();
}

export function stopArranging() {
    arranging = false;
    if (arrangeDrag) {
        const item = findWidget(arrangeDrag.id);
        arrangeDrag.el.classList.remove('moving', 'invalid');
        if (item) {
            placeWidget(arrangeDrag.el, item);
        }
        arrangeDrag = null;
    }
    mountedWidgets.forEach(el => {
        el.style.cursor = '';
    });
    document.body.classList.remove('arranging');
    arrangeDoneBtn.hidden = true;
    clearGridCells();
    openPanel();
}

export function gridMetrics(): { pitchX: number; pitchY: number } {
    const rect = widgetLayer.getBoundingClientRect();
    const style = getComputedStyle(widgetLayer);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const innerWidth = rect.width - padLeft - (parseFloat(style.paddingRight) || 0);
    const innerHeight = rect.height - padTop - (parseFloat(style.paddingBottom) || 0);
    const { cols, rows } = widgetsState.grid;
    return {
        pitchX: (innerWidth + (parseFloat(style.columnGap) || 0)) / cols,
        pitchY: (innerHeight + (parseFloat(style.rowGap) || 0)) / rows
    };
}

export function resizeEdges(el: HTMLElement, e: PointerEvent): Edges {
    const rect = el.getBoundingClientRect();
    const edge = Math.min(RESIZE_EDGE_PX, rect.width / 3, rect.height / 3);
    return {
        left: e.clientX - rect.left < edge,
        right: rect.right - e.clientX < edge,
        top: e.clientY - rect.top < edge,
        bottom: rect.bottom - e.clientY < edge
    };
}

export function edgeCursor(edges: Edges): string {
    const vertical = edges.top ? 'n' : edges.bottom ? 's' : '';
    const horizontal = edges.left ? 'w' : edges.right ? 'e' : '';
    return vertical || horizontal ? `${vertical}${horizontal}-resize` : 'move';
}

export function beginWidgetDrag(item: WidgetItem, el: HTMLElement, edges: Edges, pointer: PointerEvent) {
    arrangeDrag = {
        id: item.id,
        el,
        edges,
        resize: Boolean(edges.left || edges.right || edges.top || edges.bottom),
        startX: pointer.clientX,
        startY: pointer.clientY,
        origin: { x: item.x, y: item.y, w: item.w, h: item.h },
        rect: { x: item.x, y: item.y, w: item.w, h: item.h },
        metrics: gridMetrics(),
        valid: true
    };
    el.classList.add('moving');
    try {
        widgetLayer.setPointerCapture(pointer.pointerId);
    } catch {}
}

function widgetFromEvent(e: PointerEvent): HTMLElement | null {
    const target = e.target as Element | null;
    return target ? (target.closest('.widget') as HTMLElement | null) : null;
}

export function widgetPointerDown(e: PointerEvent) {
    if (!arranging || e.button !== 0) {
        return;
    }
    const el = widgetFromEvent(e);
    const item = el ? findWidget(el.dataset.id) : null;
    if (!el || !item) {
        return;
    }
    e.preventDefault();
    beginWidgetDrag(item, el, resizeEdges(el, e), e);
}

export function widgetPointerHover(e: PointerEvent) {
    if (!arranging || arrangeDrag) {
        return;
    }
    const el = widgetFromEvent(e);
    if (el) {
        el.style.cursor = edgeCursor(resizeEdges(el, e));
    }
}

export function resizedRect(origin: Rect, edges: Edges, dx: number, dy: number): Rect {
    const { cols, rows } = widgetsState.grid;
    const rect = { ...origin };
    if (edges.left) {
        rect.x = clampInt(origin.x + dx, 0, origin.x + origin.w - 1, origin.x);
        rect.w = origin.x + origin.w - rect.x;
    } else if (edges.right) {
        rect.w = clampInt(origin.w + dx, 1, cols - origin.x, origin.w);
    }
    if (edges.top) {
        rect.y = clampInt(origin.y + dy, 0, origin.y + origin.h - 1, origin.y);
        rect.h = origin.y + origin.h - rect.y;
    } else if (edges.bottom) {
        rect.h = clampInt(origin.h + dy, 1, rows - origin.y, origin.h);
    }
    return rect;
}

export function arrangePointerMove(e: PointerEvent) {
    if (!arrangeDrag) {
        return;
    }
    const { origin, metrics, edges, resize, id, el } = arrangeDrag;
    const { cols, rows } = widgetsState.grid;
    const dx = Math.round((e.clientX - arrangeDrag.startX) / metrics.pitchX);
    const dy = Math.round((e.clientY - arrangeDrag.startY) / metrics.pitchY);
    const rect: Rect = resize
        ? resizedRect(origin, edges, dx, dy)
        : {
              x: clampInt(origin.x + dx, 0, cols - origin.w, origin.x),
              y: clampInt(origin.y + dy, 0, rows - origin.h, origin.y),
              w: origin.w,
              h: origin.h
          };
    if (JSON.stringify(rect) === JSON.stringify(arrangeDrag.rect)) {
        return;
    }
    arrangeDrag.rect = rect;
    arrangeDrag.valid = rectFree(rect, id);
    placeWidget(el, rect);
    el.classList.toggle('invalid', !arrangeDrag.valid);
}

export function arrangePointerUp(e: PointerEvent) {
    if (!arrangeDrag) {
        return;
    }
    const { id, el, rect, valid } = arrangeDrag;
    arrangeDrag = null;
    el.classList.remove('moving', 'invalid');
    try {
        widgetLayer.releasePointerCapture(e.pointerId);
    } catch {}
    const item = findWidget(id);
    if (item) {
        if (valid) {
            Object.assign(item, rect);
            saveWidgets();
            renderWidgetList();
        }
        placeWidget(el, item);
    }
}
