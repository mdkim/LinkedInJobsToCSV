const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

let isPopupAlive = true;

showExportedJobsInfo();

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ext-closePopupBtn').addEventListener('click', () => {
        window.close();
    });
    document.getElementById('ext-exportBtn').addEventListener('click', handleExportClick);
    document.getElementById('ext-recommendBtn').addEventListener('click', handleRecommendClick);
    document.getElementById('ext-highlightsBtn').addEventListener('click', handleHighlightsClick);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'open_company_jobs') {
        if (!isPopupAlive) return;
        openTabAndInject(msg.companyUrl, msg.injectedDivHTML);

        // calm down the tab creation
        new Promise(r => setTimeout(r, CONFIG.OPEN_TAB_CHILL_MS));

        openTabAndInject(msg.companyUrl, msg.injectedDivHTML);

        sendResponse({ status: 'ok' });
        return;
    }

    if (msg.action === 'download') {
        // using chrome.downloads to prevent popup from closing after save dialog
        const blob = new Blob([new Uint8Array(msg.buffer)], { type: msg.type });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: msg.filename });
        sendResponse({ status: 'ok' });
        return;
    }

    if (!['status', 'export_done', 'recommend_done', 'highlights_done'].includes(msg.action)) {
        debug(`Popup ignoring message: ${msg.action}`);
        return;
    }

    // msg.action === 'status' or 'export_done' or 'recommend_done' or 'highlights_done'
    setStatus(msg.message, msg.type);

    let loadingSpinner;
    let button;
    if (msg.action === 'export_done') {
        button = document.getElementById('ext-exportBtn');
        loadingSpinner = document.getElementById('ext-loadingSpinner-export');
        showExportedJobsInfo();
    }
    if (msg.action === 'recommend_done') {
        button = document.getElementById('ext-recommendBtn');
        loadingSpinner = document.getElementById('ext-loadingSpinner-recommend');
    }
    if (msg.action === 'highlights_done') {
        button = document.getElementById('ext-highlightsBtn');
        //loadingSpinner = document.getElementById('ext-loadingSpinner-highlights');
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
            err => {
                setStatus(`Error opening new tab: ${err.message}`, 'error')
                throw err;
            }
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

    pendingTabs.delete(tabId);

    chrome.tabs.sendMessage(tabId, {
        action: 'insert_div',
        divHTML: injectedDivHTML
    }).catch(err => {
        isPopupAlive = false;
        setStatus(`'insert_div' in tab (${tabId}) Injection error: ${err.message}`, 'error');
        throw err;
    });
});

async function showExportedJobsInfo() {
    const exportInfo = document.getElementById('ext-export-info');
    const { exportedJobsInfo } = await chrome.storage.local.get('exportedJobsInfo');
    if (!exportedJobsInfo) {
        exportInfo.innerHTML = '<em>No exported jobs</em>';
        return;
    }

    exportInfo.innerHTML =
        `<em>Last exported ${exportedJobsInfo.jobsCount} jobs:
${exportedJobsInfo.lastUpdated}</em>`;
// TODO: calculate and show days since last export

}

const extStatus = document.getElementById('ext-status');

function setStatus(msg, type) {
    extStatus.classList.remove('ext-status--error', 'ext-status--warning');
    switch (type) {
        case 'warning':
            extStatus.classList.add('ext-status--warning');
            debug(msg, 'warning');
            break;
        case 'error':
            extStatus.classList.add('ext-status--error');
            debug(msg, 'error');
            break;
    }
    extStatus.textContent = msg;
    extStatus.style.display = 'block';
}

async function handleExportClick() {
    setStatus("Gathering Saved Jobs from all pages...");
    isPopupAlive = true;

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

    const jsFiles = ['scripts/utils.js', 'scripts/exportToCSV.js'];
    if (isExportToExcel) {
        //jsFiles.unshift('vendor/xlsx.mini.min.js'); // SheetJS
        jsFiles.unshift('vendor/exceljs.min.js');
    }
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: jsFiles
        });
    } catch (err) {
        setStatus(`'exportToCSV.js' Injection error: ${err.message}`, 'error');
        throw err;
    } finally {
        setChromeAPIErrorStatus();
    }
}

async function handleRecommendClick() {
    setStatus("Gathering job recommendations...");
    isPopupAlive = true;

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
            files: ['scripts/utils.js', 'scripts/recommendJobs.js']
        });
    } catch (err) {
        setStatus(`'recommendJobs.js' Injection error: ${err.message}`, 'error');
        throw err;
    } finally {
        setChromeAPIErrorStatus();
    }
}

async function handleHighlightsClick() {
    setStatus("Gathering job recommendations...");
    isPopupAlive = true;

    const JOB_URLS = [
        'https://www.linkedin.com/jobs/collections/',
        'https://www.linkedin.com/jobs/search-results/',
        'https://www.linkedin.com/jobs/view/'
    ];
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!JOB_URLS.some(prefix => tab.url?.startsWith(prefix))) {
        setStatus("Not a LinkedIn job post page", 'error');
        return;
    }

    const button = document.getElementById('ext-recommendBtn');
    button.disabled = true;
    //const loadingSpinner = document.getElementById('ext-loadingSpinner-recommend');
    //loadingSpinner.style.display = 'block'

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['scripts/utils.js', 'scripts/jobHighlights.js']
        });
    } catch (err) {
        setStatus(`'jobHighlights.js' Injection error: ${err.message}`, 'error');
        throw err;
    } finally {
        setChromeAPIErrorStatus();
    }
}

function setChromeAPIErrorStatus() {
    if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError;
        setStatus(`Chrome API error: ${err.message}`, 'error');
        throw err;
    }
}
