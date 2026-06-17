const express = require("express");
const Lead = require("../models/Lead");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// GET /api/leads — all leads for the logged-in user
router.get("/", async (req, res) => {
  try {
    const leads = await Lead.find({ userId: req.userId }).sort({ savedAt: -1 });
    res.json(leads);
  } catch {
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// POST /api/leads — create or update existing lead
router.post("/", async (req, res) => {
  try {
    const { platform, username, lastMessage, note, profileUrl, timestamp } = req.body;
    if (!platform || !username) return res.status(400).json({ error: "platform and username required" });

    let lead = await Lead.findOne({ userId: req.userId, platform, username });

    if (lead) {
      lead.lastMessage = lastMessage || lead.lastMessage;
      if (profileUrl) lead.profileUrl = profileUrl;
      lead.savedAt = timestamp ? new Date(timestamp) : new Date();
      // Only add note if user explicitly selected a message
      if (note && note.trim() && note.trim() !== lead.notes[lead.notes.length - 1]) {
        lead.notes.push(note.trim());
      }
      await lead.save();
    } else {
      lead = await Lead.create({
        userId: req.userId,
        platform,
        username,
        lastMessage: lastMessage || "",
        profileUrl: profileUrl || null,
        notes: note && note.trim() ? [note.trim()] : [],
        savedAt: timestamp ? new Date(timestamp) : new Date(),
      });
    }

    // Store the user-selected message in the Messages collection
    if (note && note.trim()) {
      await Message.create({
        leadId: lead._id,
        content: note.trim(),
        direction: "inbound",
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });
    }

    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ error: "Failed to save lead" });
  }
});

// PATCH /api/leads/:id — update status or add note
router.patch("/:id", async (req, res) => {
  try {
    const { status, note } = req.body;
    const lead = await Lead.findOne({ _id: req.params.id, userId: req.userId });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    if (status) lead.status = status;
    if (note && note.trim()) lead.notes.push(note.trim());

    await lead.save();
    res.json(lead);
  } catch {
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// DELETE /api/leads/:id
router.delete("/:id", async (req, res) => {
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json({ message: "Lead deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

module.exports = router;
