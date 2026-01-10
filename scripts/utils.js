(() => {

const CONFIG = {
    DEBUG: true,

    // for `exportToCSV.js`
    PAGE_CHANGE_WAIT_MS: 150,
    PAGE_LOAD_TIMEOUT_MS: 3000,
    MAX_PAGES: 50,

    // for `recommendJobs.js`
    RENDER_SETTLE_COUNT: 2,
    DEBOUNCE_COUNT: 15,
    DEBOUNCE_MS: 150
};

function debug(msg, level = 'info') {
    if (CONFIG.DEBUG && level === 'info') {
        console.info('[lj2csv]', msg);
    }
    switch(level) {
        case 'warning':
            console.warn('[lj2csv]', msg);
            break;
        case 'error':
            console.error('[lj2csv]', msg);
            break;
    }
}

function sendStatusToPopup(msg, type, action) {
    chrome.runtime.sendMessage({
        message: msg, type: type, action: action
    }, () => {
        const lastError = chrome.runtime.lastError;
        if (!lastError) return;
        // popup is closed
        debug(`\`sendStatusToPopup()\` error: ${lastError.message}`, 'warning');
    });
}

window.__LJ2CSV_UTILS__ = window.__LJ2CSV_UTILS__ || {
    CONFIG,
    debug,
    sendStatusToPopup
};

})();