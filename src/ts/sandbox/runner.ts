import { scriptBridge, widgetBridge } from './bridges';

interface ScriptTab {
    done(value: unknown): void;
    fail(error: unknown): void;
}

const root = document.documentElement;
const blocks = [...document.querySelectorAll<HTMLScriptElement>('script[data-tab-run]')].map(
    script => script.textContent || ''
);

function execute(code: string): unknown {
    return new Function(code)();
}

if (root.dataset.tabMode === 'script') {
    scriptBridge(root.dataset.tabArgs || '');
    const tab = (window as unknown as { tab: ScriptTab }).tab;
    try {
        const result = execute(`return (async () => {\n${blocks.join('\n')}\n})();`) as Promise<unknown>;
        result.then(
            value => tab.done(value),
            error => tab.fail(error)
        );
    } catch (error) {
        tab.fail(error);
    }
} else {
    widgetBridge();
    blocks.forEach(code => {
        try {
            execute(code);
        } catch (error) {
            console.error(error);
        }
    });
}

export {};
