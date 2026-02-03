# LinkCaster Backend Server

Backend server for the LinkCaster Chrome extension that handles Google Drive OAuth authentication and file upload proxying.

## Why a Backend?

Chrome extensions cannot safely store Google OAuth credentials in the extension code (they would be visible to users). This backend server:
- Securely stores Google OAuth credentials server-side
- Handles the OAuth flow without exposing credentials
- Proxies file uploads to Google Drive
- Provides a user-friendly one-click connection experience

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"

4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "LinkCaster Backend"
   - Authorized redirect URIs: Add your backend URL + `/oauth/callback`
     - For local development: `http://localhost:3000/oauth/callback`
     - For production: `https://your-backend.com/oauth/callback`
   - Click "Create"
   - Copy the Client ID and Client Secret

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
   PORT=3000
   ```

### 4. Run the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on port 3000 (or your configured PORT).

## Deployment

### Deploy to Railway (Recommended)

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login and create project:
   ```bash
   railway login
   railway init
   ```

3. Set environment variables:
   ```bash
   railway variables set GOOGLE_CLIENT_ID="your-client-id"
   railway variables set GOOGLE_CLIENT_SECRET="your-client-secret"
   railway variables set GOOGLE_REDIRECT_URI="https://your-app.railway.app/oauth/callback"
   ```

4. Deploy:
   ```bash
   railway up
   ```

### Deploy to Heroku

1. Install Heroku CLI and login:
   ```bash
   heroku login
   ```

2. Create app:
   ```bash
   heroku create your-app-name
   ```

3. Set environment variables:
   ```bash
   heroku config:set GOOGLE_CLIENT_ID="your-client-id"
   heroku config:set GOOGLE_CLIENT_SECRET="your-client-secret"
   heroku config:set GOOGLE_REDIRECT_URI="https://your-app-name.herokuapp.com/oauth/callback"
   ```

4. Deploy:
   ```bash
   git push heroku main
   ```

## API Endpoints

### `GET /auth/google/start`

Initiates the OAuth flow.

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "sessionId": "abc123..."
}
```

### `GET /oauth/callback`

OAuth callback endpoint (handled automatically by Google).

### `POST /api/upload`

Uploads a file to Google Drive.

**Request:**
```json
{
  "sessionId": "abc123...",
  "fileData": "data:video/mp4;base64,...",
  "filename": "video.mp4"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://drive.google.com/uc?id=...",
  "fileId": "..."
}
```

## Security Features

- CORS protection (only Chrome extensions allowed)
- Rate limiting (100 requests per 15 minutes per IP)
- Session-based authentication
- Automatic session cleanup (1 hour expiration)
- Environment variable protection for credentials

## Update Extension Configuration

After deploying the backend, update the extension's `background.js`:

```javascript
const BACKEND_URL = 'https://your-backend-url.com'; // Update with your deployed URL
```

## Troubleshooting

**"Missing required environment variables" error:**
- Make sure `.env` file exists and contains all required variables
- Check that variable names match exactly

**OAuth callback fails:**
- Verify GOOGLE_REDIRECT_URI matches the authorized redirect URI in Google Cloud Console
- Ensure the URL is accessible from the internet (for production)

**Upload fails with 401 error:**
- Session may have expired (sessions last 1 hour)
- User needs to reconnect to Google Drive

**CORS errors:**
- Backend only accepts requests from Chrome extensions
- Make sure the extension is properly configured

## License

Part of the LinkCaster Chrome Extension project.
