import { applyStoredTheme } from './theme/pageTheme';

applyStoredTheme();

if (
    BUILD_TARGET === 'web' &&
    'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost')
) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
