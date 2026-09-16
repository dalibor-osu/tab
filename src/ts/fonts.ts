import type { Font } from './types';
import { webUrl } from './urls';

export const SYSTEM_STACK = "'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif";

export const FONTS: Font[] = [
    { id: 'system', label: 'System UI', stack: SYSTEM_STACK },
    {
        id: 'inter',
        label: 'Inter',
        stack: "'Inter', system-ui, sans-serif",
        google: 'Inter:wght@400;600;700'
    },
    {
        id: 'roboto',
        label: 'Roboto',
        stack: "'Roboto', system-ui, sans-serif",
        google: 'Roboto:wght@400;500;700'
    },
    {
        id: 'poppins',
        label: 'Poppins',
        stack: "'Poppins', system-ui, sans-serif",
        google: 'Poppins:wght@400;600;700'
    },
    {
        id: 'nunito',
        label: 'Nunito',
        stack: "'Nunito', system-ui, sans-serif",
        google: 'Nunito:wght@400;600;700'
    },
    {
        id: 'spaceGrotesk',
        label: 'Space Grotesk',
        stack: "'Space Grotesk', system-ui, sans-serif",
        google: 'Space+Grotesk:wght@400;600;700'
    },
    {
        id: 'jetbrains',
        label: 'JetBrains Mono',
        stack: "'JetBrains Mono', ui-monospace, monospace",
        google: 'JetBrains+Mono:wght@400;600;700'
    },
    {
        id: 'playfair',
        label: 'Playfair Display',
        stack: "'Playfair Display', Georgia, serif",
        google: 'Playfair+Display:wght@400;600;700'
    },
    { id: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
    { id: 'systemMono', label: 'System mono', stack: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
    { id: 'custom', label: 'Custom…', stack: '' }
];

export function getFont(id: string): Font {
    return FONTS.find(font => font.id === id) || FONTS[0];
}

export function resolveFont(id: string, customStack: string, customUrl: string): { stack: string; url: string } {
    if (id === 'custom') {
        return { stack: customStack.trim() || SYSTEM_STACK, url: webUrl(customUrl) };
    }
    const font = getFont(id);
    return {
        stack: font.stack,
        url: font.google ? `https://fonts.googleapis.com/css2?family=${font.google}&display=swap` : ''
    };
}
