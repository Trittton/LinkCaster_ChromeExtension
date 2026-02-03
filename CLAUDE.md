# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**LinkCaster** is a Chrome Extension (Manifest V3) that converts image links between hosting services and uploads media to cloud storage. It features a Node.js backend for Google Drive OAuth authentication.

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js + Express (deployed on Railway)
- **APIs**: Google Drive API, Catbox.moe, vgy.me
- **Storage**: Chrome Storage API, IndexedDB for folder handles

## Project Structure

```
LinkCaster/
├── manifest.json          # Chrome Extension manifest v3
├── popup.html             # Main extension UI
├── popup.css              # Styling with dark/light themes
├── popup.js               # Main extension logic
├── background.js          # Service worker for OAuth & API calls
├── extension_icon.png     # Extension icon
├── icons/                 # Multi-size icons (16, 48, 128)
├── js/modules/            # ES6 modules (refactored code)
│   ├── constants.js       # Centralized constants
│   ├── storage.js         # Chrome storage utilities
│   ├── uploadServices.js  # Upload service handlers
│   └── ...
├── backend/               # Node.js OAuth server
│   ├── server.js          # Express server
│   ├── package.json       # Dependencies
│   └── .env               # Environment variables (not tracked)
├── docs/                  # Documentation
│   ├── user/              # User guides
│   └── development/       # Developer docs
└── scripts/build/         # Build tools
    └── build.py           # Python build script
```

## Development Commands

### Build Extension
```bash
python scripts/build/build.py
```
This creates `build/LinkCaster_Extension.zip` for Chrome Web Store upload.

### Run Backend Locally
```bash
cd backend
npm install
npm start
```
Requires `.env` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

## Architecture Notes

### Upload Services (3 supported)
1. **Catbox.moe** - Anonymous file hosting, no API key required
2. **vgy.me** - Image hosting, requires user key
3. **Google Drive** - Requires OAuth via backend server

### Key Patterns
- **Message Passing**: `chrome.runtime.sendMessage()` for popup ↔ background communication
- **Token Refresh Locking**: Prevents race conditions during parallel uploads (`background.js`)
- **Retry with Backoff**: Upload functions retry 3x with exponential backoff

### Data Flow
1. User pastes links or selects files in popup
2. Popup sends upload request to background service worker
3. Background handles OAuth/API calls (avoids CORS issues)
4. Results returned via message response

## Code Style

- Vanilla JavaScript (no frameworks)
- camelCase for functions/variables
- JSDoc comments for module exports
- Error handling with try-catch and user-friendly messages
- HTML escaping for XSS prevention

## Common Tasks

### Adding Upload Service
1. Add endpoint to `js/modules/constants.js`
2. Create upload function in `js/modules/uploadServices.js`
3. Add UI option in `popup.html` service dropdown
4. Handle in `popup.js` processUrl function

### Testing Extension
1. Load unpacked at `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" and select project root
4. Click extension icon to test

## Environment Variables (Backend)

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.railway.app/oauth/callback
PORT=3000
```

## Git Workflow

- Main branch: `main`
- Backend is deployed on Railway (auto-deploys on push)
- Extension ZIP uploaded manually to Chrome Web Store
