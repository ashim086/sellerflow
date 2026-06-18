const mongoose = require("mongoose");

const aiConfigSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  businessName: { type: String, default: "" },
  autoReply: {
    instagram_dms: { type: Boolean, default: false },
    instagram_comments: { type: Boolean, default: false },
    facebook_dms: { type: Boolean, default: false },
    facebook_comments: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
  },
  systemPromptExtra: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("AIConfig", aiConfigSchema);
