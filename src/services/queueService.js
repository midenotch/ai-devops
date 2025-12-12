//src/services/queueService.js
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const connection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  }
);

// Create task queue
export const taskQueue = new Queue("ai-devops-tasks", { connection });

// Add task to queue
export const addTaskToQueue = async (taskId, priority = 1) => {
  await taskQueue.add(
    "process-task",
    { taskId },
    {
      priority,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    }
  );
  console.log(`✅ Task ${taskId} added to queue`);
};
