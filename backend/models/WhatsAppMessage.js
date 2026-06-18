const mongoose = require("mongoose");

const whatsAppMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  waMessageId: { type: String, unique: true, sparse: true },
  direction: { type: String, enum: ["inbound", "outbound"], required: true },
  text: { type: String, default: "" },
  timestamp: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WhatsAppMessage", whatsAppMessageSchema);
