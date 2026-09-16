declare const BUILD_TARGET: 'web' | 'ext';
declare const BUILD_BROWSER: 'web' | 'chromium' | 'firefox';

declare module '*.html' {
    const html: string;
    export default html;
}
