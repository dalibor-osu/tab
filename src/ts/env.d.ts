declare const BUILD_TARGET: 'web' | 'ext';

declare module '*.html' {
    const html: string;
    export default html;
}
