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
