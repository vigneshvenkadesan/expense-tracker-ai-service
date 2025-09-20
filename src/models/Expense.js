const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    category: { type: String, required: true },
    date: { type: Date, required: true }, // ISO string or dd/mm/yyyy
    insertTimestamp: { type: Date, default: () => new Date() },
    paymentMethod: { type: String },
    reason: { type: String },
    type: { type: String },
    userId: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports =  mongoose.model("Expense", expenseSchema, "expenses_clean");
