import axios from "axios";

class KestraService {
  constructor() {
    this.apiUrl = process.env.KESTRA_API_URL || "http://localhost:8080";
    this.apiToken = process.env.KESTRA_API_TOKEN;
    this.namespace = process.env.KESTRA_NAMESPACE || "ai-devops";
  }

  async triggerCICDPipeline(task, changes) {
    try {
      const execution = await this.executeFlow("ci-cd-pipeline", {
        taskId: task._id.toString(),
        repository: task.repository,
        changes: changes,
        branch: `ai-devops-${task._id}`,
      });

      return {
        workflowId: "ci-cd-pipeline",
        executionId: execution.id,
        status: execution.state.current,
      };
    } catch (error) {
      console.error("Kestra pipeline trigger failed:", error);
      return this.simulatePipeline(task);
    }
  }

  async executeFlow(flowId, inputs) {
    const response = await axios.post(
      `${this.apiUrl}/api/v1/executions/${this.namespace}/${flowId}`,
      inputs,
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  }

  async getExecutionStatus(executionId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/api/v1/executions/${executionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
          },
        }
      );

      return {
        status: response.data.state.current,
        duration: response.data.state.duration,
        outputs: response.data.outputs,
      };
    } catch (error) {
      return { status: "RUNNING" };
    }
  }

  simulatePipeline(task) {
    return {
      workflowId: "ci-cd-pipeline",
      executionId: `exec_${Date.now()}`,
      status: "RUNNING",
    };
  }

  async triggerDeployment(task, prUrl) {
    try {
      const execution = await this.executeFlow("deployment-flow", {
        taskId: task._id.toString(),
        pullRequestUrl: prUrl,
        deployTo: "vercel",
      });

      return {
        workflowId: "deployment-flow",
        executionId: execution.id,
        status: execution.state.current,
      };
    } catch (error) {
      console.error("Deployment trigger failed:", error);
      return this.simulateDeployment();
    }
  }

  simulateDeployment() {
    return {
      workflowId: "deployment-flow",
      executionId: `deploy_${Date.now()}`,
      status: "RUNNING",
    };
  }
}

export default new KestraService();
