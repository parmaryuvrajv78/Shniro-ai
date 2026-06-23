import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

// Models
import User from "./models/User.js";
import Chat from "./models/Chat.js";

// AI Logic Service
import * as ai from "./utils/aiService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Request Logger
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "floak_secret");
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Explicit Routes
app.get("/", (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/auth.html");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/auth.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

// MongoDB Connection Management
let isDbConnected = false;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/floak_solver";

mongoose.connect(MONGODB_URI)
  .catch(err => {
    console.error("❌ Initial MongoDB connection error:", err.message);
  });

const db = mongoose.connection;
db.on("connected", () => {
  console.log("✅ MongoDB Connected Successfully to Atlas/Local");
  isDbConnected = true;
});

db.on("error", (err) => {
  console.error("❌ MongoDB Connection Error:", err.message);
  isDbConnected = false;
});

db.on("disconnected", () => {
  console.warn("⚠️ MongoDB Disconnected");
  isDbConnected = false;
});

const upload = multer({ dest: "uploads/" });

// In-memory conversation removed in favor of db-backed session tracking

function isAdminUser(user) {
  const configuredAdmins = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

  if (configuredAdmins.length > 0) {
    return configuredAdmins.includes(user.email?.toLowerCase());
  }

  return user.username?.toLowerCase() === "admin";
}

const requireAdmin = async (req, res, next) => {
  if (!isDbConnected) return res.status(503).json({ error: "Database offline" });

  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user || !isAdminUser(user)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    req.adminUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Failed to verify admin access" });
  }
};

// ======================
// AUTH ROUTES
// ======================

app.post("/api/auth/signup", async (req, res) => {
  if (!isDbConnected) return res.status(503).json({ error: "Database offline" });
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ error: "User already exists" });

    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: "User created" });
  } catch (err) {
    res.status(500).json({ error: "Signup error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!isDbConnected) return res.status(503).json({ error: "Database offline" });
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "floak_secret", { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ message: "Login successful", user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: "Login error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(401).json({ error: "Invalid session" });
    const userObject = user.toObject();
    userObject.isAdmin = isAdminUser(userObject);
    res.json({ user: userObject });
  } catch (err) {
    res.status(401).json({ error: "Invalid session" });
  }
});

// ======================
// ADMIN ROUTES
// ======================

app.get("/api/admin/analytics", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      premiumUsers,
      freeUsers,
      totalChats,
      todayChats,
      weekChats,
      recentUsers,
      topUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ plan: "premium" }),
      User.countDocuments({ plan: "free" }),
      Chat.countDocuments(),
      Chat.countDocuments({ updatedAt: { $gte: todayStart } }),
      Chat.countDocuments({ updatedAt: { $gte: weekStart } }),
      User.find().sort({ createdAt: -1 }).limit(5).select("username email plan createdAt"),
      Chat.aggregate([
        { $group: { _id: "$userId", chats: { $sum: 1 }, lastActive: { $max: "$updatedAt" } } },
        { $sort: { chats: -1, lastActive: -1 } },
        { $limit: 5 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { _id: 0, username: "$user.username", email: "$user.email", chats: 1, lastActive: 1 } }
      ])
    ]);

    res.json({
      totals: {
        users: totalUsers,
        premiumUsers,
        freeUsers,
        chats: totalChats,
        todayChats,
        weekChats
      },
      recentUsers,
      topUsers
    });
  } catch (err) {
    console.error("Admin analytics error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ======================
// QUIZ ROUTES
// ======================

app.post("/api/quiz/generate", authenticateToken, async (req, res) => {
  const topic = req.body.topic?.trim();
  const count = Number(req.body.count || 5);

  if (!topic) return res.status(400).json({ error: "Topic is required" });

  try {
    const quiz = await ai.generateQuiz(topic, {
      GROQ: process.env.GROQ_API_KEY,
      GEMINI: process.env.GEMINI_API_KEY
    }, count);

    res.json({ quiz, saved: false });
  } catch (err) {
    console.error("Quiz generation error:", err);
    res.status(500).json({ error: "Failed to generate quiz", details: err.message });
  }
});

// ======================
// CHAT ROUTES
// ======================

app.post("/reset", (req, res) => {
  res.json({ ok: true });
});

app.post("/solve", upload.single("image"), async (req, res) => {
  const question = req.body.prompt?.trim() || "Explain clearly.";
  const chatId = req.body.chatId;
  let userId = null;
  let userRecord = null;

  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "floak_secret");
      userId = decoded.userId;
      if (isDbConnected) {
        userRecord = await User.findById(userId);
      }
    }
  } catch (e) {}

  // Enforce limits for free non-admin users only.
  if (userRecord && userRecord.plan === 'free' && !isAdminUser(userRecord)) {
    const today = new Date().setHours(0,0,0,0);
    const lastPrompt = new Date(userRecord.lastPromptDate).setHours(0,0,0,0);
    
    if (today > lastPrompt) {
      userRecord.promptsUsedToday = 0;
      userRecord.lastPromptDate = new Date();
    }
    
    if (userRecord.promptsUsedToday >= 10) {
      return res.status(403).json({ 
        error: "Limit Reached", 
        answer: "You have reached your daily limit of 10 prompts on the free plan. Please upgrade to premium or try again tomorrow." 
      });
    }
    
    userRecord.promptsUsedToday += 1;
    await userRecord.save().catch(e => console.error("Error saving user limits:", e));
  }

  try {
    let result;
    
    let chatRecord;
    if (isDbConnected && userId && chatId) {
      chatRecord = await Chat.findOne({ _id: chatId, userId });
    }

    if (ai.isImageRequest(question) && !req.file) {
      const imageUrl = await ai.generateTogetherImage(question, process.env.TOGETHER_API_KEY);
      result = { answer: `**Designed for you:**\n\n*Prompt: ${question}*`, imageUrl, isImage: true };
    } else if (req.file) {
      const answer = await ai.analyzeImage(req.file.path, req.file.mimetype, question, process.env.GEMINI_API_KEY);
      fs.unlinkSync(req.file.path);
      result = { answer };
    } else {
      const wantsDetail = ["detail", "depth", "step by step"].some(k => question.toLowerCase().includes(k));
      const systemInstruction = wantsDetail
        ? "You are Floak, a helpful AI tutor. Provide a detailed explanation."
        : "You are Floak, a student-friendly AI. Keep it brief.";

      let dynamicConversation = [];
      if (chatRecord && chatRecord.messages) {
        const previousMessages = chatRecord.messages.slice(-5);
        previousMessages.forEach(msg => {
          dynamicConversation.push({ role: "user", content: msg.prompt });
          if (msg.response) {
            dynamicConversation.push({ role: "assistant", content: msg.response });
          }
        });
      }
      
      dynamicConversation.push({ role: "user", content: question });

      const response = await ai.getChatResponse(dynamicConversation, question, systemInstruction, {
        GROQ: process.env.GROQ_API_KEY,
        GEMINI: process.env.GEMINI_API_KEY
      });
      result = { answer: response.answer };
    }

    if (isDbConnected && userId && result.answer) {
      if (chatRecord) {
        chatRecord.messages.push({
          prompt: question,
          response: result.answer,
          isImage: !!result.isImage,
          imageUrl: result.imageUrl || null
        });
        chatRecord.updatedAt = new Date();
        await chatRecord.save().catch(e => console.error("Error updating chat:", e));
      } else {
        const titleText = question.substring(0, 40) + (question.length > 40 ? "..." : "");
        chatRecord = new Chat({
          userId,
          title: titleText || "New Chat",
          messages: [{
            prompt: question,
            response: result.answer,
            isImage: !!result.isImage,
            imageUrl: result.imageUrl || null
          }]
        });
        await chatRecord.save().catch(e => console.error("Error saving new chat:", e));
      }
      
      result.chatId = chatRecord._id;
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Solve error detailed:", err);
    res.status(500).json({ error: "Failed to generate answer", details: err.message });
  }
});

app.get("/api/chats", authenticateToken, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({ updatedAt: -1, createdAt: -1 }).limit(20);
    
    // Map chats to include title and ensure messages structure for old chats
    const formattedChats = chats.map(chat => {
      const title = chat.title || chat.prompt || "Chat Session";
      const messages = (chat.messages && chat.messages.length > 0) ? chat.messages : [{
        prompt: chat.prompt,
        response: chat.response,
        isImage: chat.isImage,
        imageUrl: chat.imageUrl
      }];
      return { _id: chat._id, title, messages };
    });

    res.json(formattedChats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

app.delete("/api/chats/:id", authenticateToken, async (req, res) => {
  try {
    await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

app.get("/proxy-image", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send("No URL provided");
  try {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).send("Error downloading image.");
  }
});

app.listen(PORT, () => {
  console.log(`Floak AI running on port ${PORT}`);
});
