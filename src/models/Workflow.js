import mongoose from "mongoose";

const workflowSchema = new mongoose.Schema(
  {
    name: String,
    type: {
      type: String,
      enum: ["ci-cd", "code-review", "deployment", "testing"],
    },
    kestraFlowId: String,
    config: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["active", "paused", "error"],
      default: "active",
    },
    executions: [
      {
        kestraExecutionId: String,
        taskId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Task",
        },
        status: String,
        startedAt: Date,
        completedAt: Date,
        duration: Number,
      },
    ],
    triggers: [
      {
        type: {
          type: String,
          enum: ["schedule", "webhook", "manual"],
        },
        config: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Workflow", workflowSchema);
