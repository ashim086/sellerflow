const FacebookAccount = require("../models/FacebookAccount");
const { decrypt } = require("./encryption");
const { messageQueue } = require("./aiPipeline");
const facebook = require("./facebook");
const mongoose = require("mongoose");

const processedSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 604800 },
});
const ProcessedFbDm = mongoose.model("ProcessedFbDm", processedSchema);

async function pollFacebookDms() {
  try {
    const accounts = await FacebookAccount.find({}).lean();

    for (const account of accounts) {
      try {
        const token = decrypt(account.pageAccessToken);
        const convsData = await facebook.getConversations(account.pageId, token);
        const conversations = convsData.data || [];

        for (const conv of conversations) {
          try {
            // Build name map from conversation senders
            const senderMap = {};
            for (const s of conv.senders?.data || []) {
              if (s.id && s.name) senderMap[s.id] = s.name;
            }

            const msgsData = await facebook.getConversationMessages(conv.id, token);
            const messages = msgsData.data || [];

            for (const msg of messages) {
              // Skip messages sent by the page itself
              if (msg.from?.id === account.pageId) continue;

              const alreadyProcessed = await ProcessedFbDm.findOne({ messageId: msg.id });
              if (alreadyProcessed) continue;

              await ProcessedFbDm.create({ messageId: msg.id });

              const senderName = senderMap[msg.from?.id] || msg.from?.name || msg.from?.id || "user";

              messageQueue.add({
                platform: "facebook",
                type: "facebook_dms",
                conversationId: conv.id,
                userId: account.userId.toString(),
                username: senderName,
                extra: {
                  senderId: msg.from?.id,
                  incomingText: msg.message || "",
                },
              }).catch((e) => console.error("[FB DM Poll] Queue error:", e.message));

              console.log(`[FB DM Poll] New DM queued from ${senderName}: ${msg.message}`);
            }
          } catch {
            // skip conversations with errors
          }
        }
      } catch (e) {
        console.error(`[FB DM Poll] Account ${account.pageId} error:`, e.message);
      }
    }
  } catch (e) {
    console.error("[FB DM Poll] Poll error:", e.message);
  }
}

function startFbDmPoller(intervalMs = 120000) {
  console.log("[FB DM Poll] Started — polling every 2 minutes");
  pollFacebookDms();
  setInterval(pollFacebookDms, intervalMs);
}

module.exports = { startFbDmPoller };
