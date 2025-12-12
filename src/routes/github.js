import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import githubService from "../services/githubService.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// GitHub OAuth callback
router.get("/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    // Exchange code for access token
    const accessToken = await githubService.exchangeCodeForToken(code);

    // Get user info
    const octokit = githubService.getOctokit(accessToken);
    const { data: githubUser } = await octokit.users.getAuthenticated();

    // Find or create user
    let user = await User.findOne({ githubId: githubUser.id.toString() });

    if (!user) {
      user = new User({
        githubId: githubUser.id.toString(),
        username: githubUser.login,
        email: githubUser.email,
        avatar: githubUser.avatar_url,
        accessToken,
      });
    } else {
      user.accessToken = accessToken;
      user.avatar = githubUser.avatar_url;
    }

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Get user's repositories
router.get("/repos", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.accessToken) {
      return res.status(401).json({ error: "GitHub not connected" });
    }

    const repos = await githubService.getUserRepos(user.accessToken);

    // Update user's repo list
    user.repositories = repos;
    await user.save();

    res.json({ success: true, repositories: repos });
  } catch (error) {
    console.error("Fetch repos error:", error);
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

// Get specific repository details
router.get("/repos/:owner/:repo", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { owner, repo } = req.params;

    const octokit = githubService.getOctokit(user.accessToken);
    const { data } = await octokit.repos.get({ owner, repo });

    res.json({
      success: true,
      repository: {
        id: data.id,
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        language: data.language,
        defaultBranch: data.default_branch,
        private: data.private,
        url: data.html_url,
        cloneUrl: data.clone_url,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch repository details" });
  }
});

export default router;
