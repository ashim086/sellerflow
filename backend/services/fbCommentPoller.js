const FacebookAccount = require("../models/FacebookAccount");
const ProcessedFbComment = require("../models/ProcessedFbComment");
const { decrypt } = require("./encryption");
const { messageQueue } = require("./aiPipeline");
const facebook = require("./facebook");

async function pollFacebookComments() {
  try {
    const accounts = await FacebookAccount.find({}).lean();

    for (const account of accounts) {
      try {
        const token = decrypt(account.pageAccessToken);
        const postsData = await facebook.getPageFeed(account.pageId, token);
        const posts = postsData.data || [];

        for (const post of posts) {
          try {
            const commentsData = await facebook.getPostComments(post.id, token);
            const comments = commentsData.data || [];

            for (const comment of comments) {
              const alreadyProcessed = await ProcessedFbComment.findOne({ commentId: comment.id });
              if (alreadyProcessed) continue;

              await ProcessedFbComment.create({ commentId: comment.id });

              messageQueue.add({
                platform: "facebook",
                type: "facebook_comments",
                conversationId: `comment_${post.id}`,
                userId: account.userId.toString(),
                username: comment.from?.name || comment.from?.id || "user",
                extra: {
                  commentId: comment.id,
                  commentText: comment.message || "",
                  commentFrom: comment.from?.name || comment.from?.id || "user",
                  postId: post.id,
                  postMessage: post.message || "",
                  incomingText: comment.message || "",
                },
              }).catch((e) => console.error("[FB Poll] Queue error:", e.message));

              console.log(`[FB Poll] New comment queued from ${comment.from?.name || "user"}: ${comment.message}`);
            }
          } catch (e) {
            // skip posts with permission errors silently
          }
        }
      } catch (e) {
        console.error(`[FB Poll] Account ${account.pageId} error:`, e.message);
      }
    }
  } catch (e) {
    console.error("[FB Poll] Poll error:", e.message);
  }
}

function startFbCommentPoller(intervalMs = 120000) {
  console.log("[FB Poll] Started — polling every 2 minutes");
  pollFacebookComments();
  setInterval(pollFacebookComments, intervalMs);
}

module.exports = { startFbCommentPoller };
