import { Octokit } from "@octokit/rest";
import simpleGit from "simple-git";
import fs from "fs/promises";
import path from "path";

class GitHubService {
  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID;
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET;
  }

  getOctokit(accessToken) {
    return new Octokit({ auth: accessToken });
  }

  async exchangeCodeForToken(code) {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
        }),
      }
    );

    const data = await response.json();
    return data.access_token;
  }

  async getUserRepos(accessToken) {
    const octokit = this.getOctokit(accessToken);

    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 100,
      affiliation: "owner,collaborator",
    });

    return data.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      description: repo.description,
      language: repo.language,
      updatedAt: repo.updated_at,
    }));
  }

  async createPullRequest(accessToken, owner, repo, title, body, head, base) {
    const octokit = this.getOctokit(accessToken);

    const { data } = await octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base: base || "main",
    });

    return {
      url: data.html_url,
      number: data.number,
      status: data.state,
    };
  }

  async createBranch(
    accessToken,
    owner,
    repo,
    branchName,
    baseBranch = "main"
  ) {
    const octokit = this.getOctokit(accessToken);

    // Get base branch SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    // Create new branch
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });

    return branchName;
  }

  async commitChanges(accessToken, owner, repo, branch, files, message) {
    const octokit = this.getOctokit(accessToken);

    // Get current commit SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    const currentCommitSha = refData.object.sha;

    // Get current tree
    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha,
    });

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blobData } = await octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });
        return {
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        };
      })
    );

    // Create new tree
    const { data: treeData } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: commitData.tree.sha,
      tree: blobs,
    });

    // Create new commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message,
      tree: treeData.sha,
      parents: [currentCommitSha],
    });

    // Update reference
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return newCommit.sha;
  }

  async cloneRepository(repoUrl, targetPath, accessToken) {
    const urlWithAuth = repoUrl.replace(
      "https://",
      `https://x-access-token:${accessToken}@`
    );
    const git = simpleGit();
    await git.clone(urlWithAuth, targetPath);
    return targetPath;
  }
}

export default new GitHubService();
