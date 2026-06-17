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

    if (method === "POST") {
      console.log("[API] POST", options.path.substring(0, 120) + "...");
    }

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (method === "POST") {
          console.log("[API] POST response:", body.substring(0, 300));
        }
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

function getPageInsights(pageId, pageAccessToken) {
  return apiRequest(`/${pageId}/insights?metric=page_impressions,page_engaged_users&access_token=${pageAccessToken}`);
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
  return apiRequest(`/${pageId}?fields=id,name&access_token=${pageAccessToken}`);
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

function deleteComment(commentId, pageAccessToken) {
  return apiRequest(`/${commentId}?access_token=${pageAccessToken}`, "DELETE");
}

function debugToken(accessToken) {
  return apiRequest(`/debug_token?input_token=${accessToken}&access_token=${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`);
}

module.exports = {
  apiRequest,
  exchangeCodeForToken,
  getUserPages,
  getLongLivedToken,
  getPageInsights,
  getConversations,
  getConversationMessages,
  getPageFeed,
  getPage,
  getPageAccessToken,
  getPostComments,
  cleanCommentIds,
  replyToComment,
  deleteComment,
  debugToken,
};
