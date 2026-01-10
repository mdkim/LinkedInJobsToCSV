(async () => {
// IIFE scoped namespace:

const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

// Main
const start = Date.now();
await main()
    .then(() => {
        debug(`\`recommendJobs.js\` execution time: ${Date.now() - start}ms`);
    })
    .catch((err) => {
        sendStatusToPopup(err.message, 'error');
        throw err;
    });

async function main() {
    const result = await mainRecommend()
        .catch((err) => {
            sendStatusToPopup(err.message, 'error');
            throw err;
        });
    if (!result) {
        sendStatusToPopup("No jobs found", 'warning', 'recommend_done');
        return;
    }

    sendStatusToPopup(`Done. Exported ${result.length} jobs`, '', 'recommend_done');
}

function sendOpenCompanyJobsToPopup(companyUrl, injectedDivHTML) {
    chrome.runtime.sendMessage({
        action: 'open_company_jobs',
        companyUrl,
        injectedDivHTML
    }, () => {
        const lastError = chrome.runtime.lastError;
        if (!lastError) return;
        // popup is closed
        debug(`\`sendOpenCompanyJobsToPopup()\` error: ${lastError.message}`, 'warning');
    });
};

async function mainRecommend() {
    const topDivs = document.querySelectorAll(
        'div[data-view-name="job-search-job-card"] [role="button"] > div > div'
    );

    const results = [];
    for (const [index, topDiv] of Array.from(topDivs).entries()) {
        const paragraphs = Array.from(topDiv.querySelectorAll('p'))
            .map(p => p.textContent.trim());

        debug(`Extracting job card #${index + 1}:`);
        const result = extractJobCard(paragraphs);
        debug(result);

        topDiv.dispatchEvent(
            new PointerEvent('click', { bubbles: true })
        );
        debug("Job card click dispatched");

        const currSpan = await waitForStableSpan()
            .catch((err) => {
                sendStatusToPopup(err.message, 'error');
                throw err;
            });
        const text = currSpan.textContent.trim();

        // TODO: construct injectedDivHTML
        const tempText = `${text.slice(0, 100)} ...\n... ${text.slice(-100)}`
        const href = document
            .querySelector('[data-testid="lazy-column"] a[href*="linkedin.com/company/"]')
            .href;
        const companyUrl = href.replace(/\/[\w-]+\/?$/, '/jobs/');
        debug(`Pushing text: ${tempText}`);
        results.push(result);
        const injectedDivHTML = `<div>${tempText}<br>${JSON.stringify(result)}</div>`;
        sendOpenCompanyJobsToPopup(companyUrl, injectedDivHTML);

        // TODO: `break` on closed popup instead of index > 5
        if (index > 5) {
            break;
        }
    }

    return results;
}

async function waitForStableSpan({
    renderSettleCount = CONFIG.RENDER_SETTLE_COUNT,
    debounceCount = CONFIG.DEBOUNCE_COUNT,
    debounceMs = CONFIG.DEBOUNCE_MS
} = {}) {
    let prevSpan = null;
    let renderIndex = 0;
    let debounceIndex = 0;

    while (true) {
        debug("Looping in `waitForStableSpan()`");
        const span = document.querySelector(
            'span[data-testid="expandable-text-box"]'
        );

        if (span && span === prevSpan) {
            if (renderIndex++ >= renderSettleCount) {
                ////////////
                return span;
                ////////////
            }
        } else {
            renderIndex = 0;
            prevSpan = span;
        }

        if (debounceIndex++ < debounceCount) {
            await new Promise(r => requestAnimationFrame(r));
        } else {
            await new Promise(r => setTimeout(r, debounceMs))
        }
    }
}

function extractJobCard(paragraphs) {
    const result = {
        jobTitle: paragraphs[0],
        company: paragraphs[1],
        location: paragraphs[2],
        status: null,
        companyAlumni: null,
        schoolAlumni: null
    };

    for (const text of paragraphs.slice(3)) {
        if (text === "Viewed" || text === "Saved") {
            result.status = text;
        } else if (text.includes('alumni work')) {
            if (text.includes('company alumni')) {
                result.companyAlumni = text;
            } else if (text.includes('school alumni')) {
                result.schoolAlumni = text;
            }
        }
    }
    return result;
}

// end IIFE
})();