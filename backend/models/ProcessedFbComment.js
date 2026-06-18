const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  commentId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 604800 }, // auto-delete after 7 days
});

module.exports = mongoose.model("ProcessedFbComment", schema);
