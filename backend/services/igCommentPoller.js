const InstagramAccount = require("../models/InstagramAccount");
const { decrypt } = require("./encryption");
const { messageQueue } = require("./aiPipeline");
const instagram = require("./instagram");
const mongoose = require("mongoose");

const processedSchema = new mongoose.Schema({
  commentId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 604800 },
});
const ProcessedIgComment = mongoose.model("ProcessedIgComment", processedSchema);

async function pollInstagramComments() {
  try {
    const accounts = await InstagramAccount.find({}).lean();

    for (const account of accounts) {
      try {
        const token = decrypt(account.accessToken);
        const mediaData = await instagram.getMedia(account.instagramId, token);
        const posts = mediaData.data || [];

        for (const post of posts) {
          try {
            const commentsData = await instagram.getMediaComments(post.id, token);
            const comments = commentsData.data || [];

            for (const comment of comments) {
              const alreadyProcessed = await ProcessedIgComment.findOne({ commentId: comment.id });
              if (alreadyProcessed) continue;

              await ProcessedIgComment.create({ commentId: comment.id });

              messageQueue.add({
                platform: "instagram",
                type: "instagram_comments",
                conversationId: `comment_${post.id}`,
                userId: account.userId.toString(),
                username: comment.username || "user",
                extra: {
                  commentId: comment.id,
                  commentText: comment.text || "",
                  commentFrom: comment.username || "user",
                  mediaId: post.id,
                  incomingText: comment.text || "",
                },
              }).catch((e) => console.error("[IG Poll] Queue error:", e.message));

              console.log(`[IG Poll] New comment queued from @${comment.username}: ${comment.text}`);
            }
          } catch {
            // skip posts with errors
          }
        }
      } catch (e) {
        console.error(`[IG Poll] Account ${account.instagramId} error:`, e.message);
      }
    }
  } catch (e) {
    console.error("[IG Poll] Poll error:", e.message);
  }
}

function startIgCommentPoller(intervalMs = 120000) {
  console.log("[IG Poll] Started — polling every 2 minutes");
  pollInstagramComments();
  setInterval(pollInstagramComments, intervalMs);
}

module.exports = { startIgCommentPoller };
