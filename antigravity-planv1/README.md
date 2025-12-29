# HN Read Later 📑

A Chrome extension that helps you save Hacker News stories to read later. Track reading progress and resume where you left off.

## Screenshot

<img width="800" alt="HN Read Later scroll comments turn grey as read" src="https://github.com/user-attachments/assets/16347036-d780-4d7f-86cf-6373a9882f3c" />

## Features

- **Save for Later** - Click to save any HN story to your reading list
- **Reading Progress Tracking** - Track which comments you've read
- **Resume Reading** - Jump back to where you left off

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top-right corner)
4. Click **Load unpacked** and select the `antigravity-planv1` folder
5. Pin the extension to your toolbar

## Project Structure

```
antigravity-planv1/
├── manifest.json      # Extension configuration
├── background.js      # Service worker
├── content.js         # Page interaction & tracking
├── content.css        # Styles for HN pages
├── lib/
│   └── storage.js     # Storage utilities
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
```

## Technical Details

- Manifest V3 compliant
- Uses Chrome's `storage.local` API
- No external dependencies
