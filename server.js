import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import taskRoutes from "./routes/tasks.js";
import githubRoutes from "./routes/github.js";
import authRoutes from "./routes/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createClient } from "redis"; // Import createClient for Redis

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  },
});

// Initialize Redis client
// Use process.env.REDIS_URL or a default
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Handle Redis connection and errors
redisClient.on('connect', () => console.log('✅ Redis connected'));
redisClient.on('error', (err) => console.error('❌ Redis connection error:', err));

// Connect to Redis when the server starts
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error("❌ Failed to connect to Redis on startup:", err);
  }
})();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ai-devops")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Make Socket.IO available to routes
app.set("io", io);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/github", githubRoutes);

// Health check
app.get("/health", async (req, res) => { // Made async to await Redis check
  let redisStatus = false;
  try {
    // Ping Redis to check its status
    await redisClient.ping();
    redisStatus = true;
  } catch (error) {
    console.error("Redis health check failed:", error.message);
    redisStatus = false;
  }

  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      mongodb: mongoose.connection.readyState === 1,
      // Fix: Dynamically check Redis connection status
      redis: redisStatus,
    },
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "AI DevOps Engineer-as-a-Service API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      tasks: "/api/tasks",
      github: "/api/github",
      health: "/health",
    },
  });
});

// Error handling
app.use(errorHandler);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  // Join task room for real-time updates
  socket.on("join-task", (taskId) => {
    socket.join(`task-${taskId}`);
    console.log(`👤 Client ${socket.id} joined task ${taskId}`);
  });

  socket.on("leave-task", (taskId) => {
    socket.leave(`task-${taskId}`);
    console.log(`👤 Client ${socket.id} left task ${taskId}`);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Client disconnected:", socket.id);
  });
});

// Emit task updates helper (can be called from workers)
export function emitTaskUpdate(taskId, update) {
  io.to(`task-${taskId}`).emit("task-update", update);
}

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   🤖 AI DevOps Engineer-as-a-Service                       ║
║                                                            ║
║   🚀 Server running on port ${PORT}                        ║
║   🌐 API: http://localhost:${PORT}/api                      ║
║   🔌 WebSocket: ws://localhost:${PORT}                      ║
║                                                            ║
║   📚 Endpoints:                                            ║
║      - POST /api/auth/register                            ║
║      - POST /api/auth/login                               ║
║      - GET  /api/auth/github                              ║
║      - GET  /api/github/repos                             ║
║      - POST /api/tasks                                    ║
║      - GET  /api/tasks                                    ║
║                                                            ║
║   💡 Remember to start the worker:                        ║
║      npm run worker                                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export { io };