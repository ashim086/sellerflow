const express = require("express");
const authMiddleware = require("../middleware/auth");
const AIConfig = require("../models/AIConfig");
const Lead = require("../models/Lead");
const { classifyAndReply } = require("../services/ai");

const router = express.Router();

// GET /api/ai/config
router.get("/config", authMiddleware, async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const uid = new mongoose.Types.ObjectId(req.userId);
    const config = await AIConfig.findOne({ userId: uid }).lean();
    if (!config) {
      return res.json({
        businessName: "",
        autoReply: {
          instagram_dms: false,
          instagram_comments: false,
          facebook_dms: false,
          facebook_comments: false,
          whatsapp: false,
        },
        systemPromptExtra: "",
      });
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/config
router.post("/config", authMiddleware, async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const uid = new mongoose.Types.ObjectId(req.userId);
    const { businessName, autoReply, systemPromptExtra } = req.body;

    const update = {};
    if (businessName !== undefined) update.businessName = businessName;
    if (systemPromptExtra !== undefined) update.systemPromptExtra = systemPromptExtra;
    if (autoReply && typeof autoReply === "object") {
      const types = ["instagram_dms", "instagram_comments", "facebook_dms", "facebook_comments", "whatsapp"];
      for (const t of types) {
        if (autoReply[t] !== undefined) update[`autoReply.${t}`] = Boolean(autoReply[t]);
      }
    }

    const config = await AIConfig.findOneAndUpdate(
      { userId: uid },
      { $set: update },
      { upsert: true, new: true }
    );
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/process — extension endpoint: raw conversation → extracted lead
router.post("/process", authMiddleware, async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const uid = new mongoose.Types.ObjectId(req.userId);
    const { platform, username, messages, profileUrl } = req.body;

    if (!platform || !username || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "platform, username, and messages are required" });
    }

    const config = await AIConfig.findOne({ userId: uid }).lean();
    const extraPrompt = config?.businessName
      ? `Business name: ${config.businessName}. ${config.systemPromptExtra || ""}`
      : config?.systemPromptExtra || "";

    const result = await classifyAndReply(messages, extraPrompt);

    const leadKey = `${platform}_${username}_${uid}`;
    const lead = await Lead.findOneAndUpdate(
      { userId: uid, externalConversationId: leadKey },
      {
        $set: {
          platform,
          username,
          externalConversationId: leadKey,
          lastMessage: messages[messages.length - 1]?.content || "",
          ...(profileUrl ? { profileUrl } : {}),
          "aiExtracted.customerName": result.lead?.customerName || null,
          "aiExtracted.products": result.lead?.products || [],
          "aiExtracted.deliveryAddress": result.lead?.deliveryAddress || null,
          "aiExtracted.preferredTime": result.lead?.preferredTime || null,
          "aiExtracted.notes": result.lead?.notes || null,
          "aiExtracted.confidence": result.lead?.confidence || 0,
          "aiExtracted.processedAt": new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json({ lead, aiResult: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
