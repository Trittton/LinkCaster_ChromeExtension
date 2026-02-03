const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Increase payload size limit for video uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// CORS configuration - allow Chrome extension origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Allow Chrome extension origins
    if (origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// In-memory session storage (for production, use Redis or database)
const sessions = new Map();

// Google OAuth configuration
const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
  scope: 'https://www.googleapis.com/auth/drive.file'
};

// Validate configuration on startup
if (!GOOGLE_CONFIG.clientId || !GOOGLE_CONFIG.clientSecret || !GOOGLE_CONFIG.redirectUri) {
  console.error('ERROR: Missing required environment variables!');
  console.error('Please configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env file');
  process.exit(1);
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'LinkCaster Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/auth/google/start',
      callback: '/oauth/callback',
      upload: '/api/upload'
    }
  });
});

// 1. Start OAuth flow
app.get('/auth/google/start', (req, res) => {
  try {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const state = crypto.randomBytes(16).toString('hex');

    // Store session
    sessions.set(sessionId, {
      state,
      timestamp: Date.now()
    });

    console.log(`Created OAuth session: ${sessionId}`);

    // Build authorization URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CONFIG.clientId)}&` +
      `redirect_uri=${encodeURIComponent(GOOGLE_CONFIG.redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(GOOGLE_CONFIG.scope)}&` +
      `state=${state}&` +
      `access_type=offline&` +
      `prompt=consent`;

    res.json({ authUrl, sessionId });
  } catch (error) {
    console.error('Error starting OAuth flow:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

// 2. OAuth callback handler
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('OAuth error:', error);
    return res.status(400).send(`
      <html><body>
        <h2>Authorization Failed</h2>
        <p>Error: ${error}</p>
        <p>You can close this window.</p>
      </body></html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send(`
      <html><body>
        <h2>Invalid Request</h2>
        <p>Missing authorization code or state parameter.</p>
        <p>You can close this window.</p>
      </body></html>
    `);
  }

  // Find session by state
  const session = Array.from(sessions.values()).find(s => s.state === state);
  if (!session) {
    console.error('Invalid state parameter:', state);
    return res.status(400).send(`
      <html><body>
        <h2>Invalid Session</h2>
        <p>Session expired or invalid. Please try connecting again.</p>
        <p>You can close this window.</p>
      </body></html>
    `);
  }

  try {
    console.log('Exchanging authorization code for tokens...');

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: GOOGLE_CONFIG.clientSecret,
        code,
        redirect_uri: GOOGLE_CONFIG.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      throw new Error('No access token received');
    }

    console.log('Token exchange successful');

    // Store tokens in session (for backward compatibility and fallback)
    session.accessToken = tokenData.access_token;
    session.refreshToken = tokenData.refresh_token;
    session.expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Also store tokens in a way the extension can retrieve them
    session.tokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type
    };

    res.send(`
      <html>
        <head>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            h2 {
              color: #667eea;
              margin: 0 0 16px 0;
            }
            p {
              color: #666;
              margin: 0;
            }
            .icon {
              font-size: 64px;
              margin-bottom: 16px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>Authorization Successful!</h2>
            <p>You can now close this window and return to the extension.</p>
          </div>
          <script>
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).send(`
      <html><body>
        <h2>Authorization Failed</h2>
        <p>Error: ${error.message}</p>
        <p>You can close this window.</p>
      </body></html>
    `);
  }
});


// 2.3. Get tokens endpoint (for extension to retrieve after OAuth)
app.get('/auth/tokens/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  const session = sessions.get(sessionId);
  if (!session || !session.tokens) {
    return res.status(404).json({
      success: false,
      error: 'Session not found or tokens not available'
    });
  }

  // Return tokens to extension
  const tokens = session.tokens;

  // Clear tokens from server after retrieval (client will store them)
  delete session.tokens;

  res.json({
    success: true,
    tokens: tokens
  });
});

// Helper function to refresh access token
async function refreshAccessToken(session) {
  if (!session.refreshToken) {
    throw new Error('No refresh token available');
  }

  console.log('Refreshing access token...');

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CONFIG.clientId,
        client_secret: GOOGLE_CONFIG.clientSecret,
        refresh_token: session.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('Token refresh failed:', tokenData);
      throw new Error('Failed to refresh access token');
    }

    // Update session with new access token
    session.accessToken = tokenData.access_token;
    session.expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // If a new refresh token is provided, update it (Google sometimes rotates refresh tokens)
    if (tokenData.refresh_token) {
      session.refreshToken = tokenData.refresh_token;
    }

    console.log('Access token refreshed successfully');
    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

// 2.5. Session verification endpoint
app.get('/auth/verify/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.json({
      authenticated: false,
      error: 'Session not found'
    });
  }

  if (!session.accessToken) {
    return res.json({
      authenticated: false,
      error: 'Session not authenticated'
    });
  }

  // Check if token is expired or will expire soon (within 5 minutes)
  const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
  if (Date.now() >= session.expiresAt || fiveMinutesFromNow >= session.expiresAt) {
    // Try to refresh the token
    if (session.refreshToken) {
      try {
        await refreshAccessToken(session);
        return res.json({
          authenticated: true,
          expiresAt: session.expiresAt,
          refreshed: true
        });
      } catch (error) {
        return res.json({
          authenticated: false,
          error: 'Token expired and refresh failed'
        });
      }
    } else {
      return res.json({
        authenticated: false,
        error: 'Token expired and no refresh token available'
      });
    }
  }

  return res.json({
    authenticated: true,
    expiresAt: session.expiresAt
  });
});

// 3. Upload proxy endpoint
app.post('/api/upload', async (req, res) => {
  const { sessionId, fileData, filename } = req.body;

  if (!sessionId || !fileData || !filename) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: sessionId, fileData, or filename'
    });
  }

  // Find session by ID
  const sessionEntry = Array.from(sessions.entries()).find(([id]) => id === sessionId);
  if (!sessionEntry) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid session ID'
    });
  }

  const [, session] = sessionEntry;

  if (!session.accessToken) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: No access token found'
    });
  }

  // Check token expiration and refresh if needed
  const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
  if (Date.now() >= session.expiresAt || fiveMinutesFromNow >= session.expiresAt) {
    if (session.refreshToken) {
      try {
        await refreshAccessToken(session);
        console.log('Token refreshed before upload');
      } catch (error) {
        console.error('Failed to refresh token:', error);
        return res.status(401).json({
          success: false,
          error: 'Token expired and refresh failed. Please reconnect to Google Drive'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Token expired: Please reconnect to Google Drive'
      });
    }
  }

  try {
    console.log(`Uploading file: ${filename} (${fileData.length} bytes)`);

    // Parse base64 data
    const base64Match = fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid base64 data format');
    }

    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    console.log(`File details - Type: ${mimeType}, Size: ${buffer.length} bytes`);

    // Prepare multipart upload
    const metadata = {
      name: filename,
      mimeType: mimeType
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartBody = Buffer.concat([
      Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata)),
      Buffer.from(delimiter + `Content-Type: ${mimeType}\r\n\r\n`),
      buffer,
      Buffer.from(close_delim)
    ]);

    // Upload to Google Drive
    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`
        },
        body: multipartBody
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.id;

    console.log(`File uploaded successfully, ID: ${fileId}`);

    // Make file publicly accessible
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    console.log('File made public');

    // Generate preview URL (opens in browser player, not download)
    const directUrl = `https://drive.google.com/file/d/${fileId}/view`;

    res.json({
      success: true,
      url: directUrl,
      fileId: fileId
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. Refresh token endpoint (for client-side token refresh)
app.post('/api/refresh-token', async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({
            success: false,
            error: 'Missing refresh_token'
        });
    }

    try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GOOGLE_CONFIG.clientId,
                client_secret: GOOGLE_CONFIG.clientSecret,
                refresh_token: refresh_token,
                grant_type: 'refresh_token'
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('Token refresh failed:', tokenData);
            return res.status(401).json({
                success: false,
                error: 'Failed to refresh access token'
            });
        }

        res.json({
            access_token: tokenData.access_token,
            expires_in: tokenData.expires_in,
            token_type: tokenData.token_type
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error during token refresh'
        });
    }
});


// Session cleanup - remove expired sessions
// Sessions with refresh tokens are kept for 30 days
// Sessions without refresh tokens are removed after 1 hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let cleanupCount = 0;

  for (const [id, session] of sessions.entries()) {
    // Remove sessions older than 30 days regardless of refresh token
    if (session.timestamp < thirtyDaysAgo) {
      sessions.delete(id);
      cleanupCount++;
      continue;
    }

    // Remove sessions without refresh token that are older than 1 hour
    if (!session.refreshToken && session.timestamp < oneHourAgo) {
      sessions.delete(id);
      cleanupCount++;
    }
  }

  if (cleanupCount > 0) {
    console.log(`Cleaned up ${cleanupCount} expired session(s)`);
  }
}, 60 * 60 * 1000);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('LinkCaster Backend Server');
  console.log('='.repeat(50));
  console.log(`Status: Running on port ${PORT}`);
  console.log(`Google Client ID: ${GOOGLE_CONFIG.clientId.substring(0, 20)}...`);
  console.log(`Redirect URI: ${GOOGLE_CONFIG.redirectUri}`);
  console.log('='.repeat(50));
});
