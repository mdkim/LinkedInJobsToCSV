(async () => {
// IIFE scoped namespace:

const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

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

    sendStatusToPopup(`Done. Opened ${result.length} jobs tabs`, '', 'recommend_done');
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

    const companiesDone = new Set();
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

        const jobCardPre = `Job card #${index + 1}:`;
        debug(`Extracting, ${jobCardPre}`);
        const jobCard = extractJobCard(paragraphs);
        debug(jobCard);

        if (jobCard.status === "Saved") {
            debug(`${jobCardPre} "Saved", skipping...`);
            continue;
        }
        const location = jobCard.location;
        if (!location.includes("(Remote)")) {
            const isMatch = commuteCities.some(city => location.includes(city));
            if (!isMatch) {
                debug(`${jobCardPre} '${location}' not '(Remote)' or adjacent to LA, skipping...`);
                continue;
            }
        }
        if (companiesDone.has(jobCard.company)) {
            debug(`${jobCardPre} '${jobCard.company}' already done, skipping...`);
            continue;
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

        results.push(jobCard);
        companiesDone.add(jobCard.company);

        // company URL from job panel
        const companyUrl = document
            .querySelector('[data-testid="lazy-column"] a[href*="linkedin.com/company/"]')
            .href.replace(/\/[\w-]+\/?$/, '/jobs/');

        // "About the job" higlights:
        const keywordRegex = new RegExp(`\\b(${CONFIG.HIGHLIGHT_SKILLS.join('|')})`, 'gi');

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
            `<div id="ext-injected" class="artdeco-entity-lockup--size-5">
    <style>
    #ext-injected {
        border: 2px solid #AA6C39;
        border-radius: 12px;
        padding: 12px 24px 22px 24px;
        margin: 0 24px 24px 24px;
    }
    .ext-highlight {
        font-weight: 700;
        text-decoration: underline;
        color: #000;
    }
    hr.ext-hr {
        margin: 14px 0px 10px 0px;
        border-top: 2px solid;
        border-color: #777;
    }
    .ext-font-caption {
        font-weight: 360;
    }
    </style>
    <span class="artdeco-entity-lockup__caption"><em>Opened from</em></span>
    <span class="artdeco-entity-lockup__title"><strong>${jobCard.jobTitle}</strong></span>
    <br>
    <span class="artdeco-entity-lockup__subtitle">${jobCard.location}</span>`;

        const { exportedJobs } = await chrome.storage.local.get('exportedJobs');
        const savedJobsFromCompanyText = exportedJobs
            .filter(job => job[1] === jobCard.company)
            .map(job => `• ${job[3]}, <em>(${job[2]})</em>`) // title, location
            .join("\n<br>\n");
        if (savedJobsFromCompanyText) {
            injectedDivHTML += `
    <hr class="ext-hr">
    <span class="artdeco-entity-lockup__title" style="font-size: 1.14em">
        Saved Jobs&nbsp;<em class="ext-font-caption">from</em>&nbsp;${jobCard.company}
        <br>
    </span>
    <span class="artdeco-entity-lockup__caption">
    ${savedJobsFromCompanyText}
    </span>`;
        }

        injectedDivHTML += `
    <hr class="ext-hr">
    <span class="artdeco-entity-lockup__title" style="font-size: 1.14em">
        About the job&nbsp;<em class="ext-font-caption"></em>
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
        const span = (
            // selector for /search-results/, or for /search/
            document.querySelector('span[data-testid="expandable-text-box"]')
            ?? document.querySelector('#job-details .mt4 p[dir] span')
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