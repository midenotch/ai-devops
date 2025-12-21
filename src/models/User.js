import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // Email/Password Authentication
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      // Required only for email/password auth, not for OAuth
      required: function () {
        return !this.githubId;
      },
    },
    username: {
      type: String,
      required: true,
    },

    // GitHub OAuth
    githubId: {
      type: String,
      sparse: true, // Allows null values while maintaining uniqueness for non-null
      unique: true,
    },
    avatar: String,
    accessToken: String, // GitHub access token (encrypt in production!)

    // User Repositories
    repositories: [
      {
        id: Number,
        name: String,
        fullName: String,
        private: Boolean,
        url: String,
        cloneUrl: String,
        defaultBranch: String,
        language: String,
      },
    ],

    // Preferences
    preferences: {
      autoApprove: {
        type: Boolean,
        default: false,
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        slack: {
          type: Boolean,
          default: false,
        },
      },
      defaultRepository: {
        type: String,
        default: null,
      },
    },

    // Stats
    stats: {
      tasksCompleted: {
        type: Number,
        default: 0,
      },
      tasksCreated: {
        type: Number,
        default: 0,
      },
      pullRequestsCreated: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Method to check if GitHub is connected
userSchema.methods.isGitHubConnected = function () {
  return !!this.accessToken;
};

// Method to increment stats
userSchema.methods.incrementStat = async function (statName) {
  if (this.stats[statName] !== undefined) {
    this.stats[statName]++;
    // FIX: Added await this.save() to persist the changes to the database.
    // Without this, the incremented stat would not be saved.
    await this.save(); 
  }
};

export default mongoose.model("User", userSchema);