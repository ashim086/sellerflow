const Bull = require("bull");
const { classifyAndReply } = require("./ai");
const Lead = require("../models/Lead");
const AIConfig = require("../models/AIConfig");
const { decrypt } = require("./encryption");

const messageQueue = new Bull("ai-messages", {
  redis: process.env.REDIS_URL || "redis://localhost:6379",
});

async function fetchMessages(job) {
  const { platform, conversationId, userId, extra } = job.data;

  if (platform === "whatsapp") {
    const WhatsAppMessage = require("../models/WhatsAppMessage");
    const msgs = await WhatsAppMessage.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
    return msgs.reverse().map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.text || "",
    }));
  }

  if (platform === "instagram") {
    const InstagramAccount = require("../models/InstagramAccount");
    const mongoose = require("mongoose");
    const account = await InstagramAccount.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!account) return [{ role: "user", content: extra?.incomingText || "" }];
    const token = decrypt(account.accessToken);
    try {
      const ig = require("./instagram");
      const data = await ig.getConversationMessages(conversationId, token);
      const msgs = (data.data || []).slice(0, 10).reverse();
      const myId = account.instagramId;
      return msgs.map((m) => ({
        role: m.from?.id === myId ? "assistant" : "user",
        content: m.message || "",
      }));
    } catch {
      return [{ role: "user", content: extra?.incomingText || "" }];
    }
  }

  if (platform === "facebook") {
    if (job.data.type === "facebook_comments") {
      const lines = [];
      if (extra?.postMessage) lines.push(`Post: ${extra.postMessage}`);
      if (extra?.commentText) lines.push(`Comment from ${extra.commentFrom || "user"}: ${extra.commentText}`);
      return [{ role: "user", content: lines.join("\n") }];
    }
    const FacebookAccount = require("../models/FacebookAccount");
    const mongoose = require("mongoose");
    const account = await FacebookAccount.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!account) return [{ role: "user", content: extra?.incomingText || "" }];
    const token = decrypt(account.pageAccessToken);
    try {
      const fb = require("./facebook");
      const data = await fb.getConversationMessages(conversationId, token);
      const msgs = (data.data || []).slice(0, 10).reverse();
      const myId = account.pageId;
      return msgs.map((m) => ({
        role: m.from?.id === myId ? "assistant" : "user",
        content: m.message || "",
      }));
    } catch {
      return [{ role: "user", content: extra?.incomingText || "" }];
    }
  }

  return [{ role: "user", content: extra?.incomingText || "" }];
}

async function sendAutoReply(job, reply) {
  const { platform, type, conversationId, userId, extra } = job.data;

  try {
    const mongoose = require("mongoose");
    const uid = new mongoose.Types.ObjectId(userId);

    if (platform === "whatsapp") {
      const WhatsAppAccount = require("../models/WhatsAppAccount");
      const account = await WhatsAppAccount.findOne({ userId: uid });
      if (!account) return;
      const token = decrypt(account.accessToken);
      const wa = require("./whatsapp");
      await wa.sendMessage(account.phoneNumberId, extra.contactPhone, reply, token);
    } else if (platform === "instagram") {
      const InstagramAccount = require("../models/InstagramAccount");
      const account = await InstagramAccount.findOne({ userId: uid });
      if (!account) return;
      const token = decrypt(account.accessToken);
      const ig = require("./instagram");
      await ig.sendDM(account.pageId, extra.senderId, reply, token);
    } else if (platform === "facebook" && type === "facebook_dms") {
      const FacebookAccount = require("../models/FacebookAccount");
      const account = await FacebookAccount.findOne({ userId: uid });
      if (!account) return;
      const token = decrypt(account.pageAccessToken);
      const fb = require("./facebook");
      await fb.replyToConversation(conversationId, reply, token);
    } else if (platform === "facebook" && type === "facebook_comments") {
      const FacebookAccount = require("../models/FacebookAccount");
      const account = await FacebookAccount.findOne({ userId: uid });
      if (!account) return;
      const token = decrypt(account.pageAccessToken);
      const fb = require("./facebook");
      await fb.replyToComment(extra.commentId, reply, token);
    }
  } catch (err) {
    console.error("[AI] Auto-reply failed:", err.message);
  }
}

function startWorker() {
  messageQueue.process(async (job) => {
    const { platform, type, conversationId, userId, username, extra } = job.data;
    console.log(`[AI] Processing ${type} for user ${userId}`);

    try {
      const mongoose = require("mongoose");
      const uid = new mongoose.Types.ObjectId(userId);

      const config = await AIConfig.findOne({ userId: uid }).lean();
      const extraPrompt = config?.businessName
        ? `Business name: ${config.businessName}. ${config.systemPromptExtra || ""}`
        : config?.systemPromptExtra || "";

      const messages = await fetchMessages(job);
      if (!messages.length) return;

      const result = await classifyAndReply(messages, extraPrompt);
      console.log(`[AI] Result for ${type}: confidence=${result.lead?.confidence}, autoReply=${result.autoReply}`);

      // Upsert lead with AI extraction
      const leadKey = conversationId || `${platform}_${username}_${userId}`;
      await Lead.findOneAndUpdate(
        { userId: uid, externalConversationId: leadKey },
        {
          $set: {
            platform,
            username: username || extra?.contactPhone || extra?.senderId || "unknown",
            externalConversationId: leadKey,
            lastMessage: messages[messages.length - 1]?.content || "",
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

      // Check auto-reply toggle and send if enabled
      const autoReplyEnabled = config?.autoReply?.[type] ?? false;
      if (result.autoReply && result.reply && autoReplyEnabled) {
        await sendAutoReply(job, result.reply);
        await Lead.findOneAndUpdate(
          { userId: uid, externalConversationId: leadKey },
          { $set: { "aiExtracted.autoReplied": true } }
        );
        console.log(`[AI] Auto-replied for ${type}`);
      }
    } catch (err) {
      console.error(`[AI] Pipeline error for ${type}:`, err.message);
    }
  });

  messageQueue.on("failed", (job, err) => {
    console.error(`[AI] Job failed (${job.data.type}):`, err.message);
  });

  console.log("[AI] Worker started, listening on queue");
}

module.exports = { messageQueue, startWorker };
