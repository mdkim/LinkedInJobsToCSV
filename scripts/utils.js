(() => {

const CONFIG = {
    DEBUG: true,

    // for `popup.js`
    OPEN_TAB_CHILL_MS: 800,

    // for `exportToCSV.js`
    PAGE_CHANGE_WAIT_MS: 150,
    PAGE_LOAD_TIMEOUT_MS: 3000,
    MAX_PAGES: 50,

    // for `recommendJobs.js`
    RENDER_SETTLE_COUNT: 2,
    DEBOUNCE_COUNT: 15,
    DEBOUNCE_MS: 150,

    // for `jobHighlights.js`, 'recommendJobs.js`
    HIGHLIGHT_SKILLS: [
        "java", "php", "python", "react", "ruby", "rust", "golang",
        "aws", "\\.net", "ai", "llm", "stack", "data", "remote",
        "years", "lead", "expert", "proficiency", "advanced"
    ]
};

function debug(msg, level = 'info') {
    if (CONFIG.DEBUG && level === 'info') {
        console.info('[lj2csv]', msg);
    }
    switch(level) {
        case 'warning':
            console.warn('[lj2csv] [warn]', msg);
            break;
        case 'error':
            console.error('[lj2csv] [error]', msg);
            break;
    }
}

function sendStatusToPopup(msg, type = 'info', action = 'status') {
    debug(`\`sendStatusToPopup()\`: ${msg}`, type);

    chrome.runtime.sendMessage({
        message: msg,
        type,
        action
    }, () => {
        const lastError = chrome.runtime.lastError;
        if (!lastError) return;
        debug(`\`sendStatusToPopup()\` Popup is closed: ${lastError.message}`);
    });
}

window.__LJ2CSV_UTILS__ = window.__LJ2CSV_UTILS__ || {
    CONFIG,
    debug,
    sendStatusToPopup
};

})();