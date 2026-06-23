import fetch from "node-fetch";
import fs from "fs";

export const GROQ_MODEL = "llama-3.1-8b-instant";
export const GEMINI_MODEL = "gemini-2.0-flash";

/**
 * Detects if the user wants an image
 */
export function isImageRequest(question) {
    const lower = question.toLowerCase();
    // Use regex to catch phrases with intermediate words like "generate a car image"
    return /generate.*image|create.*image|draw|make.*image|show.*image|paint/i.test(lower);
}

/**
 * Refines a user prompt into a high-quality image prompt using Gemini
 */
export async function getRefinedImagePrompt(question, apiKey) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: `The user wants to generate an image: "${question}". Create a highly detailed, 1-sentence prompt for an image generator. IMPORTANT: Only output the plain text prompt string, NO JSON, NO markdown. Just the prompt text.` }]
                }]
            })
        }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Gemini Refiner failed");

    let prompt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || question;
    
    // Clean JSON or markdown if present
    let clean = prompt.replace(/^```json\s*|```\s*$/g, "").trim();
    if (clean.startsWith("{")) {
        try {
            const parsed = JSON.parse(clean);
            prompt = parsed.prompt || parsed.action_input?.prompt || parsed.action_input || prompt;
        } catch (e) { /* ignore */ }
    }
    return prompt;
}

/**
 * Generates an image using Together AI
 */
export async function generateTogetherImage(prompt, apiKey) {
    const res = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "black-forest-labs/FLUX.1-schnell-Free",
            prompt: prompt,
            steps: 4,
            n: 1,
            response_format: "b64_json"
        })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Together AI Image Generation failed");

    if (data.data && data.data[0] && data.data[0].b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
    } else if (data.data && data.data[0] && data.data[0].url) {
        return data.data[0].url;
    }
    throw new Error("No image data returned from Together AI");
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

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

/**
 * Sends a text request to Groq or fallback to Gemini
 */
export async function getChatResponse(conversation, question, systemInstruction, keys) {
    // 1. Try Groq
    try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${keys.GROQ}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: "system", content: systemInstruction }, ...conversation],
                temperature: 0.3
            })
        });

        if (groqRes.ok) {
            const data = await groqRes.json();
            return { answer: data.choices[0].message.content, source: "groq" };
        }
    } catch (err) {
        console.error("Groq Error:", err.message);
    }

    // 2. Fallback to Gemini
    const formattedContents = conversation.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
    }));

    const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${keys.GEMINI}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: formattedContents
            })
        }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
        if (data.error?.code === 429 || data.error?.message?.toLowerCase().includes("quota")) {
            return { answer: "Floak is currently taking a short breath (Quota limit). Please try again in 1 minute!", source: "gemini" };
        }
        throw new Error(data.error?.message || "Gemini Fallback failed");
    }

    return { 
        answer: data?.candidates?.[0]?.content?.parts?.[0]?.text || "AI unavailable.",
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
export async function generateQuiz(topic, keys, count = 5) {
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
        userPrompt,
        systemInstruction,
        keys
    );

    return normalizeQuiz(extractJson(response.answer), topic);
}
