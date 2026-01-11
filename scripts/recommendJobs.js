(async () => {
// IIFE scoped namespace:

const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

const higlightSkills = [
    "java", "php", "python", "react", "ruby", "rust", "golang",
    "aws", "kafka", "\\.net", "ai", "llm",
    "year", "lead", "full", "stack", "remotea"
];
const commuteCities = [
    "Los Angeles", "West Hollywood", "Beverly Hills", "Culver City",
    "Santa Monica", "Marina del Rey", "Inglewood", "El Segundo",
    "Universal City", "Burbank", "Glendale", "Montrose", "Pasadena"
];

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

function sendOpenCompanyJobsToPopup(companyUrl, injectedDivHTML, cbPopupOpen) {
    chrome.runtime.sendMessage({
        action: 'open_company_jobs', companyUrl, injectedDivHTML
    }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
            debug(`\`sendOpenCompanyJobsToPopup()\` Popup is closed: ${lastError.message}`);
            cbPopupOpen(false);
            return;
        }
        cbPopupOpen(true);
    });
};

async function mainRecommend() {
    const topDivs = document.querySelectorAll(
        'div[data-view-name="job-search-job-card"] [role="button"] > div > div'
    );

    let isPopupClosed = false;
    const results = [];
    for (const [index, topDiv] of Array.from(topDivs).entries()) {
        const paragraphs = Array.from(topDiv.querySelectorAll('p'))
            .map(p => {
                const span = p.querySelector(':scope > span[aria-hidden="true"]')
                //const span = p.querySelector(':scope > span:not([aria-hidden])') // (Verified job)
                return span
                    ? span.childNodes[0].textContent.trim()
                    : p.textContent.trim();
            });

        debug(`Extracting job card #${index + 1}:`);
        const jobCard = extractJobCard(paragraphs);
        results.push(jobCard);
        debug(jobCard);

        if (jobCard.status === "Saved") {
            debug(`Job card #${index + 1}: "Saved", skipping...`);
            continue;
        }
        const location = jobCard.location;
        if (!location.includes("(Remote)")) {
            const isMatch = commuteCities.some(city => location.includes(city));
            if (!isMatch) {
                debug(`'${location}' not '(Remote)' or adjacent to LA, skipping...`);
                continue;
            }
        }

        topDiv.dispatchEvent(
            new PointerEvent('click', { bubbles: true })
        );
        debug("Job card click dispatched");

        // "About the job" span from job panel
        const currSpan = await spanFromStableJobPanel()
            .catch((err) => {
                sendStatusToPopup(err.message, 'error');
                throw err;
            });
        const aboutTheJobText = currSpan.innerText.trim();

        // company URL from job panel
        const companyUrl = document
            .querySelector('[data-testid="lazy-column"] a[href*="linkedin.com/company/"]')
            .href.replace(/\/[\w-]+\/?$/, '/jobs/');

        // "About the job" higlights:
        const keywordRegex = new RegExp(`\\b(${higlightSkills.join('|')})`, 'gi');

        const textHighlights = aboutTheJobText
            .split(/\n|\.\s+/)
            .filter(sentence => {
                keywordRegex.lastIndex = 0; // reset regex for 'g' flag
                return keywordRegex.test(sentence);
            })
            .map(s => {
                const highlighted = s.trim().replace(keywordRegex, '<span class="ext-highlight">$1</span>');
                return `• ${highlighted}`;
            })
            .join("\n<br>\n");

        let injectedDivHTML =
            `<style>
.ext-highlight { font-weight: 700; text-decoration: underline; color: #fff; }
.ext-injected { margin: 0 24px 24px 24px; padding: 12px 24px 22px 24px;
  border: 2px solid #AA6C39; border-radius: 12px; }
</style>
<div class="artdeco-entity-lockup--size-5 ext-injected">
    <span class="artdeco-entity-lockup__caption"><em>Opened from</em></span>
    <span class="artdeco-entity-lockup__title"><strong>${jobCard.jobTitle}</strong></span>
    <br>
    <span class="artdeco-entity-lockup__subtitle">${jobCard.location}</span>`;

        const { exportedJobs } = await chrome.storage.local.get('exportedJobs');
        const savedJobsFromCompanyText = exportedJobs
            .filter(job => job[1] === jobCard.company)
            .map(job => `• ${job[3]} (${job[2]})`) // title, location
            .join("\n<br>\n");
        if (savedJobsFromCompanyText) {
            injectedDivHTML += `
    <hr style="margin: 10px 0 4px 0">
    <span class="artdeco-entity-lockup__title" style="font-size: 1.14em">
        Saved Jobs from '${jobCard.company}'
        <br>
    </span>
    <span class="artdeco-entity-lockup__caption">
    ${savedJobsFromCompanyText}
    </span>`;
        }

        injectedDivHTML += `
    <hr style="margin: 10px 0 4px 0">
    <span class="artdeco-entity-lockup__title" style="font-size: 1.14em">
        About the job<span style="font-weight: 360"><em>&nbsp;highlights</em></span>
        <br>
    </span>
    <span class="artdeco-entity-lockup__caption">
    ${textHighlights}
    </span>
</div>
`;

        sendOpenCompanyJobsToPopup(companyUrl, injectedDivHTML, isPopupOpen => {
            if (!isPopupOpen) isPopupClosed = true;
        });
        if (isPopupClosed) break;
    }

    return results;
}

async function spanFromStableJobPanel({
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