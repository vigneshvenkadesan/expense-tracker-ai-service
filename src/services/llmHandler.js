require("dotenv").config();
const axios = require("axios");
const JSON5 = require("json5");

class LLMHandler {
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

    const llmResponse =  result.candidates[0].content.parts
      .map((p) => p.text)
      .join(" ")
      .trim();

       const cleaned = llmResponse
        .replace(/```json/i, "")
        .replace(/```/g, "")
        .trim();
      return JSON5.parse(cleaned);
  }
}
module.exports = new  LLMHandler();

