import { scriptBridge, widgetBridge } from './bridges';
import { extensionApi, isFirefox } from '../core/extension';

const SHARED_CSP =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; " +
    "connect-src 'none'; form-action 'none'; base-uri 'none'";
export const INLINE_CSP = `${SHARED_CSP}; script-src 'unsafe-inline' 'unsafe-eval'`;

export function runnerCsp(): string {
    const api = extensionApi();
    const origin = api ? new URL(api.runtime.getURL('runner.js')).origin : "'self'";
    return `${SHARED_CSP}; script-src ${origin} 'unsafe-eval'`;
}
const BASE_STYLE =
    'html,body{margin:0;height:100%;overflow:hidden}' +
    'body{box-sizing:border-box;font-family:var(--font-stack);color:var(--text-primary)}*{box-sizing:inherit}';

function open(tag: string, attributes = ''): string {
    return '<scr' + 'ipt' + attributes + '>' + tag;
}

function close(): string {
    return '</scr' + 'ipt>';
}

function inline(code: string): string {
    return open(code) + close();
}

function inert(code: string): string {
    return open(code.replace(/<\/script/gi, '<\\/script'), ' type="text/plain" data-tab-run') + close();
}

function runnerTag(): string {
    const api = extensionApi();
    return open('', ` src="${api ? api.runtime.getURL('runner.js') : 'runner.js'}"`) + close();
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function csp(policy: string): string {
    return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

export function inertScripts(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script').forEach(script => {
        const type = (script.getAttribute('type') || '').trim().toLowerCase();
        if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) {
            return;
        }
        script.setAttribute('type', 'text/plain');
        script.setAttribute('data-tab-run', '');
        script.removeAttribute('src');
    });
    return doc.head.innerHTML + doc.body.innerHTML;
}

export function widgetDocument(html: string, themeCss: string): string {
    const head =
        '<!DOCTYPE html><html data-tab-mode="widget"><head><meta charset="utf-8">' +
        csp(isFirefox() ? runnerCsp() : INLINE_CSP) +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        `<style>:root{${themeCss}}${BASE_STYLE}</style>`;
    if (isFirefox()) {
        return head + '</head><body>' + inertScripts(html) + runnerTag() + '</body></html>';
    }
    return head + inline(`(${widgetBridge.toString()})();`) + '</head><body>' + html + '</body></html>';
}

export function scriptDocument(code: string, args: string): string {
    if (isFirefox()) {
        return (
            `<!DOCTYPE html><html data-tab-mode="script" data-tab-args="${escapeAttribute(args)}"><head>` +
            '<meta charset="utf-8">' +
            csp(runnerCsp()) +
            '</head><body>' +
            inert(code) +
            runnerTag() +
            '</body></html>'
        );
    }
    const safe = code.replace(/<\/script/gi, '<\\/script');
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        csp(INLINE_CSP) +
        inline(`(${scriptBridge.toString()})(${JSON.stringify(args)});`) +
        inline(`(async () => {\n${safe}\n})().then(value => tab.done(value), error => tab.fail(error));`) +
        '</head><body></body></html>'
    );
}
