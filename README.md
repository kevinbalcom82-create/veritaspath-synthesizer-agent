# Email Synthesizer - Vercel Serverless Function

A Vercel serverless function that orchestrates a two-step AI process to analyze email threads and generate executive email drafts.

## Overview

This function uses:
- **Gemini Pro** (Google GenAI) to analyze email threads and extract summaries, action items, and sentiment
- **Claude** (Anthropic) to refine the analysis into a formal executive email draft

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file (for local development) or set these in your Vercel project settings:

```
GEMINI_API_KEY=your_gemini_api_key_here
CLAUDE_API_KEY=your_claude_api_key_here
```

### 3. Deploy to Vercel

```bash
vercel deploy
```

Or connect your GitHub repository to Vercel for automatic deployments.

## API Endpoint

**URL:** `/api/synthesize-email`  
**Method:** `POST`  
**Content-Type:** `application/json`

### Request Body

```json
{
  "full_email_thread": "The complete, long text of the email thread."
}
```

### Response

**Success (200):**
```json
{
  "status": "success",
  "sentiment": "Urgent",
  "executive_draft": "Thank you for bringing this to my attention...",
  "full_analysis": "Summary: [summary]\nAction Items:\n1. [item]\n...\nSentiment: Urgent"
}
```

**Error (400/500):**
```json
{
  "status": "error",
  "message": "Error description"
}
```

## Local Development

```bash
npm run dev
```

This will start the Vercel development server at `http://localhost:3000`

## Testing

You can test the endpoint using curl:

```bash
curl -X POST http://localhost:3000/api/synthesize-email \
  -H "Content-Type: application/json" \
  -d '{"full_email_thread": "Your email thread text here"}'
```

## Notes

- The function has a maximum duration of 60 seconds (configured in `vercel.json`)
- CORS is enabled for all origins (adjust in production if needed)
- The function uses Claude 3.5 Sonnet model - you can change this in the code if needed

