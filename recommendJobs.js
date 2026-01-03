(() => {
// IIFE scoped namespace:

const CONFIG = {
    DEBUG: true,
    PAGE_CHANGE_WAIT_MS: 150,
    PAGE_LOAD_TIMEOUT_MS: 3000
};

// Main
try {
    main();
} catch (err) {
    sendStatusToPopup(err.message, 'error');
    throw err;
}
async function main() {
    const result = await mainRecommend();
    if (!result) {
        sendStatusToPopup("No jobs found", 'warning', 'exportDone');
        return;
    }

    sendStatusToPopup(`Done. Exported ${result.length} jobs`, '', 'recommendDone');
}

function sendStatusToPopup(msg, type, action) {
    chrome.runtime.sendMessage({
        message: msg,
        type: type,
        action: action
    });
}

function debug(...args) {
    if (CONFIG.DEBUG) console.info('[LinkedIn j2csv]', ...args);
}

async function mainRecommend() {
    // TODO
}


// end IIFE
})();