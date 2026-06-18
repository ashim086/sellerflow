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
          reject(new Error("Failed to parse response"));
        }
      });
    });
    req.on("error", reject);

    if (bodyData) {
      const encoded = new URLSearchParams(bodyData).toString();
      req.setHeader("Content-Type", "application/x-www-form-urlencoded");
      req.write(encoded);
    }
    req.end();
  });
}

function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: process.env.FB_REDIRECT_URI,
    code,
  });
  return apiRequest(`/oauth/access_token?${params.toString()}`);
}

function getUserPages(accessToken) {
  return apiRequest(`/me/accounts?access_token=${accessToken}&limit=100`);
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

function getConversations(pageId, pageAccessToken) {
  return apiRequest(`/${pageId}/conversations?fields=id,updated_time,message_count,senders{id,name}&access_token=${pageAccessToken}&limit=50`);
}

function getConversationMessages(conversationId, pageAccessToken) {
  return apiRequest(`/${conversationId}/messages?fields=id,message,from,created_time,to&access_token=${pageAccessToken}&limit=100`);
}

function getPageAccessToken(pageId, userAccessToken) {
  return apiRequest(`/${pageId}?fields=id,name,access_token&access_token=${userAccessToken}`);
}

function getPage(pageId, pageAccessToken) {
  return apiRequest(`/${pageId}?fields=id,name,instagram_business_account{id,username}&access_token=${pageAccessToken}`);
}

function getPageFeed(pageId, pageAccessToken) {
  return apiRequest(`/${pageId}/posts?fields=id,message,created_time&access_token=${pageAccessToken}&limit=20`);
}

function getPostComments(postId, pageAccessToken) {
  return apiRequest(`/${postId}/comments?fields=id,message,from,created_time,parent&access_token=${pageAccessToken}&limit=100`);
}

function cleanCommentIds(comments) {
  if (comments && comments.data) {
    comments.data.forEach(c => { c.id = c.id.split("_").pop(); });
  }
  return comments;
}

function replyToComment(commentId, message, pageAccessToken) {
  return apiRequest(`/${commentId}/comments?access_token=${pageAccessToken}`, "POST", { message });
}

function replyToConversation(conversationId, message, pageAccessToken) {
  return apiRequest(`/${conversationId}/messages?access_token=${pageAccessToken}`, "POST", { message });
}

function sendMessageToUser(pageId, recipientId, message, pageAccessToken) {
  const bodyJson = JSON.stringify({
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message: { text: message },
  });
  return new Promise((resolve, reject) => {
    const url = new URL(`https://graph.facebook.com/v23.0/${pageId}/messages?access_token=${pageAccessToken}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyJson) },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed);
        } catch { reject(new Error("Failed to parse response")); }
      });
    });
    req.on("error", reject);
    req.write(bodyJson);
    req.end();
  });
}

function subscribePageToWebhooks(pageId, pageAccessToken) {
  return apiRequest(
    `/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,feed&access_token=${pageAccessToken}`,
    "POST"
  );
}

function deleteComment(commentId, pageAccessToken) {
  return apiRequest(`/${commentId}?access_token=${pageAccessToken}`, "DELETE");
}

function debugToken(accessToken) {
  return apiRequest(`/debug_token?input_token=${accessToken}&access_token=${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`);
}

function getMe(accessToken) {
  return apiRequest(`/me?fields=id,name,accounts{id,name,instagram_business_account{id,username}},instagram_basic_id&access_token=${accessToken}`);
}

function getPageInstagramAccounts(pageId, pageAccessToken) {
  return apiRequest(`/${pageId}/instagram_accounts?access_token=${pageAccessToken}`);
}

function getPageWithAllFields(pageId, pageAccessToken) {
  return apiRequest(
    `/${pageId}?fields=id,name,instagram_business_account{id,username,profile_picture_url},connected_instagram_account,instagram_accounts{id,username}&access_token=${pageAccessToken}`
  );
}

module.exports = {
  apiRequest,
  exchangeCodeForToken,
  getUserPages,
  getLongLivedToken,
  getConversations,
  getConversationMessages,
  getPageFeed,
  getPage,
  getPageAccessToken,
  getPostComments,
  cleanCommentIds,
  replyToComment,
  replyToConversation,
  sendMessageToUser,
  deleteComment,
  subscribePageToWebhooks,
  debugToken,
  getMe,
  getPageInstagramAccounts,
  getPageWithAllFields,
};
