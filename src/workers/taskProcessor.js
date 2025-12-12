import { Worker } from "bullmq";
import Redis from "ioredis";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Task from "../models/Task.js";
import User from "../models/User.js";
import oumiService from "../services/oumiService.js";
import githubService from "../services/githubService.js";
import coderabbitService from "../services/coderabbitService.js";
import kestraService from "../services/kestraService.js";
import simpleGit from "simple-git";
import fs from "fs/promises";
import path from "path";

dotenv.config();

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ai-devops")
  .then(() => console.log("✅ Worker: MongoDB connected"))
  .catch((err) => console.error("❌ Worker: MongoDB error:", err));

const connection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  }
);

// Main task processor
const worker = new Worker(
  "ai-devops-tasks",
  async (job) => {
    const { taskId } = job.data;
    console.log(`🔄 Processing task: ${taskId}`);

    let task = await Task.findById(taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    try {
      // Stage 1: Planning with Oumi
      await executeStage(task, "planning", async () => {
        task.status = "analyzing";
        await task.addLog("info", "🤖 AI Agent planning execution strategy...");

        const plan = await oumiService.orchestrateTask(task);

        await task.addLog(
          "success",
          `✅ Execution plan created: ${plan.steps.length} steps`
        );
        return { plan };
      });

      // Stage 2: Repository Analysis
      await executeStage(task, "analysis", async () => {
        task.status = "analyzing";
        await task.addLog("info", "📊 Analyzing repository structure...");

        const user = await User.findById(task.user);
        if (!user || !user.accessToken) {
          throw new Error("GitHub access token not found");
        }

        // Clone repository
        const repoPath = `/tmp/repos/${task._id}`;
        await fs.mkdir(repoPath, { recursive: true });

        const repoUrl = task.repository.cloneUrl;
        const urlWithAuth = repoUrl.replace(
          "https://",
          `https://x-access-token:${user.accessToken}@`
        );

        const git = simpleGit();
        await git.clone(urlWithAuth, repoPath);

        // Analyze repository
        const analysis = await analyzeRepository(repoPath, task.description);

        task.clineAnalysis = analysis;
        await task.addLog(
          "success",
          `✅ Found ${analysis.identifiedFiles.length} relevant files`
        );

        return { analysis, repoPath };
      });

      // Stage 3: Code Implementation
      await executeStage(task, "implementation", async () => {
        task.status = "coding";
        await task.addLog("info", "⚙️ Generating code changes...");

        const changes = await generateCodeChanges(
          task.clineAnalysis,
          task.description,
          task.type
        );

        await task.addLog(
          "success",
          `✅ Generated ${changes.length} code modifications`
        );
        return { changes };
      });

      // Stage 4: Code Review
      await executeStage(task, "review", async () => {
        task.status = "reviewing";
        await task.addLog("info", "🔍 Running automated code review...");

        const stageData = task.stages.find((s) => s.name === "implementation");
        const changes = stageData.output.changes;

        const review = await coderabbitService.reviewChanges(
          task.repository.owner,
          task.repository.name,
          changes
        );

        task.coderabbitReview = review;

        if (!review.passed) {
          await task.addLog(
            "warning",
            `⚠️ Code review found ${review.issues.length} issues`
          );

          // Refine changes based on feedback
          const refinedChanges = await oumiService.refineChanges(
            changes,
            review
          );
          await task.addLog(
            "info",
            "🔄 Refining code based on review feedback..."
          );

          return { changes: refinedChanges, review };
        }

        await task.addLog(
          "success",
          `✅ Code review passed (Score: ${review.score}/100)`
        );
        return { changes, review };
      });

      // Stage 5: Create Pull Request
      await executeStage(task, "pr-creation", async () => {
        task.status = "creating-pr";
        await task.addLog("info", "📝 Creating pull request...");

        const user = await User.findById(task.user);
        const reviewStage = task.stages.find((s) => s.name === "review");
        const changes = reviewStage.output.changes;

        // Create branch
        const branchName = `ai-devops-${task._id}`;
        await githubService.createBranch(
          user.accessToken,
          task.repository.owner,
          task.repository.name,
          branchName,
          task.repository.branch || "main"
        );

        // Commit changes
        await githubService.commitChanges(
          user.accessToken,
          task.repository.owner,
          task.repository.name,
          branchName,
          changes,
          `🤖 ${task.title}\n\n${task.description}\n\nAuto-generated by AI DevOps Service`
        );

        // Create PR
        const prTitle = `🤖 ${task.title}`;
        const prBody = `
## AI-Generated Changes

**Task Type:** ${task.type}
**Description:** ${task.description}

### Code Review Results
- **Quality Score:** ${task.coderabbitReview.score}/100
- **Issues Found:** ${task.coderabbitReview.issues.length}

### Changes Made
${changes.map((c) => `- Modified \`${c.path}\``).join("\n")}

### Review Summary
${task.coderabbitReview.summary}

---
*This PR was automatically generated by AI DevOps Engineer-as-a-Service*
`;

        const pr = await githubService.createPullRequest(
          user.accessToken,
          task.repository.owner,
          task.repository.name,
          prTitle,
          prBody,
          branchName,
          task.repository.branch || "main"
        );

        task.pullRequest = pr;
        await task.addLog("success", `✅ Pull request created: ${pr.url}`);

        return { pr };
      });

      // Stage 6: Deployment Pipeline
      await executeStage(task, "deployment", async () => {
        task.status = "deploying";
        await task.addLog("info", "🚀 Triggering deployment pipeline...");

        const deployment = await kestraService.triggerCICDPipeline(
          task,
          task.stages.find((s) => s.name === "review").output.changes
        );

        task.kestraWorkflowId = deployment.workflowId;
        task.kestraExecutionId = deployment.executionId;

        await task.addLog("success", "✅ Deployment pipeline initiated");

        // Simulate deployment completion
        setTimeout(async () => {
          task.deployment = {
            url: `https://${task.repository.name}-preview.vercel.app`,
            status: "success",
            provider: "vercel",
            deployedAt: new Date(),
          };
          await task.save();
        }, 5000);

        return { deployment };
      });

      // Mark as completed
      task.status = "completed";
      task.progress = 100;
      await task.addLog("success", "🎉 Task completed successfully!");
      await task.save();

      console.log(`✅ Task ${taskId} completed`);
    } catch (error) {
      console.error(`❌ Task ${taskId} failed:`, error);
      task.status = "failed";
      await task.addLog("error", `❌ Task failed: ${error.message}`);
      await task.save();
      throw error;
    }
  },
  { connection }
);

// Helper: Execute a stage
async function executeStage(task, stageName, executor) {
  const stage = task.stages.find((s) => s.name === stageName);
  if (!stage) return;

  try {
    stage.status = "in-progress";
    stage.startedAt = new Date();
    await task.save();

    const output = await executor();

    stage.status = "completed";
    stage.completedAt = new Date();
    stage.output = output;

    // Update progress
    const completedStages = task.stages.filter(
      (s) => s.status === "completed"
    ).length;
    task.progress = Math.round((completedStages / task.stages.length) * 100);

    await task.save();
  } catch (error) {
    stage.status = "failed";
    stage.error = error.message;
    await task.save();
    throw error;
  }
}

// Helper: Analyze repository
async function analyzeRepository(repoPath, taskDescription) {
  const files = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const relativePath = fullPath.replace(repoPath, "");
        files.push(relativePath);
      }
    }
  }

  await walk(repoPath);

  // Filter relevant files based on task
  const relevantFiles = files.filter((f) => {
    if (taskDescription.toLowerCase().includes("api")) {
      return (
        f.includes("api") || f.includes("route") || f.includes("controller")
      );
    }
    if (taskDescription.toLowerCase().includes("frontend")) {
      return f.match(/\.(jsx?|tsx?|vue)$/);
    }
    return f.match(/\.(js|ts|jsx|tsx|py|java)$/);
  });

  return {
    filesAnalyzed: files.length,
    identifiedFiles: relevantFiles,
    proposedChanges: [],
    reasoning: `Analyzed ${files.length} files, identified ${relevantFiles.length} relevant files`,
  };
}

// Helper: Generate code changes
async function generateCodeChanges(analysis, description, type) {
  // In production, this would use Oumi/OpenAI to generate actual code
  // For demo, return simulated changes
  return analysis.identifiedFiles.slice(0, 3).map((file) => ({
    path: file,
    type: "modification",
    content: `// AI-generated code for: ${description}\n// TODO: Implement actual changes\n`,
    description: `Optimized code in ${file}`,
  }));
}

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

console.log("🔄 Task processor worker started");

export default worker;
