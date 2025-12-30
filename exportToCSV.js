(() => {
// IIFE scoped namespace:

const CONFIG = {
    DEBUG: true,
    PAGE_CHANGE_WAIT_MS: 150,
    PAGE_LOAD_TIMEOUT_MS: 3000,
    MAX_PAGES: 50
};

const allJobs = [];
let pageNum = 0;
let jobNum = 0;

// Main
try {
    main();
} catch (err) {
    sendStatusToPopup(err.message, 'error');
    throw err;
}
async function main() {
    const result = await mainExport();
    if (result) {
        const csv = convertToCSV(result);
        downloadCSV(csv);
        sendStatusToPopup(`Done. Exported ${result.length} jobs`);
    } else {
        sendStatusToPopup("No jobs found", 'warning');
    }
}

function sendStatusToPopup(msg, type) {
    chrome.runtime.sendMessage({
        type: type,
        message: msg
    });
}

function debug(...args) {
    if (CONFIG.DEBUG) console.info('[LinkedIn j2csv]', ...args);
}

async function mainExport() {
    for (pageNum=0; pageNum < CONFIG.MAX_PAGES; pageNum++) {
        debug(`Processing page ${pageNum}...`);

        try {
            const jobs = extractJobs();
            debug(`Found ${jobs.length} jobs on page ${pageNum}`);
            allJobs.push(...jobs);
        } catch (err) {
            sendStatusToPopup(`ERROR extracting jobs: ${err.message}`, 'error');
            throw err;
        }

        const nextButton = document.querySelector('button.artdeco-pagination__button--next:not([disabled])');
        if (!nextButton) {
            debug("No enabled 'Next' button found, ending pagination");
            break;
        }

        const currentCards = Array.from(document.querySelectorAll('ul[role="list"] > li'));
        const currentUrls = new Set(
            currentCards.map(card => {
                const link = card.querySelector('a[href*="/jobs/view/"]');
                return link?.href || '';
            }).filter(Boolean)
        );
        debug(`Current page has ${currentUrls.size} saved job URLs`);

        nextButton.click();

        try {
            await waitForNextButton();
            debug("'Next' button found");
        } catch (err) {
            sendStatusToPopup(`ERROR waiting for page change: ${err.message}`, 'error');
            throw err;
        }
    }
    if (pageNum >= CONFIG.MAX_PAGES) {
        debug(`Reached safety limit of ${CONFIG.MAX_PAGES} pages`);
    }
    
    debug(`Extract done. Total jobs: ${allJobs.length}`);
    return allJobs;
}

function extractJobs() {
    debug("extractJobs() start:");
    const jobs = [];

    const jobCards = document.querySelectorAll('ul[role="list"] > li');
    debug(`Found ${jobCards.length} saved job card containers`);

    jobCards.forEach((card, idx) => {
        jobNum++;
        debug(`Processing card ${idx + 1}...`);

        const allJobLinks = card.querySelectorAll('a[href*="/jobs/view/"]');
        const jobTitleLink = allJobLinks[1];
        if (!jobTitleLink) {
            throw new Error(`Card ${idx + 1}: Invalid saved job link`);
        }

        debug(`Card ${idx + 1}: Found link - ${jobTitleLink.href}`);

        const jobTitleText = jobTitleLink.innerText
            .replace(/\s+/g, ' ')
            .trim();

        debug(`Found title via link: "${jobTitleText}"`);

        const textDivs = card.querySelectorAll('div[class*="t-14"]');
        debug(`Found ${textDivs.length} divs with class*="t-14"`);

        let companyText = '';
        let locationText = '';

        textDivs.forEach(div => {
            const text = div.textContent.trim();
            const classes = div.className;

            if (classes.includes('t-black') && classes.includes('t-normal') && !companyText) {
                companyText = text;
                debug(`Found company: ${companyText}`);
            } else if (text && !locationText && companyText) {
                locationText = text;
                debug(`Found location: ${locationText}`);
            }
        });

        if (jobTitleText) {
            jobs.push({
                jobNumber: jobNum.toString(),
                title: jobTitleText,
                company: companyText || '',
                location: locationText || '',
                url: jobTitleLink.href || ''
            });
            debug(`[x] Extracted job: ${jobTitleText}`);
        }
    });

    debug(`Total jobs extracted: ${jobs.length}`);

    debug("... extractJobs() end");
    return jobs;
}

async function waitForNextButton(maxWait = CONFIG.PAGE_LOAD_TIMEOUT_MS) {
    const sleep = () => new Promise(resolve => setTimeout(resolve, CONFIG.PAGE_CHANGE_WAIT_MS));
    const getPageState = () => document.querySelector('.artdeco-pagination__page-state')?.textContent.trim();
    const oldPageState = getPageState();

    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        const currPageState = getPageState();
        if (currPageState && currPageState === oldPageState) {
            debug(`Still on same page '${oldPageState}', waiting ${CONFIG.PAGE_CHANGE_WAIT_MS}ms...`);
            await sleep();
            continue;
        }

        const nextButton = document.querySelector('button.artdeco-pagination__button--next');
        if (nextButton) {
            return;
        }
        debug(`'Next' button not found, waiting ${CONFIG.PAGE_CHANGE_WAIT_MS}ms...`);
        await sleep();
    }

    throw new Error("Page load timeout");
}

function convertToCSV(jobs) {
    const headers = ['Index', 'Title', 'Company', 'Location', 'URL'];
    const rows = jobs.map(job => [
        escapeCSV(job.jobNumber),
        escapeCSV(job.company),
        escapeCSV(job.location),
        escapeCSV(job.title),
        escapeCSV(job.url)
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function escapeCSV(str) {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadCSV(csv) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkedin_saved_jobs_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// end IIFE
})();