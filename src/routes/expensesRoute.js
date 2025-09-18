const express = require("express");
const dbConnect = require("../lib/dbConnect.js");
const Expense = require("../models/Expense.js");
const {
  injectCurrentMonthIfMissing,
  injectUserId,
  replaceCurrentMonthPlaceholders,
} = require("../utils/utils.js");
const MongoQueryHandler = require("../services/queryHandler.js");
const {  queryLLMPrompt } = require("../utils/constants.js");
const router = express.Router();
const handler = new MongoQueryHandler();

router.post("/query", async (req, res) => {
  await dbConnect();

  const { question, userId } = req.body;
  if (!question) return res.status(400).json({ error: "Question is required" });

  try {
    let filter = await handler.getMongoFilterFromLLM(question, queryLLMPrompt);

    // 1️⃣ Replace placeholders (if LLM used "%Y/%m/%d")
    filter = replaceCurrentMonthPlaceholders(filter);

    // 2️⃣ Inject current month if no date was returned
    filter = injectCurrentMonthIfMissing(filter);

    // 3️⃣ Inject userId
    filter = injectUserId(filter, userId);

    // 4️⃣ Run MongoDB query
    let results = [];
    if (Array.isArray(filter)) {
      results = await Expense.aggregate(filter);
    } else {
      results = await Expense.find(filter);
    }

    const summary = await handler.summarizeResults(question, results);

    res.status(200).json({
      answer: results.length
        ? "✅ Expenses fetched successfully"
        : "⚠️ No matching expenses found",
      summary
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to process request", details: err.message });
  }
});

module.exports = router;
