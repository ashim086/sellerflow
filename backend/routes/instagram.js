const express = require("express");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");
const InstagramAccount = require("../models/InstagramAccount");
const { encrypt, decrypt } = require("../services/encryption");
const instagram = require("../services/instagram");

const router = express.Router();

function signState(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

// GET /api/auth/instagram/url — returns the Meta OAuth URL
router.get("/instagram/url", authMiddleware, (req, res) => {
  try {
    const state = signState(req.userId);
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: process.env.REDIRECT_URI,
      state,
      scope: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_metadata",
        "pages_messaging",
        "instagram_manage_messages",
        "instagram_manage_comments",
      ].join(","),
      response_type: "code",
    });
    const url = `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

// GET /api/auth/instagram/callback — Meta redirects here after user approves
router.get("/instagram/callback", async (req, res) => {
  const { code, state } = req.query;
  console.log("[IG] Callback received", { hasCode: !!code, hasState: !!state });

  if (!code || !state) {
    console.log("[IG] Missing code or state");
    return res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=missing_params`);
  }

  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
    console.log("[IG] State verified for userId:", userId);
  } catch (err) {
    console.log("[IG] Invalid state:", err.message);
    return res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=invalid_state`);
  }

  try {
    console.log("[IG] Exchanging code for token...");
    const tokenData = await instagram.exchangeCodeForToken(code);
    console.log("[IG] Token response:", JSON.stringify(tokenData));

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=no_token`);
    }

    // Debug: inspect the token
    try {
      const tokenInfo = await instagram.debugToken(accessToken);
      console.log("[IG] TOKEN DEBUG:", JSON.stringify(tokenInfo, null, 2));
    } catch (err) {
      console.log("[IG] Token debug failed:", err.message);
    }

    // Try /me/accounts first
    console.log("[IG] Fetching user pages via /me/accounts...");
    const pagesData = await instagram.getUserPages(accessToken);
    console.log("[IG] Pages response:", JSON.stringify(pagesData));
    let pages = pagesData.data || [];
    console.log("[IG] Pages count:", pages.length);

    // If /me/accounts returns empty but token has granular scopes, try direct page access
    if (pages.length === 0) {
      // Get page ID from token's granular scopes
      let pageIdFromScope = null;
      try {
        const debugInfo = await instagram.debugToken(accessToken);
        console.log("[IG] Token debug:", JSON.stringify(debugInfo));
        if (debugInfo.data?.granular_scopes) {
          const ps = debugInfo.data.granular_scopes.find(s => s.scope === "pages_show_list");
          if (ps?.target_ids?.[0]) pageIdFromScope = ps.target_ids[0];
        }
      } catch (e) {
        console.log("[IG] Token debug failed:", e.message);
      }

      if (pageIdFromScope) {
        console.log("[IG] Trying direct page access for ID:", pageIdFromScope);
        try {
          const pageData = await instagram.getPageDirect(pageIdFromScope, accessToken);
          console.log("[IG] Direct page response:", JSON.stringify(pageData));
          if (pageData.id) {
            pages = [pageData];
            console.log("[IG] Direct page access worked! Found page:", pageData.name, "| has page token:", !!pageData.access_token, "| has IG:", !!pageData.instagram_business_account);
          }
        } catch (err) {
          console.log("[IG] Direct page access failed:", err.message);
        }
      } else {
        console.log("[IG] No page ID found in granular scopes");
      }
    }

    if (pages.length === 0) {
      console.log("[IG] No pages found at all");
      return res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=no_pages`);
    }

    const page = pages[0];
    const pageId = page.id;
    const pageName = page.name;
    const pageToken = page.access_token || accessToken;
    console.log("[IG] Using page:", { pageId, pageName });

    // instagram_business_account may already be in the /me/accounts response
    let ig = page.instagram_business_account || page.connected_instagram_account;

    if (!ig) {
      console.log("[IG] Checking Instagram business account via page token...");
      try {
        const igAccount = await instagram.getInstagramBusinessAccount(pageId, pageToken);
        console.log("[IG] IG account response:", JSON.stringify(igAccount));
        ig = igAccount.instagram_business_account
          || igAccount.connected_instagram_account
          || igAccount.instagram_accounts?.data?.[0];
        console.log("[IG] IG resolved:", JSON.stringify(ig));
      } catch (err) {
        console.log("[IG] Failed to get IG account:", err.message);
      }
    }

    // If still no IG and we only have user token, try fetching a fresh page token explicitly
    if (!ig && pageToken === accessToken) {
      console.log("[IG] Attempting to fetch page access token explicitly...");
      try {
        const pageInfo = await instagram.getPageDirect(pageId, accessToken);
        console.log("[IG] Page info with token:", JSON.stringify(pageInfo));
        const freshPageToken = pageInfo.access_token;
        ig = pageInfo.instagram_business_account
          || pageInfo.connected_instagram_account
          || pageInfo.instagram_accounts?.data?.[0];
        if (!ig && freshPageToken) {
          const igAccount = await instagram.getInstagramBusinessAccount(pageId, freshPageToken);
          console.log("[IG] IG account with fresh page token:", JSON.stringify(igAccount));
          ig = igAccount.instagram_business_account
            || igAccount.connected_instagram_account
            || igAccount.instagram_accounts?.data?.[0];
        }
      } catch (err) {
        console.log("[IG] Fresh page token attempt failed:", err.message);
      }
    }

    if (!ig || !ig.id) {
      console.log("[IG] No Instagram business account linked to this page");
      return res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=no_instagram_business`);
    }

    console.log("[IG] Instagram account found:", ig.username, ig.id);
    console.log("[IG] Saving Instagram account...");
    const encryptedToken = encrypt(pageToken);

    await InstagramAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        accessToken: encryptedToken,
        pageId,
        instagramId: ig.id,
        instagramUsername: ig.username || null,
        profilePictureUrl: ig.profile_picture_url || null,
        connectedAt: new Date(),
      },
      { upsert: true },
    );

    // Subscribe app to this IG account for messaging
    try {
      const subResult = await instagram.subscribeAppToIgAccount(ig.id, pageToken);
      console.log("[IG] App subscribed to IG messaging:", JSON.stringify(subResult));
    } catch (err) {
      console.log("[IG] Subscription warning (non-fatal):", err.message);
    }

    console.log("[IG] Success! Instagram connected:", ig.username);
    res.redirect(`${process.env.DASHBOARD_URL}?instagram=connected`);
  } catch (err) {
    console.error("[IG] Callback error:", err.message);
    console.error("[IG] Stack:", err.stack);
    res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/instagram/status — returns connection status for current user
router.get("/instagram/status", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account) return res.json({ connected: false });

    res.json({
      connected: true,
      pageId: account.pageId,
      instagramId: account.instagramId,
      instagramUsername: account.instagramUsername,
      profilePictureUrl: account.profilePictureUrl,
    });
  } catch {
    res.status(500).json({ error: "Failed to check status" });
  }
});

// GET /api/auth/instagram/conversations — list Instagram DMs
router.get("/instagram/conversations", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const token = decrypt(account.accessToken);
    const data = await instagram.getConversations(account.instagramId, token);
    res.json(data);
  } catch (err) {
    console.error("[IG] Conversations error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/instagram/conversations/:id/messages — get messages in a thread
router.get("/instagram/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const token = decrypt(account.accessToken);
    const data = await instagram.getConversationMessages(req.params.id, token);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/instagram/conversations/:id/reply — send a message via DM API
router.post("/instagram/conversations/:id/reply", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const { message, recipientId } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    if (!recipientId) return res.status(400).json({ error: "recipientId required" });
    const token = decrypt(account.accessToken);
    console.log("[IG] Sending DM — pageId:", account.pageId, "recipientId:", recipientId, "instagramId:", account.instagramId);
    const data = await instagram.sendDM(account.pageId, recipientId, message, token);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/instagram/update-ig — manually set IG business account ID
router.post("/instagram/update-ig", authMiddleware, async (req, res) => {
  try {
    const { instagramId, instagramUsername } = req.body;
    if (!instagramId) return res.status(400).json({ error: "instagramId required" });

    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No Instagram account connected. Use +IG first." });

    account.instagramId = instagramId;
    account.instagramUsername = instagramUsername || null;
    await account.save();

    res.json({ success: true, instagramId, instagramUsername });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/instagram/debug-ig — check current IG connection
router.get("/instagram/debug-ig", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram account connected" });
    const token = require("../services/encryption").decrypt(account.accessToken);
    const ig = require("../services/instagram");
    const igUserId = account.instagramId;
    const results = {};

    // Try IG user info
    try {
      results.igUserInfo = await ig.apiRequest(
        `/${igUserId}?fields=id,username,account_type&access_token=${token}`
      );
    } catch (e) { results.igUserInfo = { error: e.message }; }

    // Try conversations
    try {
      results.conversations = await ig.apiRequest(
        `/${igUserId}/conversations?fields=id,updated_time&access_token=${token}&limit=5`
      );
    } catch (e) { results.conversations = { error: e.message }; }

    // Debug token
    try {
      results.tokenDebug = await ig.debugToken(token);
    } catch (e) { results.tokenDebug = { error: e.message }; }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/instagram/posts — list IG media posts
router.get("/instagram/posts", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const token = decrypt(account.accessToken);
    const data = await instagram.getMedia(account.instagramId, token);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/instagram/posts/:id/comments — get comments on a post
router.get("/instagram/posts/:id/comments", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const token = decrypt(account.accessToken);
    const data = await instagram.getMediaComments(req.params.id, token);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/instagram/comments/:id/reply — reply to a comment
router.post("/instagram/comments/:id/reply", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    const token = decrypt(account.accessToken);
    const data = await instagram.replyToComment(req.params.id, message, token);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/instagram/comments/:id — delete a comment
router.delete("/instagram/comments/:id", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram business account connected" });
    const token = decrypt(account.accessToken);
    await instagram.deleteComment(req.params.id, token);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/instagram/webhook — Meta webhook verification
router.get("/instagram/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.IG_WEBHOOK_VERIFY_TOKEN) {
    console.log("[IG] Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/auth/instagram/webhook — incoming IG DMs and comments
router.post("/instagram/webhook", async (req, res) => {
  res.sendStatus(200); // always ack immediately
  try {
    const body = req.body;
    if (body.object !== "instagram") return;

    const { messageQueue } = require("../services/aiPipeline");
    const mongoose = require("mongoose");

    for (const entry of body.entry || []) {
      // DMs
      for (const msg of entry.messaging || []) {
        if (!msg.message) continue;
        const senderId = msg.sender?.id;
        const recipientId = msg.recipient?.id; // this is our IG user ID
        if (!senderId || !recipientId) continue;

        const account = await InstagramAccount.findOne({ instagramId: recipientId });
        if (!account) continue;

        messageQueue.add({
          platform: "instagram",
          type: "instagram_dms",
          conversationId: senderId, // use senderId as conversation key for IG DMs
          userId: account.userId.toString(),
          username: senderId,
          extra: { senderId, incomingText: msg.message.text || "" },
        }).catch((e) => console.error("[IG] Queue error:", e.message));
      }

      // Comments
      for (const change of entry.changes || []) {
        if (change.field !== "comments") continue;
        const val = change.value;
        if (!val) continue;
        const mediaId = val.media?.id;
        const commentId = val.id;
        const commentText = val.text || "";
        const commentFrom = val.from?.username || val.from?.id || "user";

        // entry.id is the IG business account ID that owns the post
        const account = await InstagramAccount.findOne({ instagramId: entry.id });
        if (!account) continue;

        messageQueue.add({
          platform: "instagram",
          type: "instagram_comments",
          conversationId: `comment_${mediaId}`,
          userId: account.userId.toString(),
          username: commentFrom,
          extra: {
            commentId,
            commentText,
            commentFrom,
            mediaId,
            incomingText: commentText,
          },
        }).catch((e) => console.error("[IG] Queue error:", e.message));
      }
    }
  } catch (err) {
    console.error("[IG] Webhook processing error:", err.message);
  }
});

// POST /api/auth/instagram/resubscribe — re-subscribe app to IG webhook events
router.post("/instagram/resubscribe", authMiddleware, async (req, res) => {
  try {
    const account = await InstagramAccount.findOne({ userId: req.userId });
    if (!account || !account.instagramId) return res.status(400).json({ error: "No Instagram account connected" });
    const token = decrypt(account.accessToken);
    const result = await instagram.subscribeAppToIgAccount(account.instagramId, token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/instagram/disconnect — remove connected Instagram account
router.post("/instagram/disconnect", authMiddleware, async (req, res) => {
  try {
    await InstagramAccount.findOneAndDelete({ userId: req.userId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

module.exports = router;
