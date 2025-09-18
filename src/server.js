// server.js
const express = require("express");
const cors = require("cors");
const expenseRoutes = require("./routes/expensesRoute.js");
const dbConnect = require("./lib/dbConnect");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use("/api/expenses", expenseRoutes);

// Connect to MongoDB
dbConnect().catch(err => console.error("MongoDB connection error:", err));

// Export the app directly for Vercel
module.exports = app;

// Optional: run locally with node server.js
// if (require.main === module) {
//   const port = process.env.PORT || 4000;
//   app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
// }
