# HN Later

A **Manifest V3** Chrome extension for `news.ycombinator.com`:

- Save threads to a **Read Later** list
- Track comment reading progress with a **Mark-to-here** marker
- Show **% read** per thread (saved)
- Highlight **new comments** (new arrivals since you last acknowledged them)
- **Continue** (resume where you left off)
- Navigate through **unread comments** with a floating navigator

## Tech stack

- **WXT** (MV3 extension build tooling)
- **React + TailwindCSS + DaisyUI** (popup UI)
- **WebExt Core** (type-safe extension primitives)
  - `@webext-core/storage` (typed `browser.storage.local` access)
  - `@webext-core/messaging` (typed background↔content messaging)
  - `@webext-core/proxy-service` (typed popup→background service calls)

## Setup

### Requirements

- Node.js 20+ (WXT/Vite may warn if you're on an older 20.x patch)

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

- Use **mark-to-here** on any comment to mark everything above it as **read** (and place a **[HERE]** checkpoint chip).
- **mark-to-here** also **dismisses existing "new" comments above that marker** (future new replies will still show as new).
- The toolbar shows your progress as `read/total (%)`.
- Unread comments show a blue gutter bar on the left.
- New comments show a **[NEW]** chip next to the timestamp.

### Resume / new comments

- **Continue**: jumps to your last read marker (or the first comment if you haven't set one).
- A small floating **↑/↓ unread** navigator appears at the bottom-right when there are unread comments, so you can step through them without scrolling back to the top.
  - The navigator shows "Unread X/Y" and optionally "(N new)" if there are new comments.
  - You can click **✓ seen** in the floating navigator to mark all unread comments as seen and clear the "new" badge/highlights.
  - Page refresh/accidental visits do **not** clear "new".
  - Click **seen** on individual new comments to acknowledge them (this also advances your reading marker if needed).

### Popup

Click the extension icon to open the popup:

- Search saved threads
- Open / Continue buttons for quick access
- More menu with Mark as Finished, Archive, Reset, and Remove options

### Backup / Restore

Open the extension **Options** page:

- Right-click the extension icon → **Options**
- Or open `chrome://extensions` → HN Later → **Details** → **Extension options**

From there:

- **Export (Backup)**: downloads a JSON file containing your saved threads + progress
- **Import (Restore)**: load a backup JSON and choose **Merge** (safe) or **Replace all** (overwrites everything)

## Notes / limitations

- Progress tracking is **read-set based**: read/unread is stored as a set of comment IDs, so comment reorders don’t regress progress.
- Data is stored in `browser.storage.local` (with `unlimitedStorage` permission for heavy usage).
- HN comment threads load as a single page; there's no multi-page comment pagination to handle.
- New comments are tracked by comparing comment IDs to a baseline (`maxSeenCommentId`), which is only updated when you explicitly acknowledge comments (via "seen" or "✓ seen"), not on every page visit.