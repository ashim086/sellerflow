const express = require("express");
const Order = require("../models/Order");
const Lead = require("../models/Lead");
const authMiddleware = require("../middleware/auth");

const router = express.Router();
router.use(authMiddleware);

// GET /api/orders
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId })
      .populate("leadId", "username platform")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// POST /api/orders
router.post("/", async (req, res) => {
  try {
    const { leadId, productName, quantity, price, deliveryAddress, notes } = req.body;
    if (!leadId || !productName || !quantity || price === undefined) {
      return res.status(400).json({ error: "leadId, productName, quantity, and price are required" });
    }

    const lead = await Lead.findOne({ _id: leadId, userId: req.userId });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const order = await Order.create({
      leadId,
      userId: req.userId,
      productName,
      quantity,
      price,
      deliveryAddress: deliveryAddress || "",
      notes: notes || "",
    });

    res.status(201).json(order);
  } catch {
    res.status(500).json({ error: "Failed to create order" });
  }
});

// PATCH /api/orders/:id
router.patch("/:id", async (req, res) => {
  try {
    const { status, productName, quantity, price, deliveryAddress, notes } = req.body;
    const order = await Order.findOne({ _id: req.params.id, userId: req.userId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (status) order.status = status;
    if (productName) order.productName = productName;
    if (quantity) order.quantity = quantity;
    if (price !== undefined) order.price = price;
    if (deliveryAddress !== undefined) order.deliveryAddress = deliveryAddress;
    if (notes !== undefined) order.notes = notes;

    await order.save();
    res.json(order);
  } catch {
    res.status(500).json({ error: "Failed to update order" });
  }
});

module.exports = router;
