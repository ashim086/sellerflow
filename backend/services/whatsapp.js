const https = require("https");

const BASE = "https://graph.facebook.com/v23.0";

function apiRequest(path, method = "GET", bodyData = null, jsonBody = false) {
  return new Promise((resolve, reject) => {
    const url = `${BASE}${path}`;
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
    };

    if (jsonBody) {
      options.headers = { "Content-Type": "application/json" };
    }

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data);
        } catch {
          reject(new Error("Failed to parse response"));
        }
      });
    });

    req.on("error", reject);

    if (bodyData && jsonBody) {
      req.write(JSON.stringify(bodyData));
    } else if (bodyData) {
      req.setHeader("Content-Type", "application/x-www-form-urlencoded");
      req.write(new URLSearchParams(bodyData).toString());
    }

    req.end();
  });
}

function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: process.env.WA_REDIRECT_URI,
    code,
  });
  return apiRequest(`/oauth/access_token?${params.toString()}`);
}

function getBusinesses(accessToken) {
  return apiRequest(`/me/businesses?access_token=${accessToken}&limit=100`);
}

function getOwnedWABAs(businessId, accessToken) {
  return apiRequest(`/${businessId}/owned_whatsapp_business_accounts?access_token=${accessToken}&limit=10`);
}

function getPhoneNumbers(wabaId, accessToken) {
  return apiRequest(`/${wabaId}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name,quality_rating`);
}

function sendMessage(phoneNumberId, to, text, accessToken) {
  return apiRequest(
    `/${phoneNumberId}/messages?access_token=${accessToken}`,
    "POST",
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    true
  );
}

function subscribeToWebhooks(wabaId, accessToken) {
  return apiRequest(
    `/${wabaId}/subscribed_apps?access_token=${accessToken}`,
    "POST"
  );
}

function getLongLivedToken(userAccessToken) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: userAccessToken,
  });
  return apiRequest(`/oauth/access_token?${params.toString()}`);
}

module.exports = {
  exchangeCodeForToken,
  getBusinesses,
  getOwnedWABAs,
  getPhoneNumbers,
  sendMessage,
  subscribeToWebhooks,
  getLongLivedToken,
};
