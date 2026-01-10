const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ext-closePopupBtn').addEventListener('click', () => {
        window.close();
    });
    document.getElementById('ext-exportBtn').addEventListener('click', handleExportClick);
    document.getElementById('ext-recommendBtn').addEventListener('click', handleRecommendClick);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'open_company_jobs') {
        openTabAndInject(msg.companyUrl, msg.injectedDivHTML);
        sendResponse({status: 'ok'});
        return;
    }

    if (!['export_done', 'recommend_done'].includes(msg.action)) {
        sendResponse({ status: 'ignored', message: `action '${msg.action}' not found` });
        return;
    }

    setStatus(msg.message, msg.type);

    let loadingSpinner;
    let button;
    if (msg.action === 'export_done ') {
        button = document.getElementById('ext-exportBtn');
        loadingSpinner = document.getElementById('ext-loadingSpinner-export');
        showExportedJobs();
    }
    if (msg.action === 'recommend_done') {
        button = document.getElementById('ext-recommendBtn');
        loadingSpinner = document.getElementById('ext-loadingSpinner-recommend');
    }
    if (button) button.disabled = false;
    if (loadingSpinner) loadingSpinner.style.display = 'none';

    sendResponse({status: 'ok'});
});

const pendingTabs = new Map();
function openTabAndInject(url, injectedDivHTML) {
    chrome.tabs.create({ url, active: false })
        .then(mewTab => {
            pendingTabs.set(mewTab.id, { injectedDivHTML });
        }).catch(
            err => setStatus(`Error opening new tab: ${err.message}`, 'error')
        );
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status !== 'complete') {
        //debug(`Tab (${tabId}) updated, but not complete`);
        return;
    }

    const { injectedDivHTML } = pendingTabs.get(tabId) || {};
    if (!injectedDivHTML) {
        //debug(`Tab (${tabId}) not found in \`pendingTabs\``);
        return;
    }

    chrome.tabs.sendMessage(tabId, {
        action: 'insert_div',
        divHTML: injectedDivHTML
    }).catch(err => {
        setStatus(`'insert_div' in tab (${tabId}) Injection error: ${err.message}`, 'warning');
    });

   pendingTabs.delete(tabId);
});

async function showExportedJobs() {
    const { exportedJobs } = await chrome.storage.local.get('exportedJobs');
    if (exportedJobs) {
        debugger;
        // TODO: show exportedJobs.length + 'Last updated' datetime + small Clear (Trash) button
    }
}

const extStatus = document.getElementById('ext-status');

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

    const button = document.getElementById('ext-exportBtn');
    button.disabled = true;
    const loadingSpinner = document.getElementById('ext-loadingSpinner-export');
    loadingSpinner.style.display = 'block';

    const isExportToExcel = document.querySelector('#ext-xlsxCheckbox').checked;
    await chrome.storage.local.set({ isExportToExcel });

    const jsFiles = ['utils.js', 'exportToCSV.js'];
    if (isExportToExcel) {
        //jsFiles.unshift('xlsx.mini.min.js'); // SheetJS
        jsFiles.unshift('exceljs.min.js');
    }
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: jsFiles
        });
    } catch (err) {
        setStatus(`'exportToCSV.js' Injection error: ${err.message}`, 'error');
    } finally {
        setChromeAPIErrorStatus();
    }
}

async function handleRecommendClick() {
    setStatus("Gathering job recommendations...");

    const JOB_URLS = [
        'https://www.linkedin.com/jobs/collections/',
        'https://www.linkedin.com/jobs/search-results/'
    ];
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!JOB_URLS.some(prefix => tab.url?.startsWith(prefix))) {
        setStatus("Not a LinkedIn job search page", 'error');
        return;
    }

    const button = document.getElementById('ext-recommendBtn');
    button.disabled = true;
    const loadingSpinner = document.getElementById('ext-loadingSpinner-recommend');
    loadingSpinner.style.display = 'block';

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['utils.js', 'recommendJobs.js']
        });
    } catch (err) {
        setStatus(`'recommendJobs.js' Injection error: ${err.message}`, 'error');
    } finally {
        setChromeAPIErrorStatus();
    }
}

function setChromeAPIErrorStatus() {
    if (chrome.runtime.lastError) {
        setStatus(`Chrome API error: ${chrome.runtime.lastError.message}`, 'error');
    }
}
