document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('ext-closePopupBtn').addEventListener('click', () => {
        window.close();
    });
    document.getElementById('ext-exportBtn').addEventListener('click', handleExportClick);
    document.getElementById('ext-recommendBtn').addEventListener('click', handleRecommendClick);
});

chrome.runtime.onMessage.addListener((msg) => {
    setStatus(msg.message, msg.type);

    let loadingSpinner;
    if (msg.action === 'exportDone') {
        loadingSpinner = document.getElementById('ext-loadingSpinner-export');
    }
    if (msg.action === 'recommendDone') {
        loadingSpinner = document.getElementById('ext-loadingSpinner-recommend');
    }
    if (loadingSpinner) loadingSpinner.style.display = 'none';
});

// requires `popup.js` to be loaded after 'ext-status' div
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

    const loadingSpinner = document.getElementById('ext-loadingSpinner-export');
    loadingSpinner.style.display = 'block';

    const isExportToExcel = document.querySelector('#ext-xlsxCheckbox').checked;
    await chrome.storage.local.set({ isExportToExcel });

    const jsFiles = ['exportToCSV.js'];
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
        setStatus("`exportToCSV.js` Injection error: ${err.message}", 'error');
    } finally {
        setChromeAPIErrorStatus();
    }
}

async function handleRecommendClick() {
    setStatus("Analyzing company profile...");

    const JOB_URLS = [
        'https://www.linkedin.com/jobs/view/',
        'https://www.linkedin.com/jobs/search-results/'
    ];
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!JOB_URLS.some(prefix => tab.url?.startsWith(prefix))) {
        setStatus("Not a LinkedIn job posting page", 'error');
        return;
    }

    const [{result: companyUrl}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.querySelector('a[href*="linkedin.com/company/"]')?.href
    });
    if (!companyUrl) {
        setStatus("Company URL not found", 'error');
        return;
    }

    const loadingSpinner = document.getElementById('ext-loadingSpinner-recommend');
    loadingSpinner.style.display = 'block';

    const { id: newTabId } = await chrome.tabs.create({ url: companyUrl, active: false });

    // wait for the job posting page to load in new tab
    await new Promise(
        /** @param {function(chrome.webNavigation.NavigationDetails): void} resolve */
        (resolve) => {
            /**  @param {chrome.webNavigation.NavigationDetails} details */
            const listener = (details) => {
                if (details.tabId === newTabId && details.frameId === 0) {
                    chrome.webNavigation.onCompleted.removeListener(listener);
                    resolve(details);
                }
            };
            chrome.webNavigation.onCompleted.addListener(listener);
        }
    );

    try {
        await chrome.scripting.executeScript({
            target: { tabId: newTabId },
            files: ["recommendJob.js"]
        });
    } catch (err) {
        setStatus("`recommendJob.js` Injection error: ${err.message}", 'error');
    } finally {
        setChromeAPIErrorStatus();
    }
}

function setChromeAPIErrorStatus() {
    if (chrome.runtime.lastError) {
        setStatus(`Chrome API error: ${chrome.runtime.lastError.message}`, 'error');
    }
}
