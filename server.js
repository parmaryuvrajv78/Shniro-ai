import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const upload = multer({ dest: "uploads/" });

const GROQ_MODEL = "llama-3.1-8b-instant";
const GEMINI_MODEL = "gemini-2.5-flash";

let conversation = [];
let lastRequestTime = 0;

// ======================
app.post("/solve", upload.single("image"), async (req, res) => {
  const now = Date.now();
  if (now - lastRequestTime < 1200) {
    return res.json({ answer: "⏳ Please slow down a little 🙂" });
  }
  lastRequestTime = now;

  const question = req.body.prompt?.trim() || "Explain clearly.";

  conversation.push({ role: "user", content: question });
  if (conversation.length > 6) conversation.shift();

  try {
    // IMAGE → GEMINI
    if (req.file) {
      const imageBuffer = fs.readFileSync(req.file.path);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: req.file.mimetype,
                    data: imageBuffer.toString("base64")
                  }
                },
                { text: question }
              ]
            }]
          })
        }
      );

      fs.unlinkSync(req.file.path);

      const data = await response.json();
      const answer =
        data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n\n");

      return res.json({ answer });
    }

    // TEXT → GROQ
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: conversation,
          temperature: 0.3
        })
      }
    );

    if (groqRes.ok) {
      const data = await groqRes.json();
      const answer = data.choices[0].message.content;
      conversation.push({ role: "assistant", content: answer });
      return res.json({ answer });
    }

    // FALLBACK → GEMINI TEXT
    const geminiFallback = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: question }]
          }]
        })
      }
    );

    const geminiData = await geminiFallback.json();
    const answer =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ AI unavailable.";

    res.json({ answer });

  } catch (err) {
    console.error(err);
    res.json({ answer: "❌ Server error." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Shniro AI running on port ${PORT}`);
});
