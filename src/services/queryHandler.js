const JSON5 = require("json5");
require("dotenv").config();
const axios = require("axios")

class MongoQueryHandler {
  constructor() {
    this.GEMINI_ENDPOINT =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    this.API_KEY = process.env.GOOGLE_API_KEY;
  }

  async queryLLM(prompt) {
     const data = { contents: [{ parts: [{ text: prompt }] }] };

    const response = await axios.post(this.GEMINI_ENDPOINT, data, {
      headers: {
        "X-goog-api-key": this.API_KEY,
        "Content-Type": "application/json",
      },
    });

    const result = await response.data;
    if (!result.candidates?.length)
      throw new Error("No candidates returned from Gemini API");

    return result.candidates[0].content.parts.map((p) => p.text).join(" ").trim();
  }

  async getMongoFilterFromLLM(question, systemPrompt) {
    try {
      const llmResponse = await this.queryLLM(`${systemPrompt}\n\nQuestion: ${question}`);
      const cleaned = llmResponse.replace(/```json/i, "").replace(/```/g, "").trim();
      return JSON5.parse(cleaned);
    } catch (err) {
      return { error: "Failed to parse LLM output or call LLM" };
    }
  }

  async summarizeResults(question, results) {
    if (!results || !results.length) return "No data available to summarize.";

    const prompt = `You are a financial data analyst AI. 
Your task is to summarize and extract insights from MongoDB expense query results.

Context:
- User asked: "${question}"
- Data format: ${JSON.stringify(results, null, 2)}

Instructions:
1. Start with a short plain-language summary of the results.
2. Calculate if applicable:
   - Total spending
   - Average per day (if date range given)
   - Average per category/item
   - Top categories/payment methods
   - Highest single expense
3. Highlight insights or anomalies (e.g., "Most expenses are via UPI").
4. Keep it clear, concise, and friendly for non-technical users.

Now, summarize:`;

    try {
      return await this.queryLLM(prompt);
    } catch (err) {
      return "Failed to generate summary.";
    }
  }
}

module.exports = MongoQueryHandler;
