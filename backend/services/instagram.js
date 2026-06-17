const https = require("https");

const BASE = "https://graph.facebook.com/v23.0";

function apiRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${path}`;
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data);
        } catch {
          reject(new Error("Failed to parse Graph API response"));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: process.env.REDIRECT_URI,
    code,
  });
  return apiRequest(`/oauth/access_token?${params.toString()}`, "GET");
}

function getUserPages(accessToken) {
  return apiRequest(`/me/accounts?access_token=${accessToken}&limit=100`);
}

function getInstagramBusinessAccount(pageId, accessToken) {
  return apiRequest(`/${pageId}?fields=instagram_business_account,connected_instagram_account&access_token=${accessToken}`);
}

function longLivedUserToken(userAccessToken) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: userAccessToken,
  });
  return apiRequest(`/oauth/access_token?${params.toString()}`, "GET");
}

function debugToken(inputToken) {
  const params = new URLSearchParams({
    input_token: inputToken,
    access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
  });
  return apiRequest(`/debug_token?${params.toString()}`, "GET");
}

function getPageDirect(pageId, accessToken) {
  return apiRequest(`/${pageId}?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${accessToken}`);
}

module.exports = {
  exchangeCodeForToken,
  getUserPages,
  getInstagramBusinessAccount,
  longLivedUserToken,
  debugToken,
  getPageDirect,
};
