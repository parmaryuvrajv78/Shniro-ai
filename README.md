# Floak AI Solver

Floak is a professional, student-friendly AI assistant designed for solving academic problems and generating high-quality educational images.

## Features
- **AI Problem Solving**: Powered by Groq (Llama 3) for lightning-fast text responses.
- **Image Analysis**: Powered by Gemini 2.0 Flash for accurate image-to-text conversion.
- **AI Image Generation**: Automated prompt refinement via Gemini and rendering via Pollinations.
- **Smart Response Depth**: Automatically adjusts between concise and detailed answers.
- **Professional UI**: Responsive design with glassmorphism effects and skeleton loaders.

## Tech Stack
- **Backend**: Node.js, Express, Multer
- **Frontend**: Vanilla JS, CSS3, HTML5, Marked (Markdown), KaTeX (Math)
- **APIs**: Groq Cloud, Google Generative AI (Gemini), Pollinations AI

## Deployment Instructions

### 1. Prerequisites
- Node.js installed on your server.
- API Keys for **Groq** and **Gemini**.

### 2. Setup
1. Clone the repository.
2. Navigate to the `backend` folder.
3. Run `npm install` to install dependencies.
4. Create a `.env` file based on the environment variables needed.

### 3. Environment Variables
```env
PORT=3000
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
```

### 4. Running the App
- **Development**: `npm start`
- **Production**: Use a process manager like **PM2**: `pm2 start server.js --name floak-ai`

## Project Structure
- `/public`: Frontend assets (HTML, CSS, JS, Icons).
- `/utils`: Backend utility services (AI logic).
- `/uploads`: Temporary directory for image processing.
- `server.js`: Main entry point.

---
(c) 2026 Floak AI Team
