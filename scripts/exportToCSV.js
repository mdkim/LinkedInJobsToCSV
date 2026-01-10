(async () => {
// IIFE scoped namespace:

const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

const allJobs = [];
let pageNum = 0;
let jobNum = 0;

// Main
const start = Date.now();
await main()
    .then(() => {
        debug(`\`exportToCSV.js\` execution time: ${Date.now() - start}ms`);
    })
    .catch((err) => {
        sendStatusToPopup(err.message, 'error');
        throw err;
    });

async function main() {
    const result = await mainExport()
        .catch((err) => {
            sendStatusToPopup(err.message, 'error');
            throw err;
        });
    if (!result) {
        sendStatusToPopup("No jobs found", 'warning', 'export_done ');
        return;
    }

    const { isExportToExcel } = await chrome.storage.local.get('isExportToExcel');
    if (isExportToExcel) {
        //downloadXLSX(result); // SheetJS
        await downloadExcelJS(result); // ExcelJS
    } else {
        const csv = convertToCSV(result);
        downloadCSV(csv);
    }
    sendStatusToPopup(`Done. Exported ${result.length} jobs`, '', 'export_done ');
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

        await waitForNextButton()
            .catch((err) => {
                sendStatusToPopup(`ERROR waiting for page change: ${err.message}`, 'error');
                throw err;
            });
        debug("'Next' button found");
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
        const spans = card.querySelectorAll('.reusable-search-simple-insight__text-container'
            + ' span.reusable-search-simple-insight__text--small');

        // ignore "Actively reviewing applicants", "Be an early applicant" etc
        const lastSpan = spans[spans.length - 1];
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

// Using ExcelJS
async function downloadExcelJS(jobs) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Saved Jobs');

    const rows = jobs.map(job => [
        job.jobNumber,
        job.company,
        job.location,
        job.title,
        { text: job.companySlug, hyperlink: job.companyUrl, tooltip: job.companyUrl },
        { text: 'Open Job Link', hyperlink: job.url, tooltip: job.url },
        job.insight
    ]);

    worksheet.addTable({
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
    worksheet.columns.forEach((col, i) => {
        col.width = colWidths[i];
    });

    [5, 6].forEach(colIndex => {
        worksheet.getColumn(colIndex).eachCell((cell) => {
            if (!cell.value || !cell.value.hyperlink) return;
            cell.font = {
                color: { argb: 'FF0000FF' }, // blue
                underline: true
            };
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    downloadBlob(blob, `${getFilename()}.xlsx`);

    await chrome.storage.local.set({ exportedJobs: rows });
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

    // convert to ExcelJS style `rows`, then:
    //await chrome.storage.local.set({ exportedJobs: rows });
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

/* // Not used (SheetJS), see `downloadExcelJS()`
function downloadXLSX(jobs) {
    const jsonJobs = jobs.map(job => ({
        'Index': job.jobNumber,
        'Company': job.company,
        'Location': job.location,
        'Title': job.title,
        // 'URL': { t: type, v: display_value, l: link_object }
        'Company Link': {
            t: 's',
            v: job.companySlug,
            l: { Target: job.companyUrl, Tooltip: `${job.companyUrl}` }
        },
        'Job Link': {
            t: 's',
            v: "Open Job Link",
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

    // convert to ExcelJS style `rows`, then:
    //await chrome.storage.local.set({ exportedJobs: rows });
} */

// end IIFE
})();