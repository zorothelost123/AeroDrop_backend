// index.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { initTables } = require("./utils/initTables"); // Adjust path if needed

// Route Imports
const deliveryRoutes = require("./routes/deliveryRoutes");
const ownerRoutes = require("./routes/ownerRoute");
const addressRoutes = require("./routes/marsMartAddressRoutes"); // Update if you renamed the file

const app = express();
const server = http.createServer(app);
app.set("trust proxy", 1);

const configuredOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:3001",
  "https://aero-drop-frontend.vercel.app",
]
  .flatMap((value) => String(value || "").split(","))
  .map((value) => value.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".vercel.app");
  } catch (error) {
    return false;
  }
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, origin || true);
      return;
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

// Socket.io Setup
const io = new Server(server, {
  cors: corsOptions,
});

// Make 'io' accessible inside your controllers
app.set("io", io);

io.on("connection", (socket) => {
  console.log("⚡ A user connected:", socket.id);

  // Join a specific order room for real-time tracking
  socket.on("join_order_room", (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`User joined room: order_${orderId}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Mount Routes
app.use("/api/delivery", deliveryRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/address", addressRoutes);

// Initialize DB Tables
initTables();

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 AeroDrop Backend running on port ${PORT}`);
});
