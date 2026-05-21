import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";

// Models
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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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

// In-memory conversation removed in favor of db-backed session tracking

// ======================
// CHAT ROUTES
// ======================

app.post("/reset", (req, res) => {
  res.json({ ok: true });
});

app.post("/solve", upload.single("image"), async (req, res) => {
  const question = req.body.prompt?.trim() || "Explain clearly.";
  const chatId = req.body.chatId;

  try {
    let result;
    
    let chatRecord;
    if (isDbConnected && chatId) {
      chatRecord = await Chat.findOne({ _id: chatId });
    }

    if (ai.isImageRequest(question) && !req.file) {
      const refinedPrompt = await ai.getRefinedImagePrompt(question, process.env.GEMINI_API_KEY);
      const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(refinedPrompt)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 1000000)}`;
      result = { answer: `**Designed for you:**\n\n*Prompt: ${refinedPrompt}*`, imageUrl, isImage: true };
    } else if (req.file) {
      const answer = await ai.analyzeImage(req.file.path, req.file.mimetype, question, process.env.GEMINI_API_KEY);
      fs.unlinkSync(req.file.path);
      result = { answer };
    } else {
      const wantsDetail = ["detail", "depth", "step by step"].some(k => question.toLowerCase().includes(k));
      const systemInstruction = wantsDetail
        ? "You are Shniro, a helpful AI tutor. Provide a detailed explanation."
        : "You are Shniro, a student-friendly AI. Keep it brief.";

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

    if (isDbConnected && result.answer) {
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

app.get("/api/chats", async (req, res) => {
  try {
    const chats = await Chat.find().sort({ updatedAt: -1, createdAt: -1 }).limit(20);
    
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

app.delete("/api/chats/:id", async (req, res) => {
  try {
    await Chat.findOneAndDelete({ _id: req.params.id });
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
  console.log(`🚀 Shniro AI running on port ${PORT}`);
});
