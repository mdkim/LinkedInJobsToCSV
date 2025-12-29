document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ext-closePopupBtn').addEventListener('click', () => {
        window.close();
    });
    document.getElementById('ext-export').addEventListener('click', handleExportClick);
});

const extStatus = document.getElementById('ext-status');
chrome.runtime.onMessage.addListener((msg) => {
    setStatus(msg.message, msg.type);
    if (msg.stack) console.trace("popup.js:", msg.stack);
});
function setStatus(msg, type) {
    extStatus.classList.remove('ext-status--error', 'ext-status--warning');
    switch (type) {
        case 'warning':
            extStatus.classList.add('ext-status--warning');
            break;
        case 'error':
            extStatus.classList.add('ext-status--error');
            break;
    }
    extStatus.textContent = msg;
    extStatus.style.display = 'block';
}

async function handleExportClick() {
    setStatus("Gathering Saved Jobs from all pages...");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.startsWith('https://www.linkedin.com/my-items/saved-jobs/')) {
        setStatus("Not a LinkedIn Saved Jobs page", 'error');
        return;
    }

    const loadingSpinner = document.getElementById('ext-loadingSpinner');
    loadingSpinner.style.display = 'block';
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['exportToCSV.js']
    });
    loadingSpinner.style.display = 'none';

    if (chrome.runtime.lastError) {
        setStatus(`Chrome API error: ${chrome.runtime.lastError.message}`, 'error');
        return;
    }
}
