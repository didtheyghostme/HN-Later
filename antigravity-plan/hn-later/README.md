# HN Later

A Chrome extension to save Hacker News stories for later, with checkpoint-based comment tracking and a visual reading minimap.

## Screenshots

<img width="1200" alt="Comment page with visual minimap and checkpoint tracking" src="https://github.com/user-attachments/assets/1a4ae906-cf3a-47e2-8516-de63d092109f" />

<img width="600" alt="Extension popup showing saved stories" src="https://github.com/user-attachments/assets/78c2c9a9-4b7c-4f50-af06-0576ea76d7c9" />

## Features

- 🔖 **Save for Later** - Native "save" link on any HN story (listing and item pages)
- 📍 **Checkpoint Tracking** - Manually save your reading position to pick up exactly where you left off
- 🔵 **[NEW] Labels** - Persistent badges for comments posted after your last visit
- 🟠 **Visual Minimap** - Discourse-style scrollbar with clickable color-coded markers (Read/Unread/New)
- ⏭️ **Smart Navigation** - Jump between top-level topics or collapse entire threads with one click
- ⌨️ **Keyboard Shortcuts** - `Cmd+Shift+S` to quickly toggle save status
- 💾 **Export/Import** - Backup your saved stories and reading progress as JSON

## Installation

### Quick Install (No Build Required)

1. Download or clone this repo.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top right toggle).
4. Click **Load unpacked**.
5. Select the `.output/chrome-mv3` folder.

> [!NOTE]
> The `.output/chrome-mv3` folder is the production build. You may also see a `chrome-mv3-dev` folder if you have run the development server; that is for testing and includes hot-reload tools.

### For Developers

If you want to modify the source code:

```bash
npm install
npm run dev    # Opens a browser with hot-reload for testing
npm run build  # Generates the production build in .output/chrome-mv3
```

## Usage

1. **Saving Stories**: Click "save" next to any story on the HN homepage or directly on a comment page.
2. **Reading**: Open a saved story's comments. The extension will automatically scroll to your last saved checkpoint.
3. **Tracking**: 
   - Click the 📍 **Checkpoint** button to save your current position.
   - Use ⏭️ **Next Topic** to skip to the next parent comment.
   - Click the `▼` / `▲` button on any comment to collapse/expand the thread.
4. **Keyboard**: Press `Cmd+Shift+S` (Mac) or `Ctrl+Shift+S` (Windows) to save/unsave a story instantly.
5. **Manage**: Click the extension popup to see all saved stories, their checkpoint status, and comment counts.

## Tech Stack

- [WXT](https://wxt.dev) - Modern browser extension framework.
- TypeScript - For type-safe development.
- [idb](https://github.com/jakearchibald/idb) - A tiny wrapper that makes the native IndexedDB API usable with `async/await`.
- Vanilla CSS - For lightweight, HN-native styling.

## Features in Detail

### Visual Minimap
The 16px wide scrollbar on the right side indicates:
- **Gray**: Comments before your checkpoint (Read)
- **Orange**: Comments after your checkpoint (Unread)
- **Blue**: New comments posted since your last checkpoint visit

Clicking any marker scrolls the comment into view.
