const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = 2000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());

function isInputSafe(input) {
  const pattern = /^[\w\s|&()\-]+$/;
  return pattern.test(input);
}

function filterMeaningfulWords(query) {
  const stopwords = ["the", "is", "and", "or", "in", "on", "of", "to", "a"];
  return query
    .split(/\s+/)
    .filter((word) => !stopwords.includes(word.toLowerCase()))
    .join(" & ");
}

app.get("/search", async (req, res) => {
  try {
    const {
      q,
      station,
      state,
      speaker,
      date,
      limit = 20,
      offset = 0,
    } = req.query;
    let whereClauses = [];
    const values = [];
    let cleanQ = q;

    if (q) {
      if (!isInputSafe(q)) {
        return res
          .status(400)
          .json({
            error:
              "Invalid search input. Only letters, numbers, and simple symbols are allowed.",
          });
      }
      cleanQ = filterMeaningfulWords(q);
      values.push(cleanQ);
      whereClauses.push(`tsv @@ to_tsquery($${values.length})`);
    }

    if (station) {
      values.push(station);
      whereClauses.push(`station = $${values.length}`);
    }

    if (state) {
      values.push(state);
      whereClauses.push(`state = $${values.length}`);
    }

    if (speaker) {
      values.push(speaker);
      whereClauses.push(`speaker = $${values.length}`);
    }

    if (date) {
      values.push(date);
      whereClauses.push(`dt::date = $${values.length}`);
    }

    const whereClause =
      whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
    const cappedLimit = Math.min(parseInt(limit), 100);
    const parsedOffset = parseInt(offset);

    const countQuery = `SELECT COUNT(*) FROM transcripts ${whereClause}`;
    const countResult = await pool.query(countQuery, values);

    const rankClause = q ? ", ts_rank(tsv, to_tsquery($1)) AS rank" : "";

    const searchQuery = `
      SELECT id, station, dt AS datetime, speaker, text AS snippet${rankClause}
      FROM transcripts
      ${whereClause}
      ORDER BY ${q ? "rank DESC," : ""} dt DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

    values.push(cappedLimit);
    values.push(parsedOffset);

    const searchResult = await pool.query(searchQuery, values);

    res.json({
      count: parseInt(countResult.rows[0].count),
      results: searchResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = { app, pool };

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
