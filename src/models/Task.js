import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "optimize-api",
        "fix-bug",
        "deploy-frontend",
        "add-feature",
        "refactor",
        "custom",
      ],
      required: true,
    },
    repository: {
      url: String,
      owner: String,
      name: String,
      branch: String,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "analyzing",
        "coding",
        "reviewing",
        "refining",
        "creating-pr",
        "deploying",
        "completed",
        "failed",
      ],
      default: "pending",
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    stages: [
      {
        name: String,
        status: {
          type: String,
          enum: ["pending", "in-progress", "completed", "failed"],
        },
        startedAt: Date,
        completedAt: Date,
        output: mongoose.Schema.Types.Mixed,
        error: String,
      },
    ],
    // FIX: Corrected the field name from 'clineAnalysis' to 'codeAnalysis'
    // to improve clarity and consistency, as 'cline' was likely a typo.
    codeAnalysis: { 
      filesAnalyzed: [String],
      proposedChanges: mongoose.Schema.Types.Mixed,
      reasoning: String,
    },
    coderabbitReview: {
      score: Number,
      issues: [
        {
          file: String,
          line: Number,
          severity: String,
          message: String,
          suggestion: String,
        },
      ],
      suggestions: [String],
    },
    pullRequest: {
      url: String,
      number: Number,
      status: String,
      createdAt: Date,
    },
    deployment: {
      url: String,
      status: String,
      provider: String,
      deployedAt: Date,
    },
    kestraWorkflowId: String,
    kestraExecutionId: String,
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    logs: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        level: {
          type: String,
          enum: ["info", "warning", "error", "success"],
        },
        message: String,
        data: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  }
);

taskSchema.methods.addLog = function (level, message, data = null) {
  this.logs.push({ level, message, data, timestamp: new Date() });
  return this.save();
};

taskSchema.methods.updateStage = function (
  stageName,
  status,
  output = null,
  error = null
) {
  const stage = this.stages.find((s) => s.name === stageName);
  if (stage) {
    stage.status = status;
    if (status === "completed") stage.completedAt = new Date();
    if (output) stage.output = output;
    if (error) stage.error = error;
  }
  return this.save();
};

export default mongoose.model("Task", taskSchema);