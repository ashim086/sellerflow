const express = require("express");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");
const WhatsAppAccount = require("../models/WhatsAppAccount");
const { encrypt, decrypt } = require("../services/encryption");
const wa = require("../services/whatsapp");

const router = express.Router();

function signState(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

// GET /api/auth/whatsapp/url — OAuth URL for WhatsApp
router.get("/whatsapp/url", authMiddleware, (req, res) => {
  try {
    const state = signState(req.userId);
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: process.env.WA_REDIRECT_URI,
      state,
      scope: ["whatsapp_business_messaging", "whatsapp_business_management"].join(","),
      response_type: "code",
    });
    const url = `https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`;
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
});

// GET /api/auth/whatsapp/callback — OAuth callback
router.get("/whatsapp/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.redirect(`${process.env.DASHBOARD_URL}?whatsapp=error&message=missing_params`);
  }

  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    userId = decoded.userId;
  } catch {
    return res.redirect(`${process.env.DASHBOARD_URL}?whatsapp=error&message=invalid_state`);
  }

  try {
    const tokenData = await wa.exchangeCodeForToken(code);
    const userToken = tokenData.access_token;
    if (!userToken) {
      return res.redirect(`${process.env.DASHBOARD_URL}?whatsapp=error&message=no_token`);
    }

    // Get long-lived token
    let tokenToUse = userToken;
    try {
      const longLived = await wa.getLongLivedToken(userToken);
      if (longLived.access_token) tokenToUse = longLived.access_token;
    } catch { /* use short-lived */ }

    // Discover WABA — /me/businesses → owned WABAs → phone numbers
    let wabaId = null;
    let phoneNumberId = null;
    let displayPhoneNumber = null;
    let businessName = null;

    try {
      const businesses = await wa.getBusinesses(tokenToUse);
      const biz = businesses.data?.[0];
      if (biz) {
        businessName = biz.name;
        const wabas = await wa.getOwnedWABAs(biz.id, tokenToUse);
        const waba = wabas.data?.[0];
        if (waba) {
          wabaId = waba.id;
          const phones = await wa.getPhoneNumbers(wabaId, tokenToUse);
          const phone = phones.data?.[0];
          if (phone) {
            phoneNumberId = phone.id;
            displayPhoneNumber = phone.display_phone_number;
          }
        }
      }
    } catch (e) {
      console.log("[WA] Discovery failed:", e.message);
    }

    // Subscribe to webhooks
    if (wabaId) {
      try { await wa.subscribeToWebhooks(wabaId, tokenToUse); } catch { /* maybe already subscribed */ }
    }

    const encryptedToken = encrypt(tokenToUse);
    await WhatsAppAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        accessToken: encryptedToken,
        wabaId,
        phoneNumberId,
        displayPhoneNumber,
        businessName,
        connectedAt: new Date(),
      },
      { upsert: true }
    );

    res.redirect(`${process.env.DASHBOARD_URL}?whatsapp=connected`);
  } catch (err) {
    console.error("[WA] Callback error:", err.message);
    res.redirect(`${process.env.DASHBOARD_URL}?whatsapp=error&message=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/whatsapp/status — connection status
router.get("/whatsapp/status", authMiddleware, async (req, res) => {
  try {
    const account = await WhatsAppAccount.findOne({ userId: req.userId });
    if (!account) return res.json({ connected: false });
    res.json({
      connected: true,
      wabaId: account.wabaId,
      phoneNumberId: account.phoneNumberId,
      displayPhoneNumber: account.displayPhoneNumber,
      businessName: account.businessName,
    });
  } catch {
    res.status(500).json({ error: "Failed to check status" });
  }
});

// POST /api/auth/whatsapp/disconnect
router.post("/whatsapp/disconnect", authMiddleware, async (req, res) => {
  try {
    await WhatsAppAccount.findOneAndDelete({ userId: req.userId });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

// GET /api/auth/whatsapp/conversations — list from DB (not Meta API)
router.get("/whatsapp/conversations", authMiddleware, async (req, res) => {
  try {
    const account = await WhatsAppAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No WhatsApp account connected" });
    const WhatsAppConversation = require("../models/WhatsAppConversation");
    const convs = await WhatsAppConversation.find({ userId: req.userId })
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .lean();
    res.json({ data: convs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/whatsapp/conversations/:id/messages
router.get("/whatsapp/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const account = await WhatsAppAccount.findOne({ userId: req.userId });
    if (!account) return res.status(400).json({ error: "No WhatsApp account connected" });
    const WhatsAppMessage = require("../models/WhatsAppMessage");
    const msgs = await WhatsAppMessage.find({ conversationId: req.params.id })
      .sort({ timestamp: 1 })
      .limit(100)
      .lean();
    res.json({ data: msgs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/whatsapp/conversations/:id/reply — send message
router.post("/whatsapp/conversations/:id/reply", authMiddleware, async (req, res) => {
  try {
    const account = await WhatsAppAccount.findOne({ userId: req.userId });
    if (!account || !account.phoneNumberId) return res.status(400).json({ error: "No WhatsApp account connected" });
    const { message, to } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    if (!to) return res.status(400).json({ error: "Recipient phone (to) required" });
    const token = decrypt(account.accessToken);
    const result = await wa.sendMessage(account.phoneNumberId, to, message, token);

    // Save outbound message to DB
    const WhatsAppMessage = require("../models/WhatsAppMessage");
    const WhatsAppConversation = require("../models/WhatsAppConversation");
    await WhatsAppMessage.create({
      conversationId: req.params.id,
      waMessageId: result.messages?.[0]?.id || null,
      direction: "outbound",
      text: message,
      timestamp: Date.now(),
    });
    await WhatsAppConversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { lastMessage: message, lastMessageAt: new Date() }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/whatsapp/webhook — verification
router.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WA_WEBHOOK_VERIFY_TOKEN) {
    console.log("[WA] Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /api/auth/whatsapp/webhook — incoming messages
router.post("/whatsapp/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return res.sendStatus(200);

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (!change.value) continue;
        const messages = change.value.messages || [];
        const contacts = change.value.contacts || [];

        if (messages.length === 0) continue;

        const contact = contacts[0];
        const phoneNumberId = change.value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Find the WhatsAppAccount by phoneNumberId
        const account = await WhatsAppAccount.findOne({ phoneNumberId });
        if (!account) continue;

        for (const msg of messages) {
          const from = msg.from; // sender phone number
          const waMsgId = msg.id;
          const text = msg.text?.body || "";

          // Find or create conversation
          const WhatsAppConversation = require("../models/WhatsAppConversation");
          let conv = await WhatsAppConversation.findOne({
            userId: account.userId,
            contactPhone: from,
          });
          if (!conv) {
            conv = await WhatsAppConversation.create({
              userId: account.userId,
              phoneNumberId,
              contactPhone: from,
              contactName: contact?.profile?.name || from,
              lastMessage: text,
              lastMessageAt: new Date(),
            });
          } else {
            conv.lastMessage = text;
            conv.lastMessageAt = new Date();
            await conv.save();
          }

          // Save message
          const WhatsAppMessage = require("../models/WhatsAppMessage");
          const exists = await WhatsAppMessage.findOne({ waMessageId: waMsgId });
          if (!exists) {
            await WhatsAppMessage.create({
              conversationId: conv._id.toString(),
              waMessageId: waMsgId,
              direction: "inbound",
              text,
              timestamp: Date.now(),
            });

            // Trigger AI pipeline
            const { messageQueue } = require("../services/aiPipeline");
            messageQueue.add({
              platform: "whatsapp",
              type: "whatsapp",
              conversationId: conv._id.toString(),
              userId: account.userId.toString(),
              username: conv.contactName || from,
              extra: { contactPhone: from, incomingText: text },
            }).catch((e) => console.error("[WA] Queue error:", e.message));
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("[WA] Webhook error:", err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
