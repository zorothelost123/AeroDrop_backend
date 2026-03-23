const express = require("express");
const router = express.Router();

const {
  getProducts,
  placeOrder,
  getOrderStatus,
  getActiveOrders,
  updateOrderStatus,
  agentLogin,
  getUnassignedOrders,
  acceptOrder,
  getOwnerDeliveries,
  createProducts,
  deleteProduct,
  editProducts,
  ownerAcceptOrder,
  ownerDeclineOrder,
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getUserOrders,
  cancelOrder,
  generateHandoffToken,
  verifyHandoffToken,
} = require("../controllers/deliveryController");

const { protect } = require("../middleware/authMiddleware");
const { agentProtect } = require("../middleware/agentAuthMiddleware");

// Products
router.get("/products", getProducts);
router.post("/products", createProducts);
router.put("/update", editProducts);
router.delete("/delete/:id", deleteProduct);

// Client
router.post("/order", protect, placeOrder);
router.get("/track/:orderId", protect, getOrderStatus);
router.put("/cancel/:orderId", protect, cancelOrder);
router.get("/user-orders/:userId", getUserOrders);

// Owner
router.get("/owner/orders", getOwnerDeliveries);
router.post("/owner/orders/:id/accept", ownerAcceptOrder);
router.post("/owner/orders/:id/decline", ownerDeclineOrder);

// Owner -> Delivery Agents CRUD
router.get("/owner/agents", protect, getAgents);
router.post("/owner/agents", protect, createAgent);
router.put("/owner/agents/:id", protect, updateAgent);
router.delete("/owner/agents/:id", protect, deleteAgent);

// Agent
router.post("/agent/login", agentLogin);
router.get("/agent/handoff", agentProtect, generateHandoffToken);
router.post("/agent/verify-handoff", verifyHandoffToken);
router.get("/unassigned", agentProtect, getUnassignedOrders);
router.put("/accept/:orderId", agentProtect, acceptOrder);
router.get("/active", agentProtect, getActiveOrders);
router.put("/status/:orderId", agentProtect, updateOrderStatus);

module.exports = router;
