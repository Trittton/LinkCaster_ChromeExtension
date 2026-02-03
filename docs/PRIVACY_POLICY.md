# Privacy Policy for LinkCaster

**Last Updated:** February 3, 2026

## Overview

LinkCaster ("the extension") is a Chrome browser extension that helps users convert image links and upload files to cloud storage services. This privacy policy explains how we handle your data.

## Data Collection

**LinkCaster does not collect, store, or transmit any personal data to our servers.** All processing happens locally in your browser.

### What We DON'T Do:
- ❌ We do not collect personal information
- ❌ We do not track your browsing activity
- ❌ We do not use analytics or telemetry
- ❌ We do not sell or share any data with third parties
- ❌ We do not store your data on external servers

### What We DO:
- ✅ Process image and video links locally in your browser
- ✅ Store your preferences (like API keys) locally using Chrome's Storage API
- ✅ Communicate directly with third-party services (Catbox.moe, vgy.me, Google Drive) when you explicitly request uploads

## Third-Party Services

When you choose to upload files, LinkCaster communicates directly with the following services:

### Google Drive
- When you connect your Google account, we use OAuth 2.0 for secure authentication
- We only request permission to create and manage files in a dedicated "LinkCaster" folder
- Your Google credentials are never stored by us; tokens are managed locally by Chrome

### Catbox.moe
- Files are uploaded directly to Catbox's servers
- Catbox's own privacy policy applies to uploaded content

### vgy.me
- Files are uploaded directly to vgy.me's servers
- Your vgy.me API key is stored locally in your browser
- vgy.me's own privacy policy applies to uploaded content

## Local Storage

LinkCaster stores the following data locally on your device:
- **Settings & Preferences:** Your chosen default upload service, API keys for vgy.me
- **Upload History:** A record of your recent uploads (stored only on your device)
- **Folder Access Handles:** References to folders you've selected for monitoring (using File System Access API)

This data never leaves your device unless you explicitly choose to sync Chrome settings across devices.

## Permissions

LinkCaster requests the following browser permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Save your settings and preferences locally |
| `activeTab` | Access the current tab only when you click the extension |
| `identity` | Authenticate with Google Drive (OAuth) |
| `nativeMessaging` | Required for file system access |

## Data Security

- All communications with third-party APIs use HTTPS encryption
- OAuth tokens are stored securely using Chrome's built-in storage
- No sensitive data is ever transmitted to our servers

## Children's Privacy

LinkCaster is not directed at children under 13 years of age, and we do not knowingly collect personal information from children.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this document.

## Contact

If you have questions about this privacy policy or LinkCaster, please contact us by opening an issue on our GitHub repository.

---

**Summary:** LinkCaster processes everything locally. We don't collect your data. When you upload to third-party services, their privacy policies apply.
