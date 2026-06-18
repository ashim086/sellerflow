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

    // Subscribe page to webhook events
    try {
      const subResult = await facebook.subscribePageToWebhooks(page.id, page.access_token);
      console.log("[FB] Page subscribed to webhooks:", JSON.stringify(subResult));
    } catch (err) {
      console.log("[FB] Page webhook subscription warning (non-fatal):", err.message);
    }

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

// POST /api/auth/facebook/conversations/:id/reply — send a message in a DM thread
router.post("/facebook/conversations/:id/reply", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const { message, recipientId } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    if (!recipientId) return res.status(400).json({ error: "recipientId required" });
    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.sendMessageToUser(account.pageId, recipientId, message, pageToken);
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

// GET /api/auth/facebook/debug-page — check page IG connection
router.get("/facebook/debug-page", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const data = await facebook.getPage(account.pageId, pageToken);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/facebook/debug-ig — comprehensive IG Business Account diagnostic
router.get("/facebook/debug-ig", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const results = {};

    // 1. Token debug info
    try {
      results.tokenInfo = await facebook.debugToken(pageToken);
    } catch (e) { results.tokenInfo = { error: e.message }; }

    // 2. Page with all IG-related fields
    try {
      results.pageWithAllFields = await facebook.getPageWithAllFields(account.pageId, pageToken);
    } catch (e) { results.pageWithAllFields = { error: e.message }; }

    // 3. Page with the original getPage call
    try {
      results.pageOriginal = await facebook.getPage(account.pageId, pageToken);
    } catch (e) { results.pageOriginal = { error: e.message }; }

    // 4. /me/accounts with IG fields
    try {
      results.me = await facebook.getMe(pageToken);
    } catch (e) { results.me = { error: e.message }; }

    // 5. /{pageId}/instagram_accounts edge
    try {
      results.instagramAccountsEdge = await facebook.getPageInstagramAccounts(account.pageId, pageToken);
    } catch (e) { results.instagramAccountsEdge = { error: e.message }; }

    // 6. Check if IG Graph API product is configured by hitting the /{instagram-app-id} endpoint
    try {
      const igAppId = "1185667677023983";
      const igCheck = await facebook.apiRequest(
        `/${igAppId}?access_token=${pageToken}`
      );
      results.igSubAppCheck = igCheck;
    } catch (e) { results.igSubAppCheck = { error: e.message }; }

    // 7. Try direct Instagram Graph API with sub-app credentials
    const BASE_IG = "https://graph.facebook.com/v23.0";
    try {
      const igUserId = "122219366090564013";
      const igUrl = `${BASE_IG}/${igUserId}?fields=id,username,account_type,professional_country_code&access_token=${pageToken}`;
      const parsed = new URL(igUrl);
      const data = await new Promise((resolve, reject) => {
        const https = require("https");
        const req = https.get({
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
        }, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try { resolve(JSON.parse(body)); } catch { resolve({ parseError: body }); }
          });
        });
        req.on("error", reject);
      });
      results.igUserIdLookup = data;
    } catch (e) { results.igUserIdLookup = { error: e.message }; }

    res.json(results);
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

// GET /api/auth/facebook/webhook — Meta webhook verification
router.get("/facebook/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.FB_WEBHOOK_VERIFY_TOKEN) {
    console.log("[FB] Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/auth/facebook/webhook — incoming page DMs and comments
router.post("/facebook/webhook", async (req, res) => {
  res.sendStatus(200); // always ack immediately
  try {
    const body = req.body;
    if (body.object !== "page") return;

    const { messageQueue } = require("../services/aiPipeline");

    for (const entry of body.entry || []) {
      const pageId = entry.id;
      const account = await FacebookAccount.findOne({ pageId });
      if (!account) continue;

      // Page DMs
      for (const msg of entry.messaging || []) {
        if (!msg.message) continue;
        const senderId = msg.sender?.id;
        const conversationId = msg.message?.mid || senderId;

        messageQueue.add({
          platform: "facebook",
          type: "facebook_dms",
          conversationId: senderId,
          userId: account.userId.toString(),
          username: senderId,
          extra: { senderId, incomingText: msg.message.text || "" },
        }).catch((e) => console.error("[FB] Queue error:", e.message));
      }

      // Page feed changes (comments)
      for (const change of entry.changes || []) {
        if (change.field !== "feed") continue;
        const val = change.value;
        if (!val || val.item !== "comment" || val.verb !== "add") continue;

        messageQueue.add({
          platform: "facebook",
          type: "facebook_comments",
          conversationId: `comment_${val.post_id}`,
          userId: account.userId.toString(),
          username: val.from?.name || val.from?.id || "user",
          extra: {
            commentId: val.comment_id,
            commentText: val.message || "",
            commentFrom: val.from?.name || val.from?.id || "user",
            postId: val.post_id,
            postMessage: val.post?.message || "",
            incomingText: val.message || "",
          },
        }).catch((e) => console.error("[FB] Queue error:", e.message));
      }
    }
  } catch (err) {
    console.error("[FB] Webhook processing error:", err.message);
  }
});

// POST /api/auth/facebook/subscribe-webhooks — re-subscribe page to webhook events
router.post("/facebook/subscribe-webhooks", authMiddleware, async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Facebook page connected" });
    const pageToken = decrypt(account.pageAccessToken);
    const result = await facebook.subscribePageToWebhooks(account.pageId, pageToken);
    res.json(result);
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
