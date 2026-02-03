// Quick fix for OAuth callback session tracking
// Replace lines 125-174 in server.js with this:

// Find session by state and track its ID
let foundSessionId = null;
let session = null;

for (const [id, sess] of sessions.entries()) {
    if (sess.state === state) {
        foundSessionId = id;
        session = sess;
        break;
    }
}

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

    console.log(`Token exchange successful for session: ${foundSessionId}`);

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

    // Store the sessionId in the session for debugging
    session.sessionId = foundSessionId;

    console.log(`Tokens stored and ready for retrieval at /auth/tokens/${foundSessionId}`);
