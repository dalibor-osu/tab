import clockHtml from '../../widgets/clock.html';
import dateHtml from '../../widgets/date.html';
import notesHtml from '../../widgets/notes.html';
import todoHtml from '../../widgets/todo.html';
import type { WidgetType } from '../core/types';

export type BuiltinType = Exclude<WidgetType, 'external'>;

export const BUILTIN_WIDGETS: Record<BuiltinType, string> = {
    clock: clockHtml,
    date: dateHtml,
    notes: notesHtml,
    todo: todoHtml
};

export function isBuiltinType(type: WidgetType): type is BuiltinType {
    return type in BUILTIN_WIDGETS;
}
