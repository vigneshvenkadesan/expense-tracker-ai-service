/**
 * Replaces date placeholders in LLM-generated queries with current values.
 * Supports %Y (year), %m (month), %d (day)
 * @param {Object|Array} obj - The LLM output query/filter
 * @returns {Object|Array} - Query/filter with placeholders replaced
 */
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

/**
 * Ensures that a query/filter has a date range.
 * If missing, injects current month date range.
 * Works for both normal filters and aggregation pipelines.
 * @param {Object|Array} filter - MongoDB filter or aggregation pipeline
 * @returns {Object|Array} - Filter with current month injected if missing
 */
function injectCurrentMonthIfMissing(filter) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const today = String(now.getDate()).padStart(2, "0");

  const startOfMonth = `01/${month}/${year}`;
  const endOfMonth = `${today}/${month}/${year}`;

  if (Array.isArray(filter)) {
    // Aggregation pipeline
    const matchStage = filter.find(stage => stage.$match);
    if (matchStage) {
      if (!matchStage.$match.date) {
        matchStage.$match.date = { $gte: startOfMonth, $lte: endOfMonth };
      }
    } else {
      filter.unshift({ $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } });
    }
  } else {
    // Normal filter query
    if (!filter.date) {
      filter.date = { $gte: startOfMonth, $lte: endOfMonth };
    }
  }

  return filter;
}

/**
 * Utility to inject userId into any query/filter
 * Works for both aggregation pipelines and normal filters
 * @param {Object|Array} filterOrAgg - Filter or aggregation pipeline
 * @param {String} userId - Current user's ID
 * @returns {Object|Array} - Filter with userId injected
 */
function injectUserId(filterOrAgg, userId) {
  const userFilter = { userId }; // ensure it's an object
   filterOrAgg = {...filterOrAgg, userId};
  if (Array.isArray(filterOrAgg)) {
    // aggregation pipeline
    const matchStage = filterOrAgg.find(stage => stage.$match);
    if (matchStage) {
      matchStage.$match = { ...matchStage.$match, ...userFilter };
    } else {
      // no $match stage, add one at the beginning
      filterOrAgg.unshift({ $match: userFilter });
    }
    return filterOrAgg;
  } else {
    // regular filter object
    return { $and: [filterOrAgg] };
  }
}


module.exports = {
  replaceCurrentMonthPlaceholders,
  injectCurrentMonthIfMissing,
  injectUserId
};
