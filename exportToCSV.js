(() => {
// IIFE scoped namespace:

const CONFIG = {
    DEBUG: true,
    PAGE_CHANGE_WAIT_MS: 300,
    PAGE_LOAD_TIMEOUT_MS: 10000,
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
    //if (!type) type = 'info';
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
            debug("No enabled next button found, ending pagination");
            break;
        }

        const currentCards = Array.from(document.querySelectorAll('ul[role="list"] > li'));
        const currentUrls = new Set(
            currentCards.map(card => {
                const link = card.querySelector('a[href*="/jobs/view/"]');
                return link?.href || '';
            }).filter(Boolean)
        );
        debug(`Current page has ${currentUrls.size} saved job URLs tracked`);

        nextButton.click();

        try {
            await waitForPageChange(currentUrls);
            debug("Page change detected");
        } catch (err) {
            sendStatusToPopup(`ERROR waiting for page change: ${err.message}`, 'error');
            throw err;
        }
    }
    if (pageNum >= CONFIG.MAX_PAGES) {
        debug(`Reached safety limit of ${CONFIG.MAX_PAGES} pages`);
    }
    
    debug(`Extraction complete. Total jobs: ${allJobs.length}`);
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

async function waitForPageChange(oldUrls, maxWait = CONFIG.PAGE_LOAD_TIMEOUT_MS) {
    const startTime = Date.now();

    // TODO: how about just checking for existence of Next button
    while (Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const currentCards = Array.from(document.querySelectorAll('ul[role="list"] > li'));
        const newUrls = new Set(
            currentCards.map(card => {
                // DOM has changed since extractJobs()
                const allLinks = card.querySelectorAll('a[href*="/jobs/view/"]');
                const link = allLinks.length > 1 ? allLinks[1] : allLinks[0];
                return link?.href || '';
            }).filter(Boolean)
        );

        const hasNewContent = Array.from(newUrls).some(url => !oldUrls.has(url));

        if (hasNewContent && newUrls.size > 0) {
            debug(`Page changed detected (${newUrls.size} saved job URLs now present)`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.PAGE_CHANGE_WAIT_MS));
            return;
        }
    }

    throw new Error("Page load timeout");
}

function convertToCSV(jobs) {
    const headers = ['Index', 'Title', 'Company', 'Location', 'URL'];
    const rows = jobs.map(job => [
        escapeCSV(job.jobNumber),
        escapeCSV(job.title),
        escapeCSV(job.company),
        escapeCSV(job.location),
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