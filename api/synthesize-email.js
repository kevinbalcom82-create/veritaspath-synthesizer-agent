/**
 * Email Synthesizer - Vercel Serverless Function
 * 
 * This module implements a two-step AI orchestration workflow:
 * 1. STEP A: Gemini Pro analyzes email threads to extract summaries, action items, and sentiment
 * 2. STEP B: Claude refines the analysis into a professional executive email draft
 * 
 * @module api/synthesize-email
 */

// Import required SDKs for AI service integration
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

/**
 * Vercel Serverless Function: /api/synthesize-email
 * 
 * Endpoint: POST /api/synthesize-email
 * 
 * Orchestrates a sequential, two-step AI process:
 * 1. Gemini Pro (The Planner) - Analyzes the email thread and extracts:
 *    - Core issue summary (single sentence)
 *    - All action items required by the recipient (numbered list)
 *    - Sentiment classification (Positive, Neutral, or Urgent)
 * 
 * 2. Claude (The Refiner) - Takes Gemini's raw analysis and creates:
 *    - A formal, concise executive email draft (under 100 words)
 *    - Acknowledges the summary, confirms action items, and requests deadline
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing the email thread
 * @param {string} req.body.full_email_thread - The complete text of the email thread to analyze
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} JSON response with status, sentiment, executive_draft, and full_analysis
 */
module.exports = async (req, res) => {
  // Log function invocation start for debugging in Vercel logs
  console.log('[synthesize-email] Function invoked');
  console.log('[synthesize-email] Environment check - GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'MISSING');
  console.log('[synthesize-email] Environment check - CLAUDE_API_KEY:', process.env.CLAUDE_API_KEY ? 'SET' : 'MISSING');
  console.log('[synthesize-email] Request method:', req.method);
  console.log('[synthesize-email] Request body type:', typeof req.body);

  // ============================================
  // CORS Configuration
  // ============================================
  // Set CORS headers to allow cross-origin requests
  // In production, consider restricting to specific origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS requests for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ============================================
  // Request Method Validation
  // ============================================
  // Only allow POST requests - this is a write operation that processes data
  // Explicitly check for POST method to prevent unauthorized access
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    // ============================================
    // Environment Variable Validation
    // ============================================
    // Ensure both API keys are configured before proceeding
    // These should be set in Vercel dashboard or .env.local for local development
    // SECURITY: No fallback values - fail fast if keys are missing
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    if (!process.env.CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY environment variable is not set');
    }

    // ============================================
    // Request Body Validation (Essential for Security)
    // ============================================
    // First, verify that req.body exists (prevents errors if body parser fails)
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body. Expected JSON object with full_email_thread property.'
      });
    }

    // Extract and validate the email thread from request body
    const { full_email_thread } = req.body;

    // Validate that full_email_thread exists, is a string, and is not empty
    if (!full_email_thread || typeof full_email_thread !== 'string' || full_email_thread.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request body. Expected: {"full_email_thread": "..."} (non-empty string)'
      });
    }

    // ============================================
    // STEP A: Gemini Pro - The Planner
    // ============================================
    let fullAnalysis;
    let sentiment = 'Neutral'; // Default fallback value

    try {
      console.log('[synthesize-email] Starting Gemini Pro analysis');

      // Initialize Google Generative AI client with API key from environment
      // SECURITY: API key loaded ONLY from process.env - no hardcoded values
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      
      // Get the Gemini Pro model instance
      // Using 'gemini-pro' model for strategic analysis and extraction
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // Construct the prompt for Gemini to analyze the email thread
      // The prompt instructs Gemini to:
      // 1. Extract and summarize the core issue in one sentence
      // 2. List all action items in a numbered format
      // 3. Determine sentiment (Positive, Neutral, or Urgent)
      const geminiPrompt = `Act as a strategic analyst. Read the full email thread provided. First, extract and summarize the thread's core issue into a single sentence. Second, list all action items required by the recipient in a numbered list. Third, determine the sentiment (Positive, Neutral, Urgent) and output only the word.

Email thread:
${full_email_thread}

Please provide your analysis in the following format:
Summary: [single sentence summary]
Action Items:
1. [first action item]
2. [second action item]
...
Sentiment: [Positive/Neutral/Urgent]`;

      // Call Gemini API to generate content based on the prompt
      const geminiResult = await model.generateContent(geminiPrompt);
      const geminiResponse = await geminiResult.response;
      
      // Extract the full text analysis from Gemini's response
      // This contains the summary, action items, and sentiment
      fullAnalysis = geminiResponse.text();

      // Extract sentiment from Gemini's response using regex pattern matching
      // Default to 'Neutral' if sentiment cannot be extracted
      const sentimentMatch = fullAnalysis.match(/Sentiment:\s*(Positive|Neutral|Urgent)/i);
      if (sentimentMatch) {
        // Capitalize first letter and lowercase the rest for consistent formatting
        sentiment = sentimentMatch[1].charAt(0).toUpperCase() + sentimentMatch[1].slice(1).toLowerCase();
      }

      console.log('[synthesize-email] Gemini Pro analysis completed successfully');

    } catch (geminiError) {
      // Handle Gemini API failures with descriptive error message
      console.error('[synthesize-email] Gemini Pro API error:', geminiError);
      
      return res.status(500).json({
        status: 'error',
        message: 'Gemini analysis failed due to API error. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? geminiError.message : undefined
      });
    }

    // ============================================
    // STEP B: Claude - The Refiner
    // ============================================
    let executiveDraft;

    try {
      console.log('[synthesize-email] Starting Claude refinement');

      // Initialize Anthropic Claude client with API key from environment
      // SECURITY: API key loaded ONLY from process.env - no hardcoded values
      const anthropic = new Anthropic({
        apiKey: process.env.CLAUDE_API_KEY,
      });

      // Construct the prompt for Claude to refine Gemini's analysis
      // Claude acts as an Executive Assistant to create a professional email draft
      // The prompt instructs Claude to:
      // 1. Write a formal, concise email (under 100 words)
      // 2. Acknowledge the summary
      // 3. Confirm the listed action items
      // 4. Politely request a deadline for the most urgent item
      // 5. Output only the email body (no pre-amble or post-amble)
      const claudePrompt = `Act as a meticulous Executive Assistant. Based on the provided raw AI analysis, write a formal, concise email draft (under 100 words) for the executive to send to the sender. The email should acknowledge the summary, confirm the listed action items, and politely request a deadline for the most urgent item. Do not include any pre-amble or post-amble. Output only the body of the email draft.

Raw AI Analysis:
${fullAnalysis}`;

      // Call Claude API to generate the executive email draft
      // Using Claude 3.5 Sonnet model for high-quality text generation
      const claudeMessage = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307', // Latest Claude 3.5 Sonnet model
        max_tokens: 500, // Sufficient for a concise email draft
        messages: [
          {
            role: 'user',
            content: claudePrompt
          }
        ]
      });

      // Extract Claude's response text from the message content
      // Claude returns content as an array of blocks, filter for text blocks only
      executiveDraft = claudeMessage.content
        .filter(block => block.type === 'text') // Only process text content blocks
        .map(block => block.text) // Extract text from each block
        .join('\n') // Join multiple text blocks with newlines
        .trim(); // Remove leading/trailing whitespace

      console.log('[synthesize-email] Claude refinement completed successfully');

    } catch (claudeError) {
      // Handle Claude API failures with descriptive error message
      console.error('[synthesize-email] Claude API error:', claudeError);
      
      return res.status(500).json({
        status: 'error',
        message: 'Claude refinement failed due to API error. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? claudeError.message : undefined
      });
    }

    // ============================================
    // Return Success Response
    // ============================================
    // Return the final JSON response with all required fields:
    // - status: Success indicator
    // - sentiment: Extracted sentiment from Gemini (Positive/Neutral/Urgent)
    // - executive_draft: Claude's refined email draft
    // - full_analysis: Complete Gemini analysis for reference
    console.log('[synthesize-email] Function completed successfully');

    return res.status(200).json({
      status: 'success',
      sentiment: sentiment,
      executive_draft: executiveDraft,
      full_analysis: fullAnalysis
    });

  } catch (error) {
    // ============================================
    // Global Error Handling
    // ============================================
    // Catch any unexpected errors not handled by specific try-catch blocks
    // Log the error for debugging (visible in Vercel function logs)
    console.error('[synthesize-email] Unexpected error:', error);

    // Return appropriate error response
    // Include error details in development mode for debugging
    // Hide stack traces in production for security
    return res.status(500).json({
      status: 'error',
      message: error.message || 'An unexpected error occurred during email synthesis',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
