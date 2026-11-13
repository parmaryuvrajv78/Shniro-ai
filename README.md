# Floak AI

Floak is a student-friendly AI workspace for academic questions, image analysis, image generation, quizzes, and saved conversations. All generative AI features use the Google Gemini API.

## Features

- Text chat and conversation history powered by Gemini 3.8 Flash.
- Image question analysis powered by Gemini 3.8 Flash.
- Prompt-based image generation powered by Gemini 3.1 Flash Image.
- Topic quiz generation powered by Gemini.
- Authentication, saved chats, and optional image attachments.

## Tech stack

- Node.js and Express
- Vanilla JavaScript, HTML, and CSS
- MongoDB and Mongoose
- Google Gemini API

## Setup

1. Install Node.js.
2. Run `npm install` in the `backend` directory.
3. Copy `.env.example` to `.env` and add a valid `GEMINI_API_KEY`, MongoDB URI, and JWT secret.
4. Start the app with `npm start`.

## Environment variables

```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key
MONGODB_URI=mongodb://username:password@host:port/floak_solver
JWT_SECRET=your_strong_random_secret
```

## Project structure

- `public/`: Frontend pages and assets
- `utils/aiService.js`: Gemini chat, image, and quiz requests
- `models/`: MongoDB models
- `server.js`: Express server and API routes
