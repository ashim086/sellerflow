require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// CORS — allow dashboard and Chrome extension
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (!origin || origin.startsWith("chrome-extension://") || origin.startsWith("http://localhost")) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/auth", require("./routes/instagram"));
app.use("/api/auth", require("./routes/facebook"));
app.use("/api/auth", require("./routes/whatsapp"));
app.use("/api/leads", require("./routes/leads"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/ai", require("./routes/ai"));

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.get("/privacy", (_, res) => res.sendFile(require("path").join(__dirname, "../dashboard/public/privacy.html")));
app.post("/data-deletion", (req, res) => {
  const signedRequest = req.body?.signed_request;
  res.json({ url: `https://hankering-bouncy-unwelcome.ngrok-free.dev/data-deletion-status`, confirmation_code: signedRequest || "deletion_requested" });
});
app.get("/data-deletion-status", (_, res) => res.send("<h2>Data Deletion</h2><p>Your data deletion request has been received and will be processed within 30 days. Contact ashim.techmandu@gmail.com for confirmation.</p>"));

// Connect to MongoDB and start
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    const { startWorker } = require("./services/aiPipeline");
    startWorker();
    const { startFbCommentPoller } = require("./services/fbCommentPoller");
    startFbCommentPoller();
    const { startFbDmPoller } = require("./services/fbDmPoller");
    startFbDmPoller();
    const { startIgCommentPoller } = require("./services/igCommentPoller");
    startIgCommentPoller();
    app.listen(PORT, () => console.log(`SellerFlow API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
