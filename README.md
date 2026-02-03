# LinkCaster

**A Chrome Extension for seamless image link conversion and cloud uploads**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

LinkCaster transforms how you work with images online. Convert screenshot links from services like Lightshot into permanent, shareable URLs on your preferred cloud storage. Upload images and videos directly to Google Drive, Catbox, or vgy.me with a single click.

## Key Features

### Link Conversion
- **Batch Processing** - Convert multiple image links simultaneously
- **Smart Detection** - Automatically extracts direct image URLs from Lightshot pages
- **Multiple Destinations** - Upload to Catbox.moe, vgy.me, or Google Drive
- **Parallel Processing** - Concurrent uploads with intelligent rate limiting

### Image Uploads
- **Folder Monitoring** - Auto-detect new screenshots from selected folders
- **Time Filtering** - Show only files from the last N minutes
- **Batch Selection** - Upload multiple images with one click
- **Upload History** - Track all uploads with one-click link copying

### Video Uploads
- **Google Drive Integration** - Direct video uploads with auto-generated shareable links
- **Large File Support** - Handles videos up to Google Drive's limits
- **Progress Tracking** - Real-time upload progress indicators

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JavaScript (ES6 Modules), HTML5, CSS3 |
| **Extension** | Chrome Manifest V3, Service Workers |
| **Backend** | Node.js, Express.js |
| **Cloud APIs** | Google Drive API, Catbox.moe API, vgy.me API |
| **Storage** | Chrome Storage API, IndexedDB |
| **Deployment** | Railway (backend) |

## Architecture

```
LinkCaster/
├── manifest.json           # Chrome extension manifest (MV3)
├── background.js           # Service worker for API calls & OAuth
├── popup.html/css          # Extension popup UI
├── js/
│   ├── popup.js            # Main entry point
│   └── modules/            # ES6 module architecture
│       ├── convertTab.js       # Link conversion logic
│       ├── uploadImageTab.js   # Image upload handling
│       ├── uploadVideoTab.js   # Video upload handling
│       ├── uploadServices.js   # Cloud service integrations
│       ├── storage.js          # Chrome storage abstraction
│       ├── fileMonitoring.js   # File System Access API
│       └── ...
└── backend/
    └── server.js           # OAuth proxy & token refresh
```

### Design Decisions

- **Manifest V3** - Future-proof architecture using service workers instead of background pages
- **ES6 Modules** - Clean separation of concerns with explicit imports/exports
- **IndexedDB for File Handles** - Persist folder access permissions across sessions
- **Token Refresh Locking** - Prevents race conditions during OAuth token refresh
- **Exponential Backoff** - Graceful retry logic for failed uploads

## Installation

### From Source

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/LinkCaster.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (top right toggle)

4. Click **Load unpacked** and select the `LinkCaster` folder

5. The extension icon will appear in your browser toolbar

### Backend Setup (for Google Drive)

1. Navigate to the backend directory
   ```bash
   cd backend
   npm install
   ```

2. Create a `.env` file with your Google OAuth credentials
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=your_redirect_uri
   ```

3. Start the server
   ```bash
   npm start
   ```

## Usage

### Converting Links

1. Click the LinkCaster icon in your browser toolbar
2. Paste image links into the text area (one per line or space-separated)
3. Select your destination service (Catbox, vgy.me, or Google Drive)
4. Click **Replace Links**
5. Copy the converted URLs from the output

### Uploading Images

1. Switch to the **Upload Img** tab
2. Either:
   - Select a folder to monitor for new screenshots, or
   - Use the file picker to select images directly
3. Check the files you want to upload
4. Click **Upload**

### Supported Link Types

| Service | Example URL |
|---------|-------------|
| Lightshot | `https://prnt.sc/abc123` |
| Direct Images | `https://example.com/image.png` |
| Direct Videos | `https://example.com/video.mp4` |

## API Configuration

### vgy.me
1. Create an account at [vgy.me](https://vgy.me)
2. Get your user key from [Account Details](https://vgy.me/account/details)
3. Enter the key in LinkCaster settings

### Google Drive
1. Click **Connect to Google Drive** in the extension
2. Authorize the application
3. Files upload to a `LinkCaster` folder in your Drive

## Development

### Building for Distribution

```bash
python scripts/build/build.py
```

This creates a `build/` directory with the packaged extension.

### Project Structure

| Directory | Purpose |
|-----------|---------|
| `js/modules/` | Core business logic as ES6 modules |
| `backend/` | OAuth proxy server for Google Drive |
| `docs/user/` | End-user documentation |
| `scripts/build/` | Build automation |

## Privacy

- **No data collection** - All processing happens locally in your browser
- **No tracking** - No analytics or telemetry
- **Minimal permissions** - Only requests permissions necessary for functionality
- **Secure OAuth** - Tokens stored locally, never transmitted to third parties

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with JavaScript, powered by cloud APIs**
