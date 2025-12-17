# HN Later - Read Later for Hacker News 📑

A Chrome extension that helps you save Hacker News threads to read later, with intelligent comment progress tracking.

## Features

### 📚 Save for Later
- Click "☆ save for later" on any HN story to add it to your reading list
- Access your saved items anytime from the extension popup

### 📊 Reading Progress Tracking
- Automatic tracking of which comments you've read
- Visual percentage indicator showing your progress
- Progress is persisted even when you close the tab

### ▶️ Continue Reading
- Jump directly to where you left off with "Continue Reading"
- Unread comments are automatically detected
- Smooth scrolling to the next unread comment

### 🏷️ Smart Organization
- Filter saved items by: All, Unread, Reading, Complete
- See stats for total saved items and average reading progress
- Items sorted by save date (newest first)

## Installation

### From Source (Developer Mode)

1. **Clone or download** this repository

2. **Open Chrome** and navigate to `chrome://extensions/`

3. **Enable Developer Mode** (toggle in top-right corner)

4. **Click "Load unpacked"** and select the `HN-Later` folder

5. **Pin the extension** to your toolbar for easy access

## How It Works

### Saving Items
- Visit any Hacker News page
- Click "☆ save for later" next to any story
- The story is now in your reading list

### Reading Progress
When you open a saved thread:
- A progress bar appears showing how much you've read
- As you scroll through comments, they're automatically marked as read
- Comments you've read get a subtle green indicator on the left

### Continuing Later
- Click the extension icon to see your reading list
- Items show their reading progress (0-100%)
- Click "Continue" to jump to where you left off
- Or click any item to open it fresh

## Project Structure

```
HN-Later/
├── manifest.json          # Extension configuration
├── background/
│   └── background.js      # Service worker for storage
├── content/
│   ├── content.js         # Page interaction & tracking
│   └── content.css        # Styles for HN pages
├── popup/
│   ├── popup.html         # Popup UI structure
│   ├── popup.css          # Popup styling
│   └── popup.js           # Popup interaction logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Technical Details

- Uses Chrome's `storage.local` API for persistence
- Intersection Observer API for reading detection
- Manifest V3 compliant
- No external dependencies

## Privacy

- All data is stored locally on your device
- No analytics or tracking
- No external network requests (except to news.ycombinator.com)

