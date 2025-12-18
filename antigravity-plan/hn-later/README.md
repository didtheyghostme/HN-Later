# HN Later

A Chrome extension to save Hacker News stories for later, with comment tracking and reading progress.

## Features

- 📍 **Save for Later** - One-click save on any HN story
- 📊 **Progress Tracking** - See % of comments you've read
- 🔵 **New Comments** - Highlights comments you haven't seen since last visit
- 🟠 **Scrollbar Markers** - Visual markers showing unread/new comments
- ⬇️ **Jump to Unread** - Quickly navigate to unread comments
- 💾 **Export/Import** - Backup your data as JSON

## Installation

### Quick Install (No Build Required)

1. Download or clone this repo
2. Go to `chrome://extensions`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `.output/chrome-mv3` folder

### For Developers

If you want to modify the extension:

```bash
npm install
npm run dev    # Dev mode with hot reload
npm run build  # Rebuild after changes
```

> ⚠️ **Remember**: Run `npm run build` before committing if you change source files!

### Development

```bash
npm run dev          # Dev mode with hot reload
npm run build        # Production build
npm run build:firefox # Build for Firefox
npm run zip          # Create zip for distribution
```

## Usage

1. Navigate to [news.ycombinator.com](https://news.ycombinator.com)
2. Click 📍 next to any story to save it
3. Open a saved story's comments and scroll through
4. Click the extension icon to see your saved items with progress
5. Click "Continue" to jump back to where you left off

## Tech Stack

- [WXT](https://wxt.dev) - Next-gen browser extension framework
- TypeScript
- IndexedDB via [idb](https://github.com/jakearchibald/idb)
