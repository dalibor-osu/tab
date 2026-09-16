import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'ext', 'icons');
const SIZES = [16, 48, 128];
const SUPERSAMPLE = 4;
const GRADIENT_FROM = [196, 77, 255];
const GRADIENT_TO = [118, 38, 184];

const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(size, rgba) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = [];
    for (let y = 0; y < size; y++) {
        rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(Buffer.concat(rows))),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function roundedSquareCoverage(x, y, size) {
    const radius = size * 0.22;
    const half = size / 2;
    const dx = Math.max(Math.abs(x - half) - (half - radius), 0);
    const dy = Math.max(Math.abs(y - half) - (half - radius), 0);
    return Math.hypot(dx, dy) <= radius ? 1 : 0;
}

function glassCoverage(x, y, size) {
    const cx = size * 0.44;
    const cy = size * 0.44;
    const ring = size * 0.2;
    const stroke = size * 0.085;
    const distanceToRing = Math.abs(Math.hypot(x - cx, y - cy) - ring);
    if (distanceToRing <= stroke / 2) {
        return 1;
    }
    const startX = cx + ring * Math.SQRT1_2;
    const startY = cy + ring * Math.SQRT1_2;
    const endX = size * 0.78;
    const endY = size * 0.78;
    const t = Math.max(
        0,
        Math.min(
            1,
            ((x - startX) * (endX - startX) + (y - startY) * (endY - startY)) /
                ((endX - startX) ** 2 + (endY - startY) ** 2)
        )
    );
    const px = startX + t * (endX - startX);
    const py = startY + t * (endY - startY);
    return Math.hypot(x - px, y - py) <= stroke / 2 ? 1 : 0;
}

function render(size) {
    const rgba = Buffer.alloc(size * size * 4);
    const samples = SUPERSAMPLE * SUPERSAMPLE;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let shape = 0;
            let glass = 0;
            for (let sy = 0; sy < SUPERSAMPLE; sy++) {
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    const px = x + (sx + 0.5) / SUPERSAMPLE;
                    const py = y + (sy + 0.5) / SUPERSAMPLE;
                    const inside = roundedSquareCoverage(px, py, size);
                    shape += inside;
                    glass += inside * glassCoverage(px, py, size);
                }
            }
            const alpha = shape / samples;
            const white = shape ? glass / shape : 0;
            const mix = (x + y) / (2 * size);
            const offset = (y * size + x) * 4;
            for (let channel = 0; channel < 3; channel++) {
                const base = GRADIENT_FROM[channel] + (GRADIENT_TO[channel] - GRADIENT_FROM[channel]) * mix;
                rgba[offset + channel] = Math.round(base + (255 - base) * white);
            }
            rgba[offset + 3] = Math.round(alpha * 255);
        }
    }
    return rgba;
}

await mkdir(OUT_DIR, { recursive: true });
for (const size of SIZES) {
    const file = join(OUT_DIR, `icon${size}.png`);
    await writeFile(file, encodePng(size, render(size)));
    console.log(`wrote ${file}`);
}
