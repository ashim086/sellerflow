const mongoose = require("mongoose");

const whatsAppConversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  phoneNumberId: { type: String, required: true },
  contactPhone: { type: String, required: true },
  contactName: { type: String },
  lastMessage: { type: String },
  lastMessageAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

whatsAppConversationSchema.index({ userId: 1, contactPhone: 1 }, { unique: true });

module.exports = mongoose.model("WhatsAppConversation", whatsAppConversationSchema);
