const mongoose = require("mongoose");

const whatsAppAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  accessToken: { type: String, required: true },
  wabaId: { type: String },
  phoneNumberId: { type: String },
  displayPhoneNumber: { type: String },
  businessName: { type: String },
  connectedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WhatsAppAccount", whatsAppAccountSchema);
