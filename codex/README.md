# HN Later

Chrome extension to save Hacker News stories to read later, like a todo list.
Track reading progress (%) per item and quickly continue where you left off, including unfinished or new comments.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/` folder in this repo

## Usage

- On `news.ycombinator.com/item?id=...` pages:
  - A small **HN Later** overlay appears (bottom-right)
  - **Save** adds/removes the thread from your read-later list
  - Progress updates automatically as you scroll through comments
  - **Resume** scrolls to the next unread comment
  - **Mark all read** / **Reset** updates progress
- On HN listing pages (front page, newest, etc.):
  - A `later` / `saved` link appears in each item’s subtext row
- Click the extension icon to open the popup:
  - See saved threads with % progress
  - Use **Resume** to open a thread and auto-scroll to next unread

## Storage

All data is stored locally (no login) using `chrome.storage.local`.


TODO:

- See new comments since last visit (what should UI be)
- Side scrollbar
