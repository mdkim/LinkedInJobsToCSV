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
    if (!result) {
        sendStatusToPopup("No jobs found", 'warning', 'exportDone');
        return;
    }

    const { isExportToExcel } = await chrome.storage.local.get('isExportToExcel');
    if (isExportToExcel) {
        //downloadXLSX(result);
        downloadExcelJS(result);
    } else {
        const csv = convertToCSV(result);
        downloadCSV(csv);
    }
    sendStatusToPopup(`Done. Exported ${result.length} jobs`, '', 'exportDone');
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
    debug(`Found ${jobCards.length} saved job cards`);

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
            .replace(/\s*, Verified/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        debug(`Found title via link: "${jobTitleText}"`);

        const textDivs = card.querySelectorAll('div[class*="t-14"]');
        debug(`Found ${textDivs.length} divs with [class*="t-14"]`);

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

        const comopanySlug = getCompanySlug(card, companyText);
        const companyUrl = `https://www.linkedin.com/company/${comopanySlug}/jobs/`;
        const spans = card.querySelectorAll('.reusable-search-simple-insight__text-container span.reusable-search-simple-insight__text--small');
        const lastSpan = spans[spans.length - 1]; // ignore "Actively reviewing applicants", "Be an early applicant" etc
        const insightText = lastSpan.innerText.trim();

        const insightValue = getInsightValue(insightText);
        debug(`(Page ${pageNum+1}) insightValue: ${insightValue}, companySlug: ${comopanySlug}`);

        if (jobTitleText) {
            jobs.push({
                jobNumber: jobNum,
                company: companyText || '',
                location: locationText || '',
                title: jobTitleText || '',
                companySlug: comopanySlug || '',
                companyUrl: companyUrl || '',
                url: jobTitleLink.href || '',
                insight: insightValue
            });
            debug(`[x] Extracted job: ${jobTitleText}`);
        }
    });

    debug(`Total jobs extracted: ${jobs.length}`);
    debug("... extractJobs() end");
    return jobs;
}

function getCompanySlug(card, companyText) {
    const companyTextFromAlt = card.querySelector('.ivm-view-attr__img--centered').getAttribute('alt').trim();
    const normTextFromAlt = companyTextFromAlt.toLowerCase().replace(/[^\w]/g, '');
    const normText = companyText.toLowerCase().replace(/[^\w]/g, '');
    if (normTextFromAlt !== normText) {
        sendStatusToPopup(`"${normText}" !== "${normTextFromAlt}"`, 'warning');
        debug(`[warn] (Page ${pageNum+1}) Mismatch: Alt("${normTextFromAlt}") !== Text("${normText}")`);
    }
    const companySlug = companyText
        .toLowerCase()
        .replace(/[^\w\s-&]/g, '') // remove ! and ' etc
        .replace(/\s+/g, '-');
        //.replace(/-+/g, '-'); // for " - " etc
    return companySlug;
}

function getInsightValue(str) {
    if (!str) return -2;
    if (str.startsWith("No longer accepting applications")) return -1;

    const timeMatch = str.match(/Posted\s+(\d+)([mowdh]{1,2})\s+ago.*/);
    if (!timeMatch) return -2;

    const value = parseInt(timeMatch[1], 10);
    const unit = timeMatch[2];
    switch (unit) {
        case 'mo': return 30 * value;
        case 'w': return 7 * value;
        case 'd': return value;
        case 'h': return 0.5;
    }
    return -2;
}

async function waitForNextButton(maxWait = CONFIG.PAGE_LOAD_TIMEOUT_MS) {
    const sleep = () => new Promise(resolve => setTimeout(resolve, CONFIG.PAGE_CHANGE_WAIT_MS));
    const getPageState = () => document.querySelector('.artdeco-pagination__page-state')?.
        textContent.trim();
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
    const headers = [
        'Index', 'Company', 'Location', 'Title',
        'Company Link', 'Job Link', 'Posted days'
    ];
    const rows = jobs.map(job => [
        job.jobNumber,
        escapeCSV(job.company),
        escapeCSV(job.location),
        escapeCSV(job.title),
        escapeCSV(job.companyUrl),
        escapeCSV(job.url),
        job.insight
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function escapeCSV(str) {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function getFilename() {
    const d = new Date();
    const pad = (num) => num.toString().padStart(2, '0');
    const datetime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        + ` ${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `Saved Jobs ${datetime}`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
function downloadCSV(csv) {
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `${getFilename()}.csv`);
}

// Not used (SheetJS), see `downloadExcelJS()`
function downloadXLSX(jobs) {
    // Using SheetJS
    const jsonJobs = jobs.map(job => ({
        'Index': job.jobNumber,
        'Company': job.company,
        'Location': job.location,
        'Title': job.title,
        // 'URL': { t: type, v: display_value, l: link_object }
        'Company Link': {
            t: 's',
            v: job.companySlug, // job.companyUrl,
            l: { Target: job.companyUrl, Tooltip: `${job.companyUrl}` }
        },
        'Job Link': {
            t: 's',
            v: "Open Job Link", // job.url,
            l: { Target: job.url, Tooltip: `${job.url}` }
        },
        'Posted days': job.insight
    }));

    const worksheet = XLSX.utils.json_to_sheet(jsonJobs);
    worksheet['!cols'] = [
        { wch: 8 },  // Index
        { wch: 24 }, // Company
        { wch: 30 }, // Location
        { wch: 48 }, // Title
        { wch: 24 }, // Company Link
        { wch: 14 }, // Job Link
        { wch: 8 }   // Posted days
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Saved Jobs");
    XLSX.writeFile(workbook, `${getFilename()}.xlsx`);
}

async function downloadExcelJS(jobs) {
    // Using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Saved Jobs');

    const rows = jobs.map(job => [
        job.jobNumber,
        job.company,
        job.location,
        job.title,
        { text: job.companySlug, hyperlink: job.companyUrl, tooltip: job.companyUrl },
        { text: 'Open Job Link', hyperlink: job.url, tooltip: job.url },
        job.insight
    ]);

    const table = sheet.addTable({
        name: 'JobsTable',
        ref: 'A1',
        headerRow: true,
        style: {
            theme: 'TableStyleDark9',
            showRowStripes: true,
        },
        columns: [
            { name: 'Index', filterButton: true },
            { name: 'Company', filterButton: true },
            { name: 'Location', filterButton: true },
            { name: 'Title' },
            { name: 'Company Link' },
            { name: 'Job Link' },
            { name: 'Posted days', filterButton: true },
        ],
        rows: rows
    });

    const colWidths = [8, 24, 30, 48, 24, 14, 8];
    sheet.columns.forEach((col, i) => {
        col.width = colWidths[i];
    });

    // blue underline font
    [5, 6].forEach(colIndex => {
        sheet.getColumn(colIndex).eachCell((cell) => {
            if (!cell.value || !cell.value.hyperlink) return;
            cell.font = {
                color: { argb: 'FF0000FF' },
                underline: true
            };
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    downloadBlob(blob, `${getFilename()}.xlsx`);
}

// end IIFE
})();