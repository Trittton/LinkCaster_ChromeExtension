# Troubleshooting Guide

## Links Not Converting (Showing Same URLs)

If the extension shows the same links after clicking "Replace Links", follow these debugging steps:

### Step 1: Check Browser Console

1. Open the extension popup
2. Right-click anywhere in the popup
3. Select "Inspect" or "Inspect Element"
4. Open the **Console** tab
5. Try converting links again
6. Look for error messages in red

### Common Errors and Solutions

#### Error: "Failed to fetch" or CORS error

**Problem**: The browser is blocking cross-origin requests.

**Solution**: The extension manifest already includes host_permissions. Try:
1. Reload the extension in `chrome://extensions/`
2. Make sure all permissions are granted
3. Check if the image URLs are accessible in a normal browser tab

#### Error: "Failed to download image: 403" or "404"

**Problem**: Lightshot images may be deleted or the URL pattern changed.

**Solutions**:
- Lightshot URL pattern: `https://image.prntscr.com/image/{ID}.png`
- Try opening the Lightshot link in a browser to verify the image exists
- Some old Lightshot links may no longer work

#### Error: "vgy.me upload failed" or "vgy.me returned invalid response"

**Problem**: vgy.me API might have changed or rate limiting.

**Solutions**:
1. Try uploading one link at a time
2. Wait a few seconds between batches
3. Try using Imgur instead (requires API key)
4. Check console logs for the exact vgy.me response

### Step 2: Test Individual Components

#### Test 1: Check if images download
Open browser console and run:
```javascript
fetch('https://image.prntscr.com/image/Afb41BNheMO2.png')
  .then(r => r.blob())
  .then(b => console.log('Downloaded:', b.type, b.size, 'bytes'))
  .catch(e => console.error('Error:', e))
```

#### Test 2: Check vgy.me API
```javascript
fetch('https://vgy.me/upload', {
  method: 'POST',
  body: new FormData()
})
.then(r => r.json())
.then(d => console.log('vgy.me response:', d))
.catch(e => console.error('vgy.me error:', e))
```

### Step 3: Alternative Upload Services

If vgy.me doesn't work, you can modify the code to use other services:

#### Option A: Use Imgur
1. Get API key from https://api.imgur.com/oauth2/addclient
2. Select "Imgur" in the extension
3. Save your Client ID

#### Option B: imgbb.com
Add to the extension (requires code modification):
```javascript
async function uploadToImgbb(imageBlob, apiKey) {
  const formData = new FormData();
  const base64 = await blobToBase64(imageBlob);
  formData.append('image', base64.split(',')[1]);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  return data.data.url;
}
```

## Known Limitations

### Lightshot (prnt.sc)
- Some very old images may be deleted
- URL pattern: `https://prnt.sc/XXXXXX` → `https://image.prntscr.com/image/XXXXXX.png`
- If the image doesn't exist, you'll see a 404 error

### vgy.me
- Free service, may have rate limits
- No API key required
- May occasionally be slow or down

### Imgur
- Requires API Client ID (free)
- Rate limit: 12,500 uploads/day
- More reliable than free services

## Getting More Help

### Enable Detailed Logging

The extension already logs to console. To see all logs:
1. Open DevTools (F12) while using the extension
2. Keep Console tab open
3. Try converting links
4. Copy any error messages

### Common Console Messages

✅ **Normal operation**:
```
Processing URL: https://prnt.sc/Afb41BNheMO2
Direct image URL: https://image.prntscr.com/image/Afb41BNheMO2.png
Downloaded blob: image/png 245678 bytes
Uploading to: vgy
vgy.me response: {image: "https://vgy.me/xyz.png"}
Upload successful, new URL: https://vgy.me/xyz.png
```

❌ **Failed operation**:
```
Processing URL: https://prnt.sc/Afb41BNheMO2
Direct image URL: https://image.prntscr.com/image/Afb41BNheMO2.png
Download error for URL: https://image.prntscr.com/image/Afb41BNheMO2.png
Error: Failed to fetch
```

## Report Issues

If you continue having problems:
1. Note the exact error message from console
2. Test if the Lightshot link opens in a normal browser tab
3. Try with a different image hosting service
4. Check if it's a rate limiting issue (wait 5-10 minutes)
