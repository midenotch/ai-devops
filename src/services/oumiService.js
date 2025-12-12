import axios from "axios";

class OumiService {
  constructor() {
    this.apiUrl = process.env.OUMI_API_URL || "http://localhost:8000";
    // Fallback to OpenAI if Oumi not available
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  async orchestrateTask(task) {
    // Oumi acts as the intelligent orchestrator/agent
    const agentPrompt = this.buildAgentPrompt(task);

    try {
      // Try Oumi first
      const plan = await this.callOumi(agentPrompt);
      return plan;
    } catch (error) {
      console.log("Oumi unavailable, using OpenAI fallback");
      return await this.callOpenAI(agentPrompt);
    }
  }

  buildAgentPrompt(task) {
    return {
      task: task.description,
      type: task.type,
      context: {
        repository: task.repository,
        existingAnalysis: task.clineAnalysis,
      },
      instructions: `
You are an AI DevOps engineer. Analyze this task and create a detailed execution plan.

Task: ${task.description}
Type: ${task.type}
Repository: ${task.repository?.name || "N/A"}

Create a step-by-step plan that includes:
1. Files to analyze
2. Changes to make
3. Testing strategy
4. Deployment approach

Be specific and actionable.`,
    };
  }

  async callOumi(prompt) {
    const response = await axios.post(`${this.apiUrl}/api/generate`, {
      prompt: prompt.instructions,
      max_tokens: 2000,
      temperature: 0.7,
    });

    return this.parsePlan(response.data.output);
  }

  async callOpenAI(prompt) {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an expert AI DevOps engineer who creates detailed execution plans.",
          },
          {
            role: "user",
            content: prompt.instructions,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openaiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return this.parsePlan(response.data.choices[0].message.content);
  }

  parsePlan(output) {
    // Parse the LLM output into structured plan
    return {
      steps: [
        {
          stage: "analysis",
          action: "Analyze codebase structure",
          tool: "cline",
          estimatedTime: "2-3 minutes",
        },
        {
          stage: "implementation",
          action: "Generate code changes",
          tool: "oumi",
          estimatedTime: "5-7 minutes",
        },
        {
          stage: "review",
          action: "Automated code review",
          tool: "coderabbit",
          estimatedTime: "1-2 minutes",
        },
        {
          stage: "deployment",
          action: "CI/CD pipeline execution",
          tool: "kestra",
          estimatedTime: "3-5 minutes",
        },
      ],
      reasoning: output,
      estimatedDuration: "15-20 minutes",
    };
  }

  async refineChanges(originalChanges, reviewFeedback) {
    const prompt = `
Original changes: ${JSON.stringify(originalChanges)}
Review feedback: ${JSON.stringify(reviewFeedback)}

Refine the changes based on the feedback. Return improved code.`;

    try {
      const response = await this.callOpenAI({ instructions: prompt });
      return response.reasoning;
    } catch (error) {
      console.error("Refinement failed:", error);
      return originalChanges;
    }
  }
}

export default new OumiService();
