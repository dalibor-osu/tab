import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { minify as minifyHtml } from 'html-minifier-terser';

const ROOT = resolve(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const EXT_DIR = join(ROOT, 'ext');
const TARGET = process.argv[2] === 'ext' ? 'ext' : 'web';
const OUT_DIR = join(ROOT, TARGET === 'ext' ? 'dist-ext' : 'dist');
const OUT_LABEL = TARGET === 'ext' ? 'dist-ext/' : 'dist/';
const CACHE_PLACEHOLDER = 'default-page-v1';

const PAGES = [
    { html: 'index.html', script: 'main', style: 'page', web: 'tab/index.html', ext: 'index.html', prefix: '' },
    { html: 'about.html', script: 'about', style: 'about', web: 'tab/about.html', ext: 'about.html', prefix: '' },
    { html: '404.html', script: 'notfound', style: 'notfound', web: '404.html', ext: null, prefix: '/tab/' }
];

const htmlOptions = {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    minifyCSS: true
};

function report(name, before, after) {
    const percent = Math.round((1 - after / before) * 100);
    console.log(
        `${name.padEnd(22)} ${String(before).padStart(7)} → ${String(after).padStart(7)} bytes  (-${percent}%)`
    );
}

async function bundle(entry, outdir, hashed) {
    const result = await Bun.build({
        entrypoints: [entry],
        outdir,
        target: 'browser',
        format: 'iife',
        minify: true,
        naming: hashed ? '[name].[hash].[ext]' : '[name].[ext]',
        define: { BUILD_TARGET: JSON.stringify(TARGET) }
    });
    if (!result.success) {
        result.logs.forEach(log => console.error(String(log)));
        throw new Error(`bundling ${entry} failed`);
    }
    const output = result.outputs.find(item => /\.(js|css)$/.test(item.path));
    console.log(`${basename(entry).padEnd(22)} ${'→'.padStart(8)} ${String(output.size).padStart(7)} bytes`);
    return basename(output.path);
}

function rewriteAssets(html, page, names) {
    return html
        .replace(`href="${page.style}.css"`, `href="${page.prefix}${names.css}"`)
        .replace(`src="${page.script}.js"`, `src="${page.prefix}${names.js}"`);
}

async function buildPage(page, assetDir, hashed) {
    const names = {
        js: await bundle(join(SRC_DIR, 'ts', `${page.script}.ts`), assetDir, hashed),
        css: await bundle(join(SRC_DIR, 'css', `${page.style}.css`), assetDir, hashed)
    };
    const input = await readFile(join(SRC_DIR, page.html), 'utf8');
    return { input, output: await minifyHtml(rewriteAssets(input, page, names), htmlOptions) };
}

async function buildWeb() {
    const assetDir = join(OUT_DIR, 'tab');
    await mkdir(assetDir, { recursive: true });
    const hash = createHash('sha256');
    for (const page of PAGES) {
        const { input, output } = await buildPage(page, assetDir, true);
        hash.update(output);
        await writeFile(join(OUT_DIR, page.web), output);
        report(page.web, Buffer.byteLength(input), Buffer.byteLength(output));
    }

    const version = hash.digest('hex').slice(0, 10);
    const workerInput = await readFile(join(SRC_DIR, 'sw.js'), 'utf8');
    if (!workerInput.includes(CACHE_PLACEHOLDER)) {
        throw new Error(`sw.js does not contain the cache name '${CACHE_PLACEHOLDER}'`);
    }
    const workerDir = join(OUT_DIR, '.sw');
    await mkdir(workerDir, { recursive: true });
    await writeFile(join(workerDir, 'sw.js'), workerInput.replace(CACHE_PLACEHOLDER, `default-page-${version}`));
    await bundle(join(workerDir, 'sw.js'), assetDir, false);
    await rm(workerDir, { recursive: true, force: true });

    console.log(`\nbuild ${version} written to ${OUT_LABEL}`);
}

async function buildExtension() {
    await mkdir(OUT_DIR, { recursive: true });
    for (const page of PAGES.filter(item => item.ext)) {
        const { input, output } = await buildPage(page, OUT_DIR, false);
        const adapted = output.replaceAll('href="index.html"', 'href="index.html?fresh=1"');
        await writeFile(join(OUT_DIR, page.ext), adapted);
        report(page.ext, Buffer.byteLength(input), Buffer.byteLength(adapted));
    }

    await bundle(join(SRC_DIR, 'ts', 'sandbox.ts'), OUT_DIR, false);
    const sandboxHtml = await readFile(join(EXT_DIR, 'sandbox.html'), 'utf8');
    await writeFile(join(OUT_DIR, 'sandbox.html'), await minifyHtml(sandboxHtml, htmlOptions));

    const manifest = JSON.parse(await readFile(join(EXT_DIR, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
    manifest.version = pkg.version;
    await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await cp(join(EXT_DIR, 'icons'), join(OUT_DIR, 'icons'), { recursive: true });

    console.log(`\nextension ${manifest.version} written to ${OUT_LABEL} - load it unpacked from that folder`);
}

await rm(OUT_DIR, { recursive: true, force: true });
if (TARGET === 'ext') {
    await buildExtension();
} else {
    await buildWeb();
}
