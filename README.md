# LinkedIn Saved Jobs Exporter Chrome Extension

A lightweight Chrome extension that exports your LinkedIn Saved Jobs to CSV format. Navigate through all pages of saved jobs automatically and download a comprehensive spreadsheet with job titles, companies, locations, and URLs.

## Key Features

- **Automatic Pagination**: Traverses all pages of saved jobs without manual clicking
- **CSV Export**: Downloads a clean spreadsheet with job details

<img src="https://i.imgur.com/pLOYiH9.jpeg" width="340" alt="Screenshot of Chrome extension">

## Getting Started

### Installation

1. **Clone the repository to your local machine**

2. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the extension directory

3. **Pin the extension** (optional but recommended)
   - Click the puzzle piece icon in Chrome toolbar
   - Find "LinkedIn Saved Jobs Exporter"
   - Click the pin icon to keep it visible

### Prerequisites

- Google Chrome (or Chromium-based browser)
- Active LinkedIn account with saved jobs

## How to Use

1. **Navigate to your LinkedIn Saved Jobs**
   - Go to: `https://www.linkedin.com/my-items/saved-jobs/`
   - Make sure you're logged in and on the "Saved" tab

2. **Open the extension**
   - Click the extension icon in your Chrome toolbar
   - The popup will appear

3. **Export your jobs**
   - Click the "Export to CSV" button
   - The extension will automatically:
     - Navigate through all pages
     - Extract job information
     - Download a CSV file

4. **Find your CSV**
   - Check your Downloads folder
   - File will be named: `linkedin_saved_jobs_[timestamp].csv`

5. **Open in your preferred spreadsheet application**
   - Excel, Google Sheets, Numbers, etc.

## CSV Output Format

The exported CSV contains the following columns:

| Column   | Description                          |
|----------|--------------------------------------|
| Index    | Sequential job number (1, 2, 3...)  |
| Title    | Job title                            |
| Company  | Company name                         |
| Location | Job location (City, State/Country)  |
| URL      | Direct link to job posting          |

## Technical Overview

### Technologies Used
- JavaScript (ES6+)
- Chrome Extension API (Manifest V3)
- DOM manipulation and content script injection

### Architecture
- **popup.js**: UI logic and user interaction handling
- **exportToCSV.js**: Business logic for job extraction and pagination
- **popup.html**: Extension popup interface
- **manifest.json**: Extension configuration and permissions

### How It Works

1. **Content Script Injection**: The extension injects `exportToCSV.js` into the LinkedIn page
2. **DOM Parsing**: Extracts job information from LinkedIn's rendered HTML
3. **Pagination**: Automatically clicks "Next" button and waits for new content
4. **CSV Generation**: Converts extracted data to CSV format
5. **Download**: Triggers browser download with generated CSV file

### Key Design Principles

- **Fail-fast error handling**: Stops immediately on unexpected page structure
- **IIFE namespace isolation**: Prevents conflicts with LinkedIn's JavaScript
- **Separation of concerns**: UI and business logic in separate files
- **Configurable parameters**: Easy adjustments without code changes

See [.windsurfrules](.windsurfrules) for detailed coding standards.

## Future Enhancements

- [ ] Excel (XLSX) export option
- [ ] Minor UI enhancements
- [ ] Company details analysis (Home connections, People locations, Jobs recommended)

## Privacy & Security

- **No data collection**: All processing happens locally in your browser
- **No external requests**: Extension only interacts with LinkedIn's page
- **No credentials stored**: Uses your existing LinkedIn session
- **Open source**: All code is visible and auditable

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer**: This extension is not affiliated with, endorsed by, or connected to LinkedIn Corporation. Use at your own risk and in accordance with LinkedIn's Terms of Service.