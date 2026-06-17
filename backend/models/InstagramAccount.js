const mongoose = require("mongoose");

const instagramAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  accessToken: { type: String, required: true },
  tokenExpiresAt: { type: Date },
  pageId: { type: String },
  instagramId: { type: String },
  instagramUsername: { type: String },
  profilePictureUrl: { type: String },
  connectedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InstagramAccount", instagramAccountSchema);
