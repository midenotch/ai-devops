import mongoose from "mongoose";
import crypto from "crypto";

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
    accessToken: String, // GitHub access token (encrypted)
    accessTokenIv: String, // Initialization Vector for accessToken encryption

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

// Pre-save hook to encrypt the accessToken
userSchema.pre("save", async function (next) {
  if (this.isModified("accessToken") && this.accessToken) {
    try {
      const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes (256 bits)
      if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
        return next(new Error("Encryption key is not set or is not 32 bytes long."));
      }

      const iv = crypto.randomBytes(16); // 16 bytes for AES-256-CBC
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
      let encrypted = cipher.update(this.accessToken, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      this.accessToken = encrypted;
      this.accessTokenIv = iv.toString('hex');
    } catch (error) {
      console.error("Error encrypting GitHub access token:", error);
      return next(error);
    }
  } else if (this.isModified("accessToken") && !this.accessToken) {
    // If accessToken is being set to null/empty, clear the IV as well
    this.accessTokenIv = undefined;
  }
  next();
});

// Method to decrypt the accessToken
userSchema.methods.getDecryptedAccessToken = function () {
  if (!this.accessToken || !this.accessTokenIv) {
    return null;
  }

  try {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes (256 bits)
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
      throw new Error("Encryption key is not set or is not 32 bytes long.");
    }

    const iv = Buffer.from(this.accessTokenIv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let decrypted = decipher.update(this.accessToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error("Error decrypting GitHub access token:", error);
    return null;
  }
};

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