// api/qa.js
import mongoose from "mongoose";
import fetch from "node-fetch";
import JSON5 from "json5";
import Cors from "cors";

// Initialize CORS middleware
const cors = Cors({
  origin: ["http://localhost:4200", "https://spendora-app.netlify.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
});

// Helper to run middleware in Vercel serverless
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI;

const ExpenseSchema = new mongoose.Schema({
  amount: Number,
  reason: String,
  category: String,
  date: String, // "dd/mm/yyyy"
  insertTimestamp: Date,
  paymentMethod: String,
  type: String,
  userId: String,
});

const Expense =
  mongoose.models.Expense || mongoose.model("expenses", ExpenseSchema);

async function dbConnect() {
  if (mongoose.connection.readyState >= 1) return;
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
}

// --- Helper to replace current month placeholders ---
function replaceCurrentMonthPlaceholders(obj) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const jsonStr = JSON.stringify(obj)
    .replace(/%Y/g, year)
    .replace(/%m/g, month)
    .replace(/%d/g, day);

  return JSON.parse(jsonStr);
}

// --- Inject userId into all queries ---
function injectUserId(filterOrAgg, userId) {
  if (Array.isArray(filterOrAgg)) {
    // Aggregation pipeline
    const matchStage = filterOrAgg.find((stage) => stage.$match);
    if (matchStage) {
      matchStage.$match.userId = userId;
    } else {
      filterOrAgg.unshift({ $match: { userId } });
    }
    return filterOrAgg;
  } else {
    // Normal filter query
    return { $and: [filterOrAgg, { userId }] };
  }
}

// --- LLM Query Handler ---
class MongoQueryHandler {
  constructor() {
    this.GEMINI_ENDPOINT =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    this.API_KEY = process.env.GOOGLE_API_KEY;
  }

  async queryLLM(prompt) {
    const data = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await fetch(this.GEMINI_ENDPOINT, {
      headers: {
        "X-goog-api-key": this.API_KEY,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!result.candidates?.length)
      throw new Error("No candidates returned from Gemini API");
    return result.candidates[0].content.parts.map((p) => p.text).join(" ").trim();
  }

  async getMongoFilterFromLLM(question, systemPrompt) {
    try {
      const llmResponse = await this.queryLLM(
        `${systemPrompt}\n\nQuestion: ${question}`
      );

      // --- Safer JSON extraction ---
      let cleaned = llmResponse
        .replace(/```json/i, "")
        .replace(/```/g, "")
        .trim();

      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }

      let parsed;
      try {
        parsed = JSON5.parse(cleaned);
      } catch (e) {
        console.error("❌ JSON parse error. Raw LLM response:", llmResponse);
        throw new Error("Failed to parse LLM output");
      }

      if (parsed.find && parsed.filter) return parsed.filter;
      if (parsed.aggregate) return parsed.aggregate;
      return parsed;
    } catch (err) {
      return { error: "Failed to parse LLM output or call LLM" };
    }
  }

  async summarizeResults(question, results) {
    if (!results || !results.length) return "No data available to summarize.";

    // Try to detect date range for per-day average
    let startDate, endDate, numDays = null;
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/g;
    const matches = question.match(dateRegex);
    if (matches && matches.length >= 2) {
      startDate = matches[0];
      endDate = matches[1];
      const [sd, sm, sy] = startDate.split("/").map(Number);
      const [ed, em, ey] = endDate.split("/").map(Number);
      const d1 = new Date(sy, sm - 1, sd);
      const d2 = new Date(ey, em - 1, ed);
      numDays = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
    }

    let total = 0;
    let max = 0;
    let categories = {};
    results.forEach((r) => {
      if (r.amount) {
        total += r.amount;
        if (r.amount > max) max = r.amount;
      }
      if (r.category) {
        categories[r.category] = (categories[r.category] || 0) + r.amount;
      }
    });

    const avgPerItem = results.length ? (total / results.length).toFixed(2) : 0;
    const avgPerDay = numDays ? (total / numDays).toFixed(2) : null;

    let summary = `Total spent: ₹${total}. Highest single expense: ₹${max}. Average per item: ₹${avgPerItem}.`;
    if (avgPerDay) summary += ` Average per day (based on date range): ₹${avgPerDay}.`;

    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
    if (topCategory) {
      summary += ` Top category: ${topCategory[0]} (₹${topCategory[1]}).`;
    }

    return summary;
  }
}

const handler = new MongoQueryHandler();

// --- Vercel Serverless Function ---
export default async function (req, res) {
  // Run CORS first
  await runMiddleware(req, res, cors);

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  await dbConnect();

  const { question, userId } = req.body;
  if (!question || !userId)
    return res.status(400).json({ error: "Question and userId are required" });

  const systemPrompt = `You are a MongoDB assistant.
Your task is to convert natural language questions into MongoDB queries.

Schema: 
- amount, reason, category, date ("dd/mm/yyyy"), paymentMethod, type, userId

Rules:
1. Filters: Always use $regex for reason, case-insensitive.
2. Aggregations: Use $group, $sum, $avg when needed.
3. Dates: 
   - Always in "dd/mm/yyyy".
   - If "current month" is asked, use placeholders "%Y", "%m", "%d".
   - If no explicit date range is mentioned, assume current month.
4. Output: ONLY valid JSON. Do not include explanations or text.

Examples:
Q: "Show milk expenses between 02/03/2025 and 17/09/2025"
A: {
  "$and": [
    { "reason": { "$regex": "milk", "$options": "i" } },
    { "date": { "$gte": "02/03/2025", "$lte": "17/09/2025" } }
  ]
}

Q: "Total spent per payment method this month"
A: [
  { "$match": { "date": { "$gte": "01/%m/%Y", "$lte": "%d/%m/%Y" } } },
  { "$group": { "_id": "$paymentMethod", "total": { "$sum": "$amount" } } }
]`;

  try {
    let filter = await handler.getMongoFilterFromLLM(question, systemPrompt);
    console.log(filter)
    if (filter.error) return res.status(500).json(filter);

    filter = replaceCurrentMonthPlaceholders(filter);

    // ✅ Inject userId
    filter = injectUserId(filter, userId);

    let results = [];
    if (Array.isArray(filter)) {
      results = await Expense.aggregate(filter);
    } else {
      results = await Expense.find(filter);
    }

    // --- AI summarization step ---
    const summary = await handler.summarizeResults(question, results);
    console.log(summary)

    res.status(200).json({
      answer: results.length
        ? "Expenses fetched successfully"
        : "No matching expenses found",
      summary,
      results,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to process request", details: err.message });
  }
}
