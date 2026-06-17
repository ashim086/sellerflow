const mongoose = require("mongoose");

const facebookAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pageId: { type: String, required: true },
  pageName: { type: String },
  pageAccessToken: { type: String, required: true },
  connectedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FacebookAccount", facebookAccountSchema);
