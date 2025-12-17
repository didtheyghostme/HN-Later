# HN Read Later Chrome Extension

## Planning
- [x] Research HN site structure (comments, IDs, DOM)
- [x] Create implementation plan
- [x] Get user approval on plan

## Core Extension Setup
- [x] Create manifest.json (Manifest V3)
- [x] Set up folder structure
- [x] Create background service worker
- [x] Create content script for HN pages

## Read Later List Management
- [x] Implement "Save to Read Later" button on story pages
- [x] Create popup UI with saved items list
- [x] Store saved items in chrome.storage.local
- [x] Add delete/remove functionality

## Comment Tracking System
- [x] Parse and identify all comments on a thread page
- [x] Implement scroll-based read detection (Intersection Observer)
- [x] Calculate and display reading progress percentage
- [x] Save per-thread reading state (read comment IDs)

## Resume Reading Feature
- [x] Detect previously saved threads when visiting
- [x] Highlight unread comments
- [x] Auto-scroll to first unread or last read position
- [x] Show progress indicator on page

## UI/UX Polish
- [x] Design popup interface
- [x] Add visual indicators on HN pages
- [x] Progress bar/percentage display
- [ ] Handle edge cases (collapsed comments, deleted comments)

## Testing & Verification
- [ ] Test on various HN threads
- [ ] Verify storage persistence
- [ ] Test resume functionality
