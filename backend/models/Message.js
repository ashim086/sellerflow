const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
  content: { type: String, required: true },
  direction: { type: String, enum: ["inbound", "outbound"], required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);
