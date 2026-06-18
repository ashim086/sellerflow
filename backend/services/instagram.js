const https = require("https");

const BASE = "https://graph.facebook.com/v23.0";

function apiRequest(path, method = "GET", bodyData = null) {
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

    if (bodyData) {
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
    redirect_uri: process.env.REDIRECT_URI,
    code,
  });
  return apiRequest(`/oauth/access_token?${params.toString()}`, "GET");
}

function getUserPages(accessToken) {
  return apiRequest(`/me/accounts?access_token=${accessToken}&limit=100`);
}

function getInstagramBusinessAccount(pageId, accessToken) {
  return apiRequest(`/${pageId}?fields=instagram_business_account{id,username,profile_picture_url},connected_instagram_account{id,username}&access_token=${accessToken}`);
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

function getConversations(igUserId, pageAccessToken) {
  return apiRequest(`/me/conversations?platform=instagram&fields=id,updated_time,participants,messages{from,message,timestamp}&access_token=${pageAccessToken}&limit=50`);
}

function getConversationMessages(conversationId, pageAccessToken) {
  return apiRequest(`/${conversationId}/messages?fields=id,message,timestamp,from{id,username},to{data{id,username}}&access_token=${pageAccessToken}&limit=100`);
}

function subscribeAppToIgAccount(igUserId, pageAccessToken) {
  return apiRequest(
    `/${igUserId}/subscribed_apps?subscribed_fields=messages,comments&access_token=${pageAccessToken}`,
    "POST"
  );
}

function sendDM(pageId, recipientId, messageText, pageAccessToken) {
  const bodyJson = JSON.stringify({
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message: { text: messageText },
  });
  return new Promise((resolve, reject) => {
    const url = new URL(`https://graph.facebook.com/v23.0/${pageId}/messages?access_token=${pageAccessToken}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyJson),
      },
    };
    const req = require("https").request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            console.log("[IG] SendDM error:", JSON.stringify(parsed.error));
            reject(new Error(parsed.error.message));
          } else resolve(parsed);
        } catch { reject(new Error("Failed to parse response")); }
      });
    });
    req.on("error", reject);
    req.write(bodyJson);
    req.end();
  });
}

function replyToConversation(conversationId, message, pageAccessToken) {
  return apiRequest(`/${conversationId}/messages?access_token=${pageAccessToken}`, "POST", { message });
}

function getMedia(igUserId, pageAccessToken) {
  return apiRequest(`/${igUserId}/media?fields=id,caption,media_type,timestamp,thumbnail_url,media_url&access_token=${pageAccessToken}&limit=20`);
}

function getMediaComments(mediaId, pageAccessToken) {
  return apiRequest(`/${mediaId}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp}&access_token=${pageAccessToken}&limit=50`);
}

function replyToComment(commentId, message, pageAccessToken) {
  return apiRequest(`/${commentId}/replies?access_token=${pageAccessToken}`, "POST", { message });
}

function deleteComment(commentId, pageAccessToken) {
  return apiRequest(`/${commentId}?access_token=${pageAccessToken}`, "DELETE");
}

module.exports = {
  apiRequest,
  exchangeCodeForToken,
  getUserPages,
  getInstagramBusinessAccount,
  longLivedUserToken,
  debugToken,
  getPageDirect,
  subscribeAppToIgAccount,
  getConversations,
  getConversationMessages,
  sendDM,
  replyToConversation,
  getMedia,
  getMediaComments,
  replyToComment,
  deleteComment,
};
