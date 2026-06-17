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
      // Debug: try /me directly
      try {
        console.log("[IG] Debug: trying /me...");
        const meResult = await instagram.getPageDirect("me", accessToken);
        console.log("[IG] /me result:", JSON.stringify(meResult));
      } catch (err) {
        console.log("[IG] /me failed:", err.message);
      }

      // Try the page ID from granular scopes directly
      const pageIdFromScope = "108542548939458";
      console.log("[IG] Trying direct page access for ID:", pageIdFromScope);
      try {
        const pageData = await instagram.getPageDirect(pageIdFromScope, accessToken);
        console.log("[IG] Direct page response:", JSON.stringify(pageData));

        if (pageData.id) {
          pages = [pageData];
          console.log("[IG] Direct page access worked! Found page:", pageData.name);
        }
      } catch (err) {
        console.log("[IG] Direct page access failed:", err.message);
      }
    }

    if (pages.length === 0) {
      console.log("[IG] No pages found at all");
      return res.redirect(`${process.env.DASHBOARD_URL}?instagram=error&message=no_pages`);
    }

    const page = pages[0];
    const pageId = page.id;
    const pageName = page.name;
    console.log("[IG] Using page:", { pageId, pageName });

    // Check if page already has instagram_business_account
    let ig = page.instagram_business_account;

    if (!ig) {
      console.log("[IG] Checking Instagram business account separately...");
      try {
        const igAccount = await instagram.getInstagramBusinessAccount(pageId, accessToken);
        console.log("[IG] IG account response:", JSON.stringify(igAccount));
        ig = igAccount.instagram_business_account;
      } catch (err) {
        console.log("[IG] Failed to get IG account:", err.message);
      }
    }

    if (!ig) {
      console.log("[IG] No Instagram business account found, saving page-only connection");
    }

    console.log("[IG] Saving Instagram account...");
    const encryptedToken = encrypt(accessToken);

    await InstagramAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        accessToken: encryptedToken,
        pageId,
        instagramId: ig?.id || null,
        instagramUsername: ig?.username || null,
        profilePictureUrl: ig?.profile_picture_url || null,
        connectedAt: new Date(),
      },
      { upsert: true },
    );

    console.log("[IG] Success! Connected page:", pageName, ig ? `| IG: ${ig.username}` : "(no IG account)");
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
      instagramId: account.instagramId,
      instagramUsername: account.instagramUsername,
      profilePictureUrl: account.profilePictureUrl,
    });
  } catch {
    res.status(500).json({ error: "Failed to check status" });
  }
});

module.exports = router;
