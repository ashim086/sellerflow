const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, enum: ["instagram", "whatsapp"], required: true },
    username: { type: String, required: true, trim: true },
    lastMessage: { type: String, default: "" },
    profileUrl: { type: String, default: null },
    status: {
      type: String,
      enum: ["new", "contacted", "converted", "lost"],
      default: "new",
    },
    notes: [{ type: String }],
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "savedAt", updatedAt: "updatedAt" } }
);

// Compound index to detect duplicate leads per user per platform
leadSchema.index({ userId: 1, platform: 1, username: 1 });

module.exports = mongoose.model("Lead", leadSchema);
