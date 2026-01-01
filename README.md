# Image Link Converter

A browser extension that converts image links from Lightshot and other image hosting services to your preferred host (vgy.me or Imgur).

## Features

- **Batch Processing**: Convert multiple image links at once
- **Multiple Input Formats**: Paste links separated by newlines or spaces
- **Automatic Detection**: Detects image URLs from various services
- **Lightshot Support**: Automatically handles prnt.sc and prntscr.com links
- **Multiple Upload Services**:
  - vgy.me (no API key required)
  - Imgur (requires API key)
- **Progress Tracking**: Real-time progress indicator
- **One-Click Copy**: Copy converted links to clipboard
- **Background Processing**: Downloads and uploads happen in the background

## Installation

### Chrome/Edge

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `ImgURLConverter` folder
6. The extension icon will appear in your browser toolbar

### Firefox

1. Download or clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the `ImgURLConverter` folder

## Usage

### Basic Usage (vgy.me)

1. Click the extension icon in your browser toolbar
2. Paste your image links into the text area (one per line or space-separated)
3. Make sure "vgy.me" is selected as the upload host
4. Click "Replace Links"
5. Wait for processing to complete
6. Copy the converted links using the "Copy to Clipboard" button

### Using Imgur

1. Get an Imgur API Client ID:
   - Visit [Imgur API Registration](https://api.imgur.com/oauth2/addclient)
   - Register your application (select "OAuth 2 authorization without a callback URL")
   - Copy your Client ID
2. In the extension popup, select "Imgur" from the dropdown
3. Paste your Client ID in the field that appears
4. Click "Save"
5. Now you can use Imgur as your upload host

## Supported Services

The extension can detect and convert links from:

- **Lightshot**: prnt.sc, prntscr.com
- **Direct image links**: Any URL ending in .jpg, .jpeg, .png, .gif, .bmp, .webp
- **Imgur**: i.imgur.com links

## Example Input

```
https://prnt.sc/abc123
https://prnt.sc/def456 https://prnt.sc/ghi789
https://i.imgur.com/xyz.jpg
https://example.com/image.png
```

## Example Output

```
https://vgy.me/converted1.png
https://vgy.me/converted2.png https://vgy.me/converted3.png
https://vgy.me/converted4.jpg
https://vgy.me/converted5.png
```

## Icons

**Note**: This extension currently uses placeholder SVG icons. To add custom icons:

1. Create PNG files at the following sizes:
   - 16x16 pixels → `icons/icon16.png`
   - 48x48 pixels → `icons/icon48.png`
   - 128x128 pixels → `icons/icon128.png`

2. Replace the placeholder.svg file or convert it to PNG format

## Privacy

- This extension does **not** collect or store any personal data
- Image processing happens entirely in your browser
- Images are only sent to the upload service you select (vgy.me or Imgur)
- Settings are stored locally in your browser using Chrome's storage sync API

## Limitations

- **vgy.me**: No API key required, but rate limits may apply
- **Imgur**: Requires API Client ID, free tier allows 12,500 uploads per day
- **File Size**: Depends on the upload service's limits
- **Lightshot**: Some very old Lightshot links may not work if the image has been deleted

## Troubleshooting

### Links not converting

- Ensure the links are valid image URLs
- Check if the images are still available at the source
- Verify your internet connection

### Imgur uploads failing

- Verify your Client ID is correct
- Check if you've exceeded Imgur's rate limits
- Ensure the images meet Imgur's requirements

### Extension not appearing

- Make sure you've enabled the extension in your browser's extension settings
- Try reloading the extension

## Development

### Project Structure

```
ImgURLConverter/
├── manifest.json       # Extension configuration
├── popup.html         # Main UI
├── popup.css          # Styling
├── popup.js           # Main logic
├── background.js      # Background service worker
├── icons/             # Extension icons
└── README.md          # This file
```

### Making Changes

1. Edit the source files
2. Reload the extension in your browser:
   - Chrome: Go to `chrome://extensions/` and click the reload icon
   - Firefox: Go to `about:debugging` and click "Reload"

## License

MIT License - Feel free to use and modify as needed

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## TODO

- [ ] Add support for more image hosting services
- [ ] Add image preview before conversion
- [ ] Add batch size limits to prevent browser freezing
- [ ] Add option to maintain original filename
- [ ] Add support for drag-and-drop
- [ ] Create better icons
- [ ] Add tests
