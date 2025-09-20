const JSON5 = require("json5");
require("dotenv").config();
const axios = require("axios");

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

    return result.candidates[0].content.parts
      .map((p) => p.text)
      .join(" ")
      .trim();
  }

  async getMongoFilterFromLLM(question, systemPrompt) {
    try {
      const llmResponse = await this.queryLLM(
        `${systemPrompt}\n\nQuestion: ${question}`
      );
      const cleaned = llmResponse
        .replace(/```json/i, "")
        .replace(/```/g, "")
        .trim();
      return JSON5.parse(cleaned);
    } catch (err) {
      return { error: "Failed to parse LLM output or call LLM" };
    }
  }

  // Assuming you are using your existing MongoQueryHandler class
  async summarizeResults(question, results, searchTerm = null) {
    if (!results || !results.length) {
      return {
        summary: "No data available to summarize.",
        totalSpending: 0,
        averagePerDay: 0,
        averagePerCategory: {},
        topCategories: [],
        topPaymentMethods: [],
        highestExpense: null,
        insights: [],
      };
    }

    // Step 1: Pre-filter results by searchTerm (if provided)
    let filteredResults = results;
    if (searchTerm) {
      filteredResults = results.filter((item) =>
        item.reason.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (!filteredResults.length) {
      return {
        summary: `No expenses found matching "${searchTerm}".`,
        totalSpending: 0,
        averagePerDay: 0,
        averagePerCategory: {},
        topCategories: [],
        topPaymentMethods: [],
        highestExpense: null,
        insights: [],
      };
    }

    // Step 2: Prepare JSON-friendly prompt
    const prompt = `You are a financial data analyst AI. 
You will summarize only the provided dataset. 
Do NOT include or invent information about any entries not present in the dataset.

Add everything in summary along with the below structure
Return a JSON object with:
- summary
- totalSpending
- averagePerDay
- averagePerCategory
- topCategories
- topPaymentMethods
- highestExpense
- insights

Data: ${JSON.stringify(filteredResults, null, 2)}
User Question: ${question}`;

    // Step 3: Call LLM
    try {
      const rawSummary = await this.queryLLM(prompt);
let cleaned = rawSummary
  .replace(/```json/i, "") // remove ```json
  .replace(/```/g, "")     // remove ```
  .replace(/^\s*[\r\n]+/, "") // remove leading newlines
  .trim();

      // Step 4: Parse output safely
      let jsonSummary;
      try {
        jsonSummary = JSON5.parse(cleaned);
      } catch (err) {
        // Fallback: minimal UI-friendly structure
        jsonSummary = {
          summary: cleaned,
          totalSpending: 0,
          averagePerDay: 0,
          averagePerCategory: {},
          topCategories: [],
          topPaymentMethods: [],
          highestExpense: null,
          insights: [],
        };
      }

      return jsonSummary;
    } catch (err) {
      return {
        summary: "Failed to generate summary.",
        totalSpending: 0,
        averagePerDay: 0,
        averagePerCategory: {},
        topCategories: [],
        topPaymentMethods: [],
        highestExpense: null,
        insights: [],
      };
    }
  }
}

module.exports = MongoQueryHandler;
