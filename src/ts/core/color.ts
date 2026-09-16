export interface Rgb {
    r: number;
    g: number;
    b: number;
}

export interface Hsl {
    h: number;
    s: number;
    l: number;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: unknown): Rgb {
    let value = String(hex || '').replace('#', '');
    if (value.length === 3) {
        value = value
            .split('')
            .map(c => c + c)
            .join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(value)) {
        return { r: 0, g: 0, b: 0 };
    }
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
    };
}

export function rgba(hex: string, alpha: number): string {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shade(hex: string, amount: number): string {
    const { r, g, b } = hexToRgb(hex);
    const target = amount > 0 ? 255 : 0;
    const ratio = Math.abs(amount);
    const mix = (channel: number) => Math.round(channel + (target - channel) * ratio);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) {
        return { h: 0, s: 0, l };
    }

    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) {
        h = 60 * (((g - b) / d) % 6);
    } else if (max === g) {
        h = 60 * ((b - r) / d + 2);
    } else {
        h = 60 * ((r - g) / d + 4);
    }
    return { h: (h + 360) % 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
        h < 60
            ? [c, x, 0]
            : h < 120
              ? [x, c, 0]
              : h < 180
                ? [0, c, x]
                : h < 240
                  ? [0, x, c]
                  : h < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    const channel = (value: number) =>
        Math.round((value + m) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}
