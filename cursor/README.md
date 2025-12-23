# HN Later

A **Manifest V3** Chrome extension for `news.ycombinator.com`:

- Save threads to a **Read Later** list
- Track comment reading progress with a **Mark-to-here** marker
- Show **% read** per thread (saved)
- Highlight **new comments** (new arrivals since you last acknowledged them)
- **Continue** (resume where you left off) and **Jump to new**

## Tech stack

- **WXT** (MV3 extension build tooling)
- **React + TailwindCSS + DaisyUI** (popup UI)
- **browser.storage.local** (local-only persistence)

## Setup

### Requirements

- Node.js 20+ (WXT/Vite may warn if you’re on an older 20.x patch)

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

The unpacked extension will be output to:

- `.output/chrome-mv3/`

### Dev (auto-reloads)

```bash
npm run dev
```

WXT will run the extension in a dev browser profile with hot reload.

### Load unpacked in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `.output/chrome-mv3/`

## Usage

### Save to Read Later

- On HN listing pages (`/news`, `/newest`, `/show`, `/ask`, etc): click **later** on a story row (it becomes **saved**).
- On an item page (`/item?id=...`): click **Save** in the injected toolbar.

### Track progress on an item page

- Use **mark-to-here** on any comment to set your “last read” marker.
- The toolbar shows your progress as `read/total (%)`.

### Resume / new comments

- **Continue**: jumps to the next unread comment after your marker.
- **Jump to new**: jumps to the first comment that’s new since your last time clicking **Mark new as seen** (based on HN comment ids).
  - Page refresh/accidental visits do **not** clear “new”.
  - Click **Mark new as seen** in the toolbar to acknowledge the current thread state and clear the “new” badge/highlights.

### Popup

Click the extension icon to open the popup:

- Search saved threads
- Open / Continue / Jump to new
- Reset progress
- Remove thread from Read Later

## Notes / limitations

- Progress tracking is **marker-based** (not per-comment toggles).
- HN comment threads load as a single page; there’s no multi-page comment pagination to handle.
