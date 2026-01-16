const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

let isPopupAlive = true;

showExportedJobsInfo();

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ext-closePopupBtn').addEventListener('click', () => {
        window.close();
    });

    document.getElementById('ext-exportBtn').addEventListener('click', () => {
        handleExportClick().catch((err) => {
            setStatus(`\`handleExportClick()\` error: ${err.message}`, 'error');
        });
    });
    document.getElementById('ext-recommendBtn').addEventListener('click', () => {
        const input = document.getElementById('ext-recommend-tabs')
        if (input.value === '') input.value = input.placeholder;
        handleRecommendClick().catch((err) => {
            setStatus(`\`handleRecommendClick()\` error: ${err.message}`, 'error');
        });
    });
    document.getElementById('ext-highlightsBtn').addEventListener('click', () => {
        handleHighlightsClick().catch((err) => {
            setStatus(`\`handleHighlightsClick()\` error: ${err.message}`, 'error');
        });
    });

    const tabsAllCheck = document.getElementById('ext-recommend-tabs-all');
    tabsAllCheck.addEventListener('change', () => {
        document.getElementById('ext-recommend-tabs').disabled = tabsAllCheck.checked;
        tabsAllCheck.nextElementSibling.classList.toggle('grayed');
    });
    document.getElementById('ext-recommend-tabs').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('ext-recommendBtn').click();
    });
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

    const lastUpdated = exportedJobsInfo.lastUpdated;
    const daysAgo = Math.floor(
        (new Date().getTime() - lastUpdated) / (1000*60*60*24)
    );
    const daysAgoStr = (daysAgo === 0 ? 'Today' : (
        daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`
    ));
    exportInfo.innerHTML =
        `<em title="${new Date(lastUpdated).toLocaleString()}">Last exported
<strong>${exportedJobsInfo.jobsCount} jobs</strong>
&nbsp;(${daysAgoStr})</em>`;
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
    if (!tab.url.startsWith('https://www.linkedin.com/my-items/saved-jobs/')) {
        setStatus("Not a LinkedIn Saved Jobs page", 'error');
        return;
    }

    const button = document.getElementById('ext-exportBtn');
    button.disabled = true;
    const loadingSpinner = document.getElementById('ext-loadingSpinner-export');
    loadingSpinner.style.display = 'block';

    await chrome.storage.local.set({
        isExportToExcel: document.getElementById('ext-xlsxCheckbox').checked
    });

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
        'https://www.linkedin.com/jobs/search/',
        'https://www.linkedin.com/jobs/search-results/',
        'https://www.linkedin.com/jobs/collections/'
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

    let maxTabsToOpen = Number(document.getElementById('ext-recommend-tabs').value);
    maxTabsToOpen = !isNaN(maxTabsToOpen) ? maxTabsToOpen : 0;
    await chrome.storage.local.set({
        isStartAtSelectedJob: !document.getElementById('ext-recommend-tabs-all').checked,
        maxTabsToOpen
    });

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
    setStatus("Gathering job highlights...");
    isPopupAlive = true;

    const JOB_URLS = [
        'https://www.linkedin.com/jobs/search/',
        'https://www.linkedin.com/jobs/view/',
        'https://www.linkedin.com/jobs/search-results/',
        'https://www.linkedin.com/jobs/collections/'
    ];
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!JOB_URLS.some(prefix => tab.url?.startsWith(prefix))) {
        setStatus("Not a LinkedIn job post page", 'error');
        return;
    }

    const button = document.getElementById('ext-highlightsBtn');
    button.disabled = true;
    //const loadingSpinner = document.getElementById('ext-loadingSpinner-highlights');
    //loadingSpinner.style.display = 'block'

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
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
