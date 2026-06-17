const express = require("express");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");
const FacebookAccount = require("../models/FacebookAccount");
const { encrypt, decrypt } = require("../services/encryption");
const facebook = require("../services/facebook");

const router = express.Router();

function signState(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

// GET /api/auth/facebook/url — returns Meta OAuth URL for Page connection
router.get("/facebook/url", authMiddleware, (req, res) => {
  try {
    const state = signState(req.userId);
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: process.env.FB_REDIRECT_URI,
      state,
      scope: ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_messaging"].join(","),
      response_type: "code",
    });
    const url = `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

// GET /api/auth/facebook/callback — Meta redirects here after user approves
router.get("/facebook/callback", async (req, res) => {
  const { code, state } = req.query;
  console.log("[FB] Callback received", { hasCode: !!code, hasState: !!state });

  if (!code || !state) {
    return res.redirect(`${process.env.DASHBOARD_URL}?facebook=error&message=missing_params`);
  }

  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
    console.log("[FB] State verified for userId:", userId);
  } catch {
    return res.redirect(`${process.env.DASHBOARD_URL}?facebook=error&message=invalid_state`);
  }

  try {
    console.log("[FB] Exchanging code for token...");
    const tokenData = await facebook.exchangeCodeForToken(code);
    const userAccessToken = tokenData.access_token;
    if (!userAccessToken) {
      return res.redirect(`${process.env.DASHBOARD_URL}?facebook=error&message=no_token`);
    }

    // Try to get a long-lived token
    let pageTokenToUse = userAccessToken;
    try {
      const longLived = await facebook.getLongLivedToken(userAccessToken);
      if (longLived.access_token) {
        console.log("[FB] Got long-lived token");
        pageTokenToUse = longLived.access_token;
      }
    } catch (e) {
      console.log("[FB] Long-lived token exchange failed:", e.message);
    }

    console.log("[FB] Token prefix:", userAccessToken.substring(0, 15) + "...");
    console.log("[FB] Fetching user pages...");
    let pagesData;
    try {
      pagesData = await facebook.getUserPages(pageTokenToUse);
    } catch (e) {
      console.error("[FB] getUserPages error:", e.message);
      return res.redirect(`${process.env.DASHBOARD_URL}?facebook=error&message=${encodeURIComponent(e.message)}`);
    }
    const pages = pagesData.data || [];
    console.log("[FB] Pages found:", pages.length, pages.map((p) => ({ id: p.id, name: p.name })));

    let page;
    if (pages.length > 0) {
      page = pages[0];
    } else {
      // /me/accounts returned empty — try direct page access using known page ID from granular scopes
      console.log("[FB] Trying direct page access token retrieval...");
      try {
        const direct = await facebook.getPageAccessToken("1114858681719203", pageTokenToUse);
        if (direct.access_token) {
          page = { id: direct.id, name: direct.name, access_token: direct.access_token };
          console.log("[FB] Got page token directly:", { id: page.id, name: page.name });
        }
      } catch (e) {
        console.error("[FB] Direct page access failed:", e.message);
      }
    }

    if (!page) {
      return res.redirect(`${process.env.DASHBOARD_URL}?facebook=error&message=no_pages`);
    }

    console.log("[FB] Connecting page:", { id: page.id, name: page.name });

    const encryptedToken = encrypt(page.access_token);

    await FacebookAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: encryptedToken,
        connectedAt: new Date(),
      },
      { upsert: true },
    );

    console.log("[FB] Success! Page connected:", page.name);
    res.redirect(`${process.env.DASHBOARD_URL}?facebook=connected`);
  } catch (err) {
    console.error("[FB] Callback error:", err.message);
    res.redirect(`${process.env.DASHBOARD_URL}?facebook=error&message=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/facebook/status — returns connection status
router.get("/facebook/status", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.json({ connected: false });
    res.json({ connected: true, pageId: account.pageId, pageName: account.pageName });
  } catch {
    res.status(500).json({ error: "Failed to check status" });
  }
});

// GET /api/auth/facebook/conversations — list page DMs
router.get("/facebook/conversations", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });

    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.getConversations(account.pageId, pageToken);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/conversations/:id/messages — get messages in a DM thread
router.get("/facebook/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });

    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.getConversationMessages(req.params.id, pageToken);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/feed — get page posts with comments
router.get("/facebook/feed", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.getPageFeed(account.pageId, pageToken);
    if (data.data && data.data.length > 0) {
      await Promise.allSettled(data.data.map(async (post) => {
        try {
          const comments = await facebook.getPostComments(post.id, pageToken);
          post.comments = comments;
        } catch {
          post.comments = { data: [] };
        }
      }));
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/test-page — simple page info test
router.get("/facebook/test-page", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const results = {};
    // Test 1: /me with page token
    try { results.me = await facebook.apiRequest(`/me?fields=id,name&access_token=${pageToken}`); }
    catch (e) { results.me = e.message; }
    // Test 2: page info
    try { results.page = await facebook.getPage(account.pageId, pageToken); }
    catch (e) { results.page = e.message; }
    // Test 3: conversations (worked before)
    try { results.conversations = await facebook.getConversations(account.pageId, pageToken); }
    catch (e) { results.conversations = e.message; }
    // Test 4: feed (the failing one)
    try { results.feed = await facebook.apiRequest(`/${account.pageId}/feed?fields=id,message,created_time&access_token=${pageToken}&limit=3`); }
    catch (e) { results.feed = e.message; }
    // Test 5: posts instead of feed
    try { results.posts = await facebook.apiRequest(`/${account.pageId}/posts?fields=id,message,created_time&access_token=${pageToken}&limit=3`); }
    catch (e) { results.posts = e.message; }
    // Test 6: published_posts
    try { results.published = await facebook.apiRequest(`/${account.pageId}/published_posts?fields=id,message,created_time&access_token=${pageToken}&limit=3`); }
    catch (e) { results.published = e.message; }
    // Test 7: feed with comments (exact getPageFeed call)
    try { results.feedWithComments = await facebook.apiRequest(`/${account.pageId}/feed?fields=id,message,created_time,comments{id,message,from,created_time}&access_token=${pageToken}&limit=3`); }
    catch (e) { results.feedWithComments = e.message; }
    // Test 8: posts with comments nested
    try { results.postsWithComments = await facebook.apiRequest(`/${account.pageId}/posts?fields=id,message,created_time,comments{id,message,from,created_time}&access_token=${pageToken}&limit=3`); }
    catch (e) { results.postsWithComments = e.message; }
    res.json({ tokenPrefix: pageToken.substring(0, 10) + "...", results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/debug-token — inspect page token scopes
router.get("/facebook/debug-token", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const info = await facebook.debugToken(pageToken);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/posts — get page posts with comments
router.get("/facebook/posts", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.getPageFeed(account.pageId, pageToken);
    // Attempt to fetch comments separately per post
    if (data.data && data.data.length > 0) {
      await Promise.allSettled(data.data.map(async (post) => {
        try {
          const comments = await facebook.getPostComments(post.id, pageToken);
          post.comments = facebook.cleanCommentIds(comments);
        } catch {
          post.comments = { data: [], error: "Could not load comments (requires Page Public Content Access feature in Meta App Dashboard)" };
        }
      }));
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/posts/:id/comments — get comments on a post
router.get("/facebook/posts/:id/comments", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.getPostComments(req.params.id, pageToken);
    res.json(facebook.cleanCommentIds(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// POST /api/auth/facebook/comments/:id/raw-reply — raw https test
router.post("/facebook/comments/:id/raw-reply", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    const pageToken = decrypt(account.pageAccessToken);
    const https = require("https");
    const url = new URL(`https://graph.facebook.com/v23.0/${req.params.id}/replies?access_token=${pageToken}`);
    const postData = new URLSearchParams({ message }).toString();
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) },
    };
        console.log("[RAW] POST", options.path.substring(0, 150));
    console.log("[RAW] body:", postData);
    console.log("[RAW] commentId:", req.params.id);
    const result = await new Promise((resolve, reject) => {
      const r = https.request(options, (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => {
          console.log("[RAW] response status:", resp.statusCode);
          console.log("[RAW] response body:", data.substring(0, 500));
          try { resolve(JSON.parse(data)); } catch { reject(new Error(data)); }
        });
      });
      r.on("error", reject);
      r.write(postData);
      r.end();
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/facebook/test/comment-on-post — test writing top-level comment
router.post("/facebook/test/comment-on-post", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const postId = "1114858681719203_122094367497368448";
    const https = require("https");
    const url = new URL(`https://graph.facebook.com/v23.0/${postId}/comments?access_token=${pageToken}`);
    const postData = new URLSearchParams({ message: "Test comment from API" }).toString();
    const result = await new Promise((resolve, reject) => {
      const r = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, (resp) => {
        let d = "";
        resp.on("data", c => d += c);
        resp.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error(d)); } });
      });
      r.on("error", reject);
      r.write(postData);
      r.end();
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/comments/:id/raw-get — test raw GET of comment
router.get("/facebook/comments/:id/raw-get", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const https = require("https");
    const results = {};
    // Test full ID
    const url1 = new URL(`https://graph.facebook.com/v23.0/${req.params.id}?access_token=${pageToken}`);
    results.fullId = await new Promise((resolve) => {
      https.get(url1.href, (r) => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{ resolve(JSON.parse(d)) }catch{ resolve(d) } }); }).on("error", e => resolve(e.message));
    });
    // Test numeric part only (after last underscore)
    const parts = req.params.id.split("_");
    const numericId = parts[parts.length - 1];
    const url2 = new URL(`https://graph.facebook.com/v23.0/${numericId}?access_token=${pageToken}`);
    results.numericId = await new Promise((resolve) => {
      https.get(url2.href, (r) => { let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{ resolve(JSON.parse(d)) }catch{ resolve(d) } }); }).on("error", e => resolve(e.message));
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/facebook/comments/:id/reply — reply to a comment
router.post("/facebook/comments/:id/reply", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    const pageToken = decrypt(account.pageAccessToken);
    // Comment IDs from API are in postId_commentId format — use only the numeric part
    const commentId = req.params.id.split("_").pop();
    const data = await facebook.replyToComment(commentId, message, pageToken);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/facebook/comments/:id — delete/hide a comment
router.delete("/facebook/comments/:id", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const commentId = req.params.id.split("_").pop();
    await facebook.deleteComment(commentId, pageToken);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/facebook/disconnect — remove connected page
router.post("/facebook/disconnect", authMiddleware, async (req, res) => {
  try {
    await FacebookAccount.findOneAndDelete({ userId: req.userId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

module.exports = router;
