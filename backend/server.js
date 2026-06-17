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
app.use("/api/leads", require("./routes/leads"));
app.use("/api/orders", require("./routes/orders"));

app.get("/health", (_, res) => res.json({ status: "ok" }));

// Connect to MongoDB and start
const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`SellerFlow API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
