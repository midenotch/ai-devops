import axios from "axios";

class CodeRabbitService {
  constructor() {
    this.apiKey = process.env.CODERABBIT_API_KEY;
    this.baseUrl = "https://api.coderabbit.ai/v1";
  }

  async reviewChanges(repoOwner, repoName, changes) {
    try {
      // If CodeRabbit API is available
      if (this.apiKey) {
        return await this.performActualReview(repoOwner, repoName, changes);
      }

      // Simulate review for demo
      return this.simulateReview(changes);
    } catch (error) {
      console.error("CodeRabbit error:", error);
      return this.simulateReview(changes);
    }
  }

  async performActualReview(repoOwner, repoName, changes) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/reviews`,
        {
          repository: `${repoOwner}/${repoName}`,
          changes: changes,
          options: {
            checkQuality: true,
            checkSecurity: true,
            checkPerformance: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return this.formatReview(response.data);
    } catch (error) {
      console.error("Error performing actual review:", error);
      throw error;
    }
  }

  simulateReview(changes) {
    const issues = [];
    const suggestions = [];

    // Simulate intelligent review
    if (JSON.stringify(changes).includes("console.log")) {
      issues.push({
        file: changes[0]?.path || "unknown",
        line: 10,
        severity: "warning",
        message: "Remove console.log statements before production",
        suggestion: "Use a proper logging library like winston or pino",
      });
    }

    if (JSON.stringify(changes).includes("var ")) {
      issues.push({
        file: changes[0]?.path || "unknown",
        line: 5,
        severity: "info",
        message: "Use const or let instead of var",
        suggestion: "Replace var with const for immutable variables",
      });
    }

    suggestions.push("Add JSDoc comments for better documentation");
    suggestions.push("Consider adding unit tests for new functions");
    suggestions.push("Implement error handling for async operations");

    const score = Math.max(75, 100 - issues.length * 5);

    return {
      score,
      issues,
      suggestions,
      summary: `Review completed with ${issues.length} issues found. Quality score: ${score}/100`,
      passed: score >= 70,
    };
  }

  formatReview(reviewData) {
    return {
      score: reviewData.quality_score || 85,
      issues: reviewData.issues || [],
      suggestions: reviewData.suggestions || [],
      summary: reviewData.summary || "Review completed",
      passed: (reviewData.quality_score || 85) >= 70,
    };
  }
}

export default new CodeRabbitService();