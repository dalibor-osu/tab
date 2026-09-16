import { applyStoredTheme } from './theme/pageTheme';

applyStoredTheme();

function start() {
    const requestedPath = document.getElementById('requestedPath');
    if (requestedPath) {
        requestedPath.textContent = location.pathname + location.search;
    }

    const backBtn = document.getElementById('backBtn') as HTMLButtonElement | null;
    if (!backBtn) {
        return;
    }
    if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) {
        backBtn.addEventListener('click', () => history.back());
    } else {
        backBtn.hidden = true;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
