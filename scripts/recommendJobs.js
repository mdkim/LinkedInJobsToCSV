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
    if (['https://www.linkedin.com/preload/', 'about:blank'].includes(
        document.location.href,
    )) {
        debug(`wrong \`document\` frame '${document.location.href}', skipping...`);
        return; // silently ignore wrong `document` frames
    }

    const result = await mainRecommend()
        .catch((err) => {
            sendStatusToPopup(err.message, 'error');
            throw err;
        });
    if (!result.length) {
        sendStatusToPopup("No jobs found", '', 'recommend_done');
        return;
    }

    sendStatusToPopup(`Done. Opened ${result.length} jobs tabs`, '', 'recommend_done');
}

function sendOpenCompanyJobsToPopup(companyUrl, injectedDivHTML, callbackDoOpen) {
    chrome.runtime.sendMessage({
        action: 'open_company_jobs', companyUrl, injectedDivHTML
    }, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
            debug(`\`sendOpenCompanyJobsToPopup()\` Popup is closed: ${lastError.message}`);
            callbackDoOpen(false);
            return;
        }
        callbackDoOpen(true);
    });
};

async function mainRecommend() {
    // remove MutationObserver on 'ext-injected'
    window.__extInjectedObserver?.disconnect();
    window.__extInjectedObserverConnected = false;
    document.getElementById('ext-injected')?.remove();

    let { topDivs, paragraphsType } = getTopDivs();
    if (topDivs.length === 0) {
        return [];
    }

    let { isStartAtSelectedJob, maxTabsToOpen } = await chrome.storage.local.get(
        ['isStartAtSelectedJob', 'maxTabsToOpen']
    );

    let indexStart = getIndexStart(isStartAtSelectedJob, topDivs);

    let isPopupClosed = false;
    const companiesDone = new Set();
    const results = [];
    const topDivsSliced = [...topDivs].slice(indexStart);
    for (const [i, topDiv] of topDivsSliced.entries()) {
        // 'Recommend Jobs' > 'All' is unchecked
        if (isStartAtSelectedJob && results.length >= maxTabsToOpen) {
            break;
        }

        const { jobCard, jobCardPre } = getJobCard(indexStart + i, topDiv, paragraphsType);

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
        const { companyUrl, textHighlights } = await getJobInfo(jobCard, companiesDone, results);

        let injectedDivHTML = await getInjectedDivHTML(jobCard, textHighlights);

        sendOpenCompanyJobsToPopup(companyUrl, injectedDivHTML, isPopupOpen => {
            if (!isPopupOpen) isPopupClosed = true;
        });
        if (isPopupClosed) {
            break;
        }
    }

    return results;
}

function getIndexStart(isStartAtSelectedJob, topDivs) {
    if (!isStartAtSelectedJob) return 0;

    for (const [index, topDiv] of [...topDivs].entries()) {
        if (
            // for '/search/', '/collections/'
            topDiv.classList.contains('jobs-search-results-list__list-item--active')
            // for '/search-results/'
            || isSelectedDiv(topDiv.parentElement.parentElement)
        ) {
            return index;
        }
    }
    // no job card selected -> fall back to processing from the start
    return 0;
}

function isSelectedDiv(jobCardDiv) {
    /*
     * `getComputedStyle()` of pre-DarkReader background color
     */
    const cssVar = jobCardDiv.style.backgroundColor.match(/--[^)]+/)[0];
    if (!cssVar) throw new Error("`cssVar` not found in job card div");
    const elem = document.createElement('i');
    elem.style.cssText = `position: absolute; visibility: hidden;
pointer-events: none; color: var(${cssVar});`;
    jobCardDiv.appendChild(elem);
    const computedStyleColor = getComputedStyle(elem).color;
    elem.remove();

    // selected bg-color is rgb(...140, 0.1), not rgb(...255)
    return computedStyleColor.endsWith(", 0.1)");
}

function getTopDivs() {
    let topDivs, paragraphsType;
    {
        // for '/search/', '/collections/'
        topDivs = document.querySelectorAll(
            'li.scaffold-layout__list-item .job-card-container--clickable'
        );
        paragraphsType = 'span';
    }
    if (topDivs.length === 0) {
        // for '/search-results/'
        topDivs = document.querySelectorAll(
            '[data-view-name="job-search-job-card"] [role="button"]'
        );
        paragraphsType = 'p';
    }
    return { topDivs, paragraphsType };
}

function getJobCard(index, topDiv, paragraphsType) {
    const paragraphs = [...topDiv.querySelectorAll(paragraphsType)]
        .filter(p => !p.classList.contains('visually-hidden')) // for '/search/', '/collections/' only
        .map(p => {
            const span = p.querySelector(':scope > span[aria-hidden="true"]');
            // p.querySelector(':scope > span:not([aria-hidden])') // (Verified job)
            return span
                ? span.childNodes[0].textContent.trim() // jobTitle
                : p.textContent.trim();
        })
        .filter(p => p !== '');

    const jobCardPre = `Job card #${index + 1}:`;
    debug(`Extracting, ${jobCardPre}`);
    const jobCard = extractJobCard(paragraphs);
    debug(jobCard);
    return { jobCard, jobCardPre };
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

async function getJobInfo(jobCard, companiesDone, results) {
    const currSpan = await spanFromStableJobPanel()
        .catch((err) => {
            sendStatusToPopup(err.message, 'error');
            throw err;
        });
    const aboutTheJobText = currSpan.innerText.trim();

    results.push(jobCard);
    companiesDone.add(jobCard.company);

    // company URL from job panel
    const companyUrl = (
        // for '/search/', '/collections/'
        document.querySelector('.job-details-jobs-unified-top-card__company-name a[href]')
        // for '/search-results/'
        ?? document.querySelector('[data-testid="lazy-column"] a[href*="linkedin.com/company/"]')
    )
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
    return { companyUrl, textHighlights };
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
            // for '/search/', '/collections/'
            document.querySelector('#job-details .mt4 p[dir]') // ✅
            // for '/search-results/'
            ?? document.querySelector('span[data-testid="expandable-text-box"]') // ✅
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

async function getInjectedDivHTML(jobCard, textHighlights) {
    let injectedDivHTML = `<div id="ext-injected" class="artdeco-entity-lockup--size-5">
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
    return injectedDivHTML;
}

// end IIFE
})();