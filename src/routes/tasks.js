import express from "express";
import Task from "../models/Task.js";
import { authenticateToken } from "../middleware/auth.js";
import { addTaskToQueue } from "../services/queueService.js";

const router = express.Router();

// Get all tasks for authenticated user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select("-logs"); // Exclude logs for list view

    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single task with full details
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new task
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, description, type, repository } = req.body;

    // Validation
    if (!title || !description || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: title, description, type",
      });
    }

    // Initialize task stages
    const stages = [
      { name: "planning", status: "pending" },
      { name: "analysis", status: "pending" },
      { name: "implementation", status: "pending" },
      { name: "review", status: "pending" },
      { name: "pr-creation", status: "pending" },
      { name: "deployment", status: "pending" },
    ];

    const task = new Task({
      title,
      description,
      type,
      repository,
      user: req.user.id,
      status: "pending",
      stages,
    });

    await task.save();
    await task.addLog("info", "Task created successfully");

    // Add to processing queue
    await addTaskToQueue(task._id.toString());

    res.status(201).json({
      success: true,
      task,
      message: "Task created and queued for processing",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get task logs
router.get("/:id/logs", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id,
    }).select("logs");

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    res.json({ success: true, logs: task.logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel task
router.post("/:id/cancel", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (task.status === "completed" || task.status === "failed") {
      return res.status(400).json({
        success: false,
        error: "Cannot cancel completed or failed task",
      });
    }

    task.status = "failed";
    await task.addLog("warning", "Task cancelled by user");
    await task.save();

    res.json({ success: true, message: "Task cancelled" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Retry failed task
router.post("/:id/retry", authenticateToken, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (task.status !== "failed") {
      return res.status(400).json({
        success: false,
        error: "Can only retry failed tasks",
      });
    }

    // Reset task status
    task.status = "pending";
    task.progress = 0;
    task.stages.forEach((stage) => {
      stage.status = "pending";
      stage.startedAt = null;
      stage.completedAt = null;
      stage.error = null;
    });

    await task.addLog("info", "Task retry initiated");
    await task.save();

    // Re-add to queue
    await addTaskToQueue(task._id.toString());

    res.json({ success: true, message: "Task queued for retry" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
