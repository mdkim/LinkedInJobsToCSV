(async () => {
// IIFE scoped namespace:

const { CONFIG, debug, sendStatusToPopup } = window.__LJ2CSV_UTILS__;

// Main
const start = Date.now();
await main()
    .then(() => {
        debug(`\`jobHighlights.js\` execution time: ${Date.now() - start}ms`);
    })
    .catch((err) => {
        sendStatusToPopup(err.message, 'error');
        throw err;
    });

async function main() {
    if (window.__extInjectedObserverConnected && document.getElementById('ext-injected')) {
        debug("MutationObserver already connected, skipping mainHighlights()...")
        sendStatusToPopup(`Highlights already enabled`, '', 'highlights_done');
        return;
    }

    const result = await mainHighlights()
        .catch((err) => {
            sendStatusToPopup(err.message, 'error');
            throw err;
        });
    if (!result) {
        debug("Wrong `document`, skipping frame...", '', 'highlights_done');
        return;
    }

    sendStatusToPopup(`Done, highlights shown`, '', 'highlights_done');
}

async function mainHighlights() {
    // "About the job" span from job panel or standalone job post page
    const aboutTheTextEl = (
        // for '/search/' ✅, '/view' ✅
        document.querySelector('#job-details .mt4 p[dir]')
        // for '/search-results/' ✅
        ?? document.querySelector('span[data-testid="expandable-text-box"]')
    );
    if (!aboutTheTextEl) return false; // wrong `document`

    const aboutTheJobText = aboutTheTextEl.innerText.trim();

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

    const company = (
        // for '/search/' ✅ (must run before '/search-results/' selector),
        // for '/view' ✅
        document.querySelector('.job-details-jobs-unified-top-card__company-name')
        // for '/search-results/' ✅
        ?? document.querySelector('[aria-label^="Company"]')
    ).textContent.trim();

    const { exportedJobs } = await chrome.storage.local.get('exportedJobs');
    const savedJobsFromCompanyText = exportedJobs
        .filter(job => job[1] === company)
        .map(job => `• ${job[3]}, <em>(${job[2]})</em>`) // title, location
        .join("\n<br>\n");

    let injectedDivHTML = `<div id="ext-injected">
    ${getInjectedDivStyle()}`;

    if (savedJobsFromCompanyText) {

        injectedDivHTML += `
    <span class="ext-font-title">
        Saved Jobs&nbsp;<em class="ext-font-caption">from</em>&nbsp;${company}
        <br>
    </span>
    <span class="ext-font-caption">
    ${savedJobsFromCompanyText}
    </span>
    <hr class="ext-hr">`;

    }

    injectedDivHTML += `
    <span class="ext-font-title">
        About the job&nbsp;<em class="ext-font-caption">highlights</em>
        <br>
    </span>
    <span class="ext-font-caption">
    ${textHighlights}
    </span>
</div>
`;

    document.getElementById('ext-injected')?.remove();
    (
        // for '/search/' ✅ (grandparent of '/view/' selector)
        document.querySelector('.job-details-jobs-unified-top-card__container--two-pane')
        // for '/view/' ✅
        ?? document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')
        // for '/search-results/' ✅
        ?? document.querySelector('[aria-label^="Company"]').closest('[data-display-contents="true"]').parentElement
    )
        .parentElement
        .insertAdjacentHTML('afterend', injectedDivHTML);

    // transition effect
    const elem = document.getElementById('ext-injected');
    const finalHeight = elem.offsetHeight;
    elem.style.height = '0';
    elem.style.visibility = 'visible';
    requestAnimationFrame(() => {
        elem.style.height = `${finalHeight}px`;
    });

    return true;
}

function getInjectedDivStyle() {
    let styleMarginAndFontSize;
    if (document.querySelector('.job-details-jobs-unified-top-card__container--two-pane')) {
        sendStatusToPopup('Setting style for /search/'); // (grandparent of '/view/' selector)
        styleMarginAndFontSize = "margin: 24px 0 0 0; font-size: 1.4rem;"; // ✅
        // no injected div reset
    } else if (document.querySelector('.job-details-jobs-unified-top-card__primary-description-container')) {
        sendStatusToPopup('Setting style for /view/');
        styleMarginAndFontSize = "margin: 0; font-size: 1.4rem;"; // ✅
    } else if (document.querySelector('[aria-label^="Company"]').closest('[data-display-contents="true"]').parentElement) {
        sendStatusToPopup('Setting style for /search-results/');
        styleMarginAndFontSize = "margin: 0 24px 0 24px; font-size: 1.4rem;"; // ✅
        // injected div resets
    }

    const injectedDivStyle = `<style>
    #ext-injected {
        /* transition effect */
        height: auto;
        transition: height 0.7s ease-out;
        visibility: hidden;

        border: 2px solid #AA6C39;
        border-radius: 12px;
        padding: 12px 24px 22px 24px;

        /* for 'jobHighlights.js' only: */
        ${styleMarginAndFontSize}
        line-height: 1.6;
        background-color: #fff;
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
    .ext-font-title {
        font-size: 1.4em;
        font-weight: 600;
    }
    .ext-font-caption {
        font-weight: 360;
    }
    </style>`;
    return injectedDivStyle;
}

(() => {
    if (window.location.pathname.includes('/view/')) {
        debug("'/view/' page, skipping MutationObserver...")
        return;
    }
    if (!document.getElementById('ext-injected')) {
        debug("mainHighlights() encountered wrong `document`, skipping MutationObserver...")
        return;
    }
    if (window.__extInjectedObserverConnected) {
        debug("MutationObserver already connected, skipping connectObserver()...")
        return;
    }
    window.__extInjectedObserverConnected = true;

    const sleep = () => new Promise(r => setTimeout(r, CONFIG.DEBOUNCE_MS * (CONFIG.DEBOUNCE_COUNT/2)));
    const connectObserver = () => {
        const injectedDiv = document.getElementById('ext-injected');
        observer.observe(injectedDiv.parentElement, { childList: true, subtree: true });
    }
    const observer = new MutationObserver(async () => {
        observer.disconnect();
        await sleep(); // prevent "flashing" injected div
        await mainHighlights();

        debug("connectObserver() [1]");
        connectObserver();
    });
    window.__extInjectedObserver = observer; // reference for disconnect

    debug("connectObserver() [2]");
    connectObserver();
})();

// end IIFE
})();
