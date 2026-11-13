import fetch from "node-fetch";
import fs from "fs";

export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
// Gemini can take more than 15 seconds on cold starts or longer answers.
const PROVIDER_TIMEOUT_MS = 60000;

async function fetchWithTimeout(url, options = {}, timeoutMs = PROVIDER_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(`Gemini request timed out after ${timeoutMs / 1000} seconds`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function hasUsableKey(key) {
    return typeof key === "string" && key.trim().length > 20 && !key.includes("your_");
}

function createProviderError(message, statusCode = 502) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function isQuotaError(data) {
    const message = data?.error?.message?.toLowerCase() || "";
    return data?.error?.code === 429 || message.includes("quota") || message.includes("rate limit");
}

/**
 * Detects if the user wants an image
 */
export function isImageRequest(question) {
    const lower = question.toLowerCase();
    // Use regex to catch phrases with intermediate words like "generate a car image"
    return /generate.*image|create.*image|draw|make.*image|show.*image|paint/i.test(lower);
}

/** Generates an image with Gemini's image model. */
export async function generateGeminiImage(prompt, apiKey) {
    if (!hasUsableKey(apiKey)) {
        throw createProviderError("AI service is not configured. Add a valid GEMINI_API_KEY.", 503);
    }

    const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1/models/${GEMINI_IMAGE_MODEL}:generateContent`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
            })
        },
        60000
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = data.error?.message || "Gemini image generation failed.";
        if (isQuotaError(data)) throw createProviderError("Gemini image generation quota is temporarily exhausted. Try again later.", 429);
        throw createProviderError(message, res.status >= 500 ? 502 : res.status);
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(part => part.inlineData?.data || part.inline_data?.data);
    const imageData = imagePart?.inlineData || imagePart?.inline_data;
    if (!imageData?.data) throw createProviderError("Gemini did not return an image. Try a more specific image prompt.", 502);

    const mimeType = imageData.mimeType || imageData.mime_type || "image/png";
    const answer = parts.map(part => part.text).filter(Boolean).join("\n\n") || "Generated image";
    return { answer, imageUrl: `data:${mimeType};base64,${imageData.data}`, isImage: true };
}

/**
 * Analyzes an image using Gemini Vision
 */
export async function analyzeImage(imagePath, mimetype, question, apiKey) {
    const imageBuffer = fs.readFileSync(imagePath);
    
    const analysisPrompt = `You are Floak, a professional AI student assistant.
    Analyze the provided image and address the user's request: "${question}".
    
    Rules:
    - If the image contains a problem (math, science, etc.), solve it step-by-step.
    - If there are diagrams, explain them clearly.
    - Use KaTeX ($...$) for all mathematical expressions and formulas.
    - Format your response with clear headings and bullet points for readability.
    - If the image is unclear, ask for a better photo while providing what you can see.
    
    Be accurate, encouraging, and academic.`;

    const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [
                        { inlineData: { mimeType: mimetype, data: imageBuffer.toString("base64") } },
                        { text: analysisPrompt }
                    ]
                }]
            })
        }
    );

    const data = await res.json();
    if (!res.ok) {
        if (data.error?.code === 429 || data.error?.message?.toLowerCase().includes("quota")) {
            return "Floak's vision brain is currently busy (Limit reached). Please try again in a minute!";
        }
        console.error("Gemini Error:", JSON.stringify(data));
        throw new Error(data.error?.message || "Gemini Image Analysis failed");
    }

    const candidate = data?.candidates?.[0];
    if (!candidate) {
        return "I'm sorry, I couldn't analyze this image. It might be due to safety filters or the image was too complex.";
    }

    return candidate.content?.parts?.map(p => p.text).join("\n\n") || "No text could be extracted from this image.";
}

/** Sends a text request directly to Gemini. */
export async function getChatResponse(conversation, systemInstruction, apiKey) {
    if (!hasUsableKey(apiKey)) {
        throw createProviderError("AI service is not configured. Add a valid GEMINI_API_KEY.", 503);
    }

    const formattedContents = conversation.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
    }));

    const geminiRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: formattedContents
            })
        }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
        if (isQuotaError(data)) throw createProviderError("Gemini quota or rate limit reached. Try again later.", 429);
        throw createProviderError(data.error?.message || "Gemini request failed.", geminiRes.status >= 500 ? 502 : geminiRes.status);
    }

    return { 
        answer: data?.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join("\n\n") || "Gemini returned no text response.",
        source: "gemini"
    };
}

function extractJson(text) {
    const clean = (text || "").replace(/^```json\s*|```$/g, "").trim();
    try {
        return JSON.parse(clean);
    } catch (err) {
        const match = clean.match(/\{[\s\S]*\}/);
        if (!match) throw err;
        return JSON.parse(match[0]);
    }
}

function normalizeQuiz(rawQuiz, topic) {
    const questions = Array.isArray(rawQuiz?.questions) ? rawQuiz.questions : [];
    const normalized = questions.slice(0, 10).map((q, index) => {
        const options = Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [];
        const answerIndex = Number(q.answerIndex);
        return {
            question: String(q.question || `Question ${index + 1}`),
            options,
            answerIndex: Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length ? answerIndex : 0,
            explanation: String(q.explanation || "")
        };
    }).filter(q => q.options.length === 4);

    if (normalized.length < 3) {
        throw new Error("Quiz response did not contain enough valid questions");
    }

    return {
        topic: String(rawQuiz?.topic || topic),
        questions: normalized
    };
}

/**
 * Generates a multiple-choice quiz without storing it in the database.
 */
export async function generateQuiz(topic, apiKey, count = 5) {
    const safeCount = Math.min(Math.max(Number(count) || 5, 3), 10);
    const systemInstruction = "You create student-friendly multiple-choice quizzes. Return only valid JSON.";
    const userPrompt = `Create a ${safeCount}-question quiz for the topic "${topic}".
Return ONLY JSON in this exact shape:
{
  "topic": "Topic name",
  "questions": [
    {
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "answerIndex": 0,
      "explanation": "One short explanation"
    }
  ]
}
Rules: exactly 4 options per question, answerIndex must be 0-3, no markdown.`;

    const response = await getChatResponse(
        [{ role: "user", content: userPrompt }],
        systemInstruction,
        apiKey
    );

    return normalizeQuiz(extractJson(response.answer), topic);
}
