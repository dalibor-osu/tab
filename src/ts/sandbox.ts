let inner: HTMLIFrameElement | null = null;

function mount(html: string) {
    if (inner) {
        inner.remove();
    }
    inner = document.createElement('iframe');
    inner.setAttribute('sandbox', 'allow-scripts allow-forms');
    inner.srcdoc = html;
    document.body.appendChild(inner);
}

window.addEventListener('message', e => {
    const message = e.data;
    if (!message || typeof message !== 'object') {
        return;
    }
    if (e.source === window.parent) {
        if (message.source === 'tab-host' && message.type === 'load') {
            mount(String(message.html));
        } else if (inner && inner.contentWindow) {
            inner.contentWindow.postMessage(message, '*');
        }
    } else if (inner && e.source === inner.contentWindow) {
        window.parent.postMessage(message, '*');
    }
});

window.parent.postMessage({ source: 'tab-sandbox', type: 'sandbox-ready' }, '*');

export {};
