# LinkedIn Jobs Assistant Chrome Extension

A Chrome extension that enhances your LinkedIn job search workflow with three key features: exporting saved jobs to Excel/CSV, intelligently recommending jobs from search results, and highlighting relevant skills in job descriptions.

## Features Overview

### 1. Export Saved Jobs
**Purpose:** Create a comprehensive spreadsheet of all your saved LinkedIn jobs  
**Frequency:** Run occasionally to refresh your saved jobs database

Automatically traverses all pages of your saved jobs and exports them to Excel (with clickable links) or CSV format. This export serves as the foundation for the other features by maintaining a local reference of your saved jobs.

### 2. Recommend Jobs (Primary Feature)
**Purpose:** Streamline job evaluation by showing relevant company context  
**Frequency:** Used continuously during job search sessions

The workhorse of the extension. As you browse LinkedIn job search results (two-panel layout), this feature:
- Opens company job pages for selected positions
- Displays jobs you've already saved from each company
- Highlights relevant skills and keywords in job descriptions
- Filters by your commute preferences (LA area by default)
- Can process multiple jobs in sequence or open all at once

### 3. Job Highlights
**Purpose:** Quick skill/keyword highlighting on any job post  
**Frequency:** As needed for individual job evaluation

A readily-available tool that injects filtered highlights into any LinkedIn job page you're viewing. Provides the same context injection that Recommend Jobs offers, but for single-job manual review.

<img src="https://i.imgur.com/yxre3sh.png" width="640" alt="Screenshot of exported Excel spreadsheet">

<br>

<img src="https://i.imgur.com/h4TUJnY.gif" width="320" alt="Screen capture of Chrome Extension popup">

<!-- TODO: Add screenshots showing Recommend Jobs feature with company context injection -->
<!-- TODO: Add screenshot showing Job Highlights on a job description page -->

## Getting Started

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd linkedin-jobs-assistant
   ```

2. **Load the extension in Chrome**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the extension directory

3. **Pin the extension** (recommended)
   - Click the puzzle piece icon in Chrome toolbar
   - Find "LinkedIn Jobs Assistant"
   - Click the pin icon

### Prerequisites

- Google Chrome or Chromium-based browser
- Active LinkedIn account

## How to Use

### Export Saved Jobs

1. Navigate to `https://www.linkedin.com/my-items/saved-jobs/`
2. Click the extension icon → "Export Saved Jobs"
3. Choose Excel or CSV format (Excel includes clickable hyperlinks)
4. The extension will:
   - Automatically paginate through all saved jobs
   - Extract job details (title, company, location, posting date)
   - Generate a downloadable file
5. Find your file in Downloads: `Saved Jobs YYYY-MM-DD HHmm.xlsx`

**Export includes:**
- Index number
- Company name
- Location
- Job title
- Company jobs page link (clickable in Excel)
- Individual job link (clickable in Excel)
- Days since posted

### Recommend Jobs

1. Navigate to LinkedIn job search results:
   - `https://www.linkedin.com/jobs/search/`
   - `https://www.linkedin.com/jobs/collections/`
   - `https://www.linkedin.com/jobs/search-results/`

2. Click the extension icon → "Recommend Jobs"

3. Configure options:
   - **"All" checkbox**: Opens tabs for all matching jobs in results
   - **"N tabs at a time"**: Limits to N tabs, starting from currently selected job

4. The extension will:
   - Filter jobs by location (remote or LA area)
   - Skip jobs you've already saved
   - Open company job pages in new tabs
   - Inject context showing:
     - The job you clicked from
     - Other jobs you've saved from this company
     - Highlighted keywords from "About the job" section

5. Review company pages with full context without manual cross-referencing

**Location filter (default):**
Los Angeles, West Hollywood, Beverly Hills, Culver City, Santa Monica, Marina del Rey, Inglewood, El Segundo, Universal City, Burbank, Glendale, Montrose, Pasadena, or Remote

### Job Highlights

1. Navigate to any LinkedIn job page:
   - Search results (two-panel layout)
   - Individual job posts (`/jobs/view/`)

2. Click the extension icon → "Job Highlights"

3. The extension injects a highlighted section showing:
   - Jobs you've saved from this company
   - Key skills/keywords from job description

4. Highlights automatically update as you navigate between jobs (for two-panel layouts)

**Highlighted keywords (configurable in utils.js):**
java, php, python, react, ruby, rust, golang, aws, .net, ai, llm, stack, data, remote, years, lead, expert, proficiency, advanced

## Technical Overview

### Architecture Philosophy

This extension demonstrates careful attention to:
- **Error handling**: Fail-fast with informative messages at all boundaries
- **Code organization**: IIFE isolation, shared utilities, separation of UI and business logic
- **Edge case handling**: Multiple LinkedIn page formats, dynamic content, race conditions
- **User experience**: Smooth transitions, loading states, persistent context

### Technology Stack

- **JavaScript ES6+**: async/await, arrow functions, destructuring
- **Chrome Extension API (Manifest V3)**: scripting, tabs, storage, downloads, messaging
- **ExcelJS**: Excel file generation with hyperlinks and formatting
- **DOM APIs**: MutationObserver for dynamic content tracking

### Key Technical Patterns

#### 1. Multi-URL Selector Strategies

LinkedIn presents job content in multiple formats across different URLs. The extension handles this with **selector fallback chains**:

```javascript
const element = (
    // for '/search/', '/collections/'
    document.querySelector('.format-a-selector')
    // for '/search-results/'
    ?? document.querySelector('.format-b-selector')
    // for '/view/'
    ?? document.querySelector('.format-c-selector')
);
```

Each selector is commented with its target page type. Maximum code reuse despite different page structures.

#### 2. MutationObserver for Dynamic Content

LinkedIn's two-panel job search pages (search, collections) update the right panel without full page reloads. The extension uses MutationObserver to detect these updates and re-inject highlights:

```javascript
const observer = new MutationObserver(async () => {
    observer.disconnect();          // prevent infinite loops
    await sleep();                  // debounce rapid updates
    await updateContent();          // re-inject highlights
    observer.observe(target, config); // reconnect
});
```

This pattern provides:
- Automatic updates as user clicks through job cards
- Prevention of "flashing" content via debouncing
- Clean disconnect/reconnect cycle
- Stored reference (`window.__extInjectedObserver`) for cleanup

#### 3. Stable Element Detection

LinkedIn's job panel takes time to fully render. The extension waits for stable content before processing:

```javascript
let prevElement = null;
let stableCount = 0;

while (stableCount < REQUIRED_STABLE_COUNT) {
    const element = document.querySelector(selector);
    if (element === prevElement) {
        stableCount++;
    } else {
        stableCount = 0;
        prevElement = element;
    }
    await waitFrame(); // requestAnimationFrame or setTimeout
}
```

Combines `requestAnimationFrame` (fast checks) with `setTimeout` (debouncing) for reliable detection across network speeds.

#### 4. Cross-Script Communication

The extension coordinates across multiple scripts using structured messaging:

```javascript
// Content script → Popup (via background)
chrome.runtime.sendMessage({
    action: 'open_company_jobs',
    companyUrl: url,
    injectedDivHTML: html
}, (response) => {
    // Detect popup closure via chrome.runtime.lastError
    if (chrome.runtime.lastError) {
        handlePopupClosed();
    }
});

// Popup → New tabs (via tabs.onUpdated)
chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'complete' && pendingTabs.has(tabId)) {
        const { injectedDivHTML } = pendingTabs.get(tabId);
        chrome.tabs.sendMessage(tabId, { action: 'insert_div', divHTML: injectedDivHTML });
        pendingTabs.delete(tabId);
    }
});
```

**Division of labor:**
- **popup.js**: UI state, user preferences, message routing
- **Content scripts**: DOM interaction, data extraction
- **background.js**: Minimal (service worker requirements)
- **chrome.storage.local**: Shared state across features

#### 5. Storage as Cross-Feature Foundation

Exported jobs are stored and referenced by other features:

```javascript
// Store after export
await chrome.storage.local.set({ 
    exportedJobsInfo: { jobsCount, lastUpdated },
    exportedJobs: rows  // [jobNumber, company, location, title]
});

// Reference in Recommend Jobs
const { exportedJobs } = await chrome.storage.local.get('exportedJobs');
const savedFromCompany = exportedJobs.filter(job => job[1] === company);
// Display in injected context
```

This eliminates manual cross-referencing and enables the "show saved jobs from this company" feature.

### File Structure

```
linkedin-jobs-assistant/
├── manifest.json                    # Extension config, permissions
├── scripts/
│   ├── background.js               # Service worker (minimal)
│   ├── utils.js                    # Shared config, debug, messaging
│   ├── exportToCSV.js              # Export feature logic
│   ├── recommendJobs.js            # Recommend feature logic
│   ├── jobHighlights.js            # Highlights feature logic
│   └── companyJobsContent.js       # Content script for new tabs
├── popup/
│   ├── popup.html                  # Extension popup UI
│   ├── popup.css                   # Popup styling
│   └── popup.js                    # Popup interaction handling
├── vendor/
│   └── exceljs.min.js              # Excel generation library
├── icons/                          # Extension icons (16, 32, 48, 128)
├── images/                         # UI assets (spinner, close button)
└── README.md
```

### Configuration

All tunable parameters are centralized in `scripts/utils.js`:

```javascript
const CONFIG = {
    DEBUG: true,                     // Enable console logging
    OPEN_TAB_CHILL_MS: 800,          // Delay between tab creation
    PAGE_CHANGE_WAIT_MS: 150,        // Pagination polling interval
    PAGE_LOAD_TIMEOUT_MS: 3000,      // Max wait for page load
    MAX_PAGES: 50,                   // Safety limit for export
    RENDER_SETTLE_COUNT: 2,          // Stable element detection threshold
    DEBOUNCE_COUNT: 15,              // RAF iterations before setTimeout
    DEBOUNCE_MS: 150,                // Debounce delay
    HIGHLIGHT_SKILLS: [...]          // Keywords to highlight
};
```

### Design Decisions

**Why ExcelJS over SheetJS?**  
ExcelJS provides better control over cell formatting, hyperlink styling, and table creation. The original SheetJS implementation is preserved (commented) for reference.

**Why MutationObserver instead of polling?**  
LinkedIn's two-panel search pages update the right panel without full reloads. MutationObserver reacts to actual DOM changes rather than polling, and the "serendipitous" difference in how `/search/` vs `/search-results/` renders content made this approach both possible and elegant.

**Why IIFE wrapping?**  
Content scripts run in isolated worlds but still share the global object. IIFE prevents namespace pollution and conflicts with LinkedIn's JavaScript.

**Why store exported jobs?**  
The core value proposition is reducing manual cross-referencing. Storing exports enables the "show saved jobs from this company" feature that makes job evaluation significantly faster.

## Development Guidelines

This codebase follows strict coding standards documented in [`.windsurfrules`](.windsurfrules). Key principles:

- **Fail-fast error handling**: Errors propagate with context, never silently handled
- **Configuration over hardcoding**: All magic numbers in CONFIG object
- **Descriptive naming**: `jobTitleLink` over `link`, `isStarted` over `started`
- **Minimal nesting**: Guard clauses and early returns
- **Comments for "why"**: Selector targets, design decisions, not obvious code

## Privacy & Security

- **No data collection**: All processing is local to your browser
- **No external requests**: Extension only interacts with LinkedIn pages
- **No credentials stored**: Uses your existing LinkedIn session
- **Open source**: All code is visible and auditable
- **Minimal permissions**: Only requests necessary Chrome APIs

## Future Enhancements

- [ ] Configurable location filters (beyond LA area)
- [ ] Customizable keyword highlighting via UI

## Contributing

When contributing, please:
1. Read [`.windsurfrules`](.windsurfrules) for coding standards
2. Test across all LinkedIn page types (search, collections, view, search-results)
3. Update documentation for new features or changed behavior

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer**: This extension is not affiliated with, endorsed by, or connected to LinkedIn Corporation. Use at your own risk and in accordance with LinkedIn's Terms of Service.