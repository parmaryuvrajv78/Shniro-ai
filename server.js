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

// Explicit Routes
app.get("/", (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.redirect("/auth.html");
  }
  // Optional: You could verify the token here too, 
  // but a simple cookie presence check is usually enough for the initial redirect.
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/auth.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "auth.html"));
});

// MongoDB Connection Management
let isDbConnected = false;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/shniro_solver";

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

// In-memory conversation (fallback)
let conversation = [];

// ======================
// AUTH ROUTES
// ======================

app.post("/api/auth/signup", async (req, res) => {
  console.log("📥 Signup attempt:", req.body.email);
  if (!isDbConnected) {
    console.error("❌ Signup failed: Database not connected");
    return res.status(503).json({ error: "Database offline. Please check connectivity or Atlas IP whitelist." });
  }
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.warn("⚠️ Signup failed: User already exists", email);
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const user = new User({ username, email, password });
    await user.save();
    console.log("✅ User created successfully:", email);
    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("🔥 Signup error:", err);
    res.status(500).json({ error: "Server error during signup" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  console.log("📥 Login attempt:", req.body.email);
  if (!isDbConnected) {
    console.error("❌ Login failed: Database not connected");
    return res.status(503).json({ error: "Database offline. Please check connectivity or Atlas IP whitelist." });
  }
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      console.warn("⚠️ Login failed: Invalid credentials for", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "shniro_secret", { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    console.log("✅ Login successful:", email);
    res.json({ message: "Login successful", user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("🔥 Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    
    // If DB is offline, we can't verify the user fully, but we shouldn't crash
    if (!isDbConnected) {
      return res.status(503).json({ error: "DB Offline" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "shniro_secret");
    const user = await User.findById(decoded.userId).select("-password");
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: "Invalid session" });
  }
});

// ======================
// CORE LOGIC
// ======================

app.post("/reset", (req, res) => {
  conversation = [];
  res.json({ ok: true });
});

app.post("/solve", upload.single("image"), async (req, res) => {
  const question = req.body.prompt?.trim() || "Explain clearly.";
  let userId = null;

  // Check if user is logged in
  try {
    const token = req.cookies.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "shniro_secret");
      userId = decoded.userId;
    }
  } catch (e) {}

  try {
    let result;

    // 1. Image Generation
    if (ai.isImageRequest(question) && !req.file) {
      const refinedPrompt = await ai.getRefinedImagePrompt(question, process.env.GEMINI_API_KEY);
      const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(refinedPrompt)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}`;
      result = { answer: `**Designed for you:**\n\n*Prompt: ${refinedPrompt}*`, imageUrl, isImage: true };
    } 
    // 2. Image Analysis
    else if (req.file) {
      const answer = await ai.analyzeImage(req.file.path, req.file.mimetype, question, process.env.GEMINI_API_KEY);
      fs.unlinkSync(req.file.path);
      result = { answer };
    } 
    // 3. Text Chat
    else {
      const wantsDetail = ["detail", "depth", "step by step"].some(k => question.toLowerCase().includes(k));
      const systemInstruction = wantsDetail
        ? "You are Shniro, a helpful AI tutor. Provide a detailed explanation."
        : "You are Shniro, a student-friendly AI. Keep it brief.";

      conversation.push({ role: "user", content: question });
      if (conversation.length > 10) conversation.shift();

      const response = await ai.getChatResponse(conversation, question, systemInstruction, {
        GROQ: process.env.GROQ_API_KEY,
        GEMINI: process.env.GEMINI_API_KEY
      });
      conversation.push({ role: "assistant", content: response.answer });
      result = { answer: response.answer };
    }

    // ✅ SAVE TO MONGODB (if connected and user logged in)
    if (isDbConnected && userId && result.answer) {
      const newChat = new Chat({
        userId,
        prompt: question,
        response: result.answer,
        isImage: !!result.isImage,
        imageUrl: result.imageUrl || null
      });
      await newChat.save().catch(e => console.error("Error saving chat:", e));
    }

    res.json(result);

  } catch (err) {
    console.error("Solve Error:", err);
    res.json({ answer: "Shniro is busy. Try again soon." });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Shniro AI running on port ${PORT}`);
});
