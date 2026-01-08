// backend/src/server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { createClient } from 'redis';
import taskRoutes from "./routes/tasks.js";
import githubRoutes from "./routes/github.js";
import webhookRoutes from "./routes/webhooks.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticateToken } from "./middleware/auth.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ai-devops")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Redis client setup
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisClient.connect().then(() => console.log('✅ Redis connected')).catch((err) => console.error('❌ Redis connection error:', err));

// Make Socket.IO available to routes
app.set("io", io);

// Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/auth/github", githubRoutes);
app.use("/api/webhooks", webhookRoutes);

// Health check
app.get("/health", async (req, res) => {
  let redisStatus = false;
  try {
    await redisClient.ping();
    redisStatus = true;
  } catch (error) {
    redisStatus = false;
  }

  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1,
      redis: redisStatus,
    },
  });
});

// Error handling
app.use(errorHandler);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("join-task", (taskId) => {
    socket.join(`task-${taskId}`);
    console.log(`👤 Client ${socket.id} joined task ${taskId}`);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
});