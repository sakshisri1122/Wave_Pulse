const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 2000;

const pool = new Pool({
  user: process.env.DB_USER || "sakshisrivastava",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "transcripts_db",
  password: process.env.DB_PASSWORD || "",
  port: process.env.DB_PORT || 5432,
});

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/filters", async (req, res) => {
  try {
    const statesRes = await pool.query(
      "SELECT DISTINCT state FROM transcripts ORDER BY state"
    );
    const stationsRes = await pool.query(
      "SELECT DISTINCT station FROM transcripts ORDER BY station"
    );
    res.json({
      states: statesRes.rows.map((r) => r.state),
      stations: stationsRes.rows.map((r) => r.station),
    });
  } catch (err) {
    console.error("Error fetching filter options:", err);
    res.status(500).json({ error: "Failed to load filter options" });
  }
});

app.get("/search", async (req, res) => {
  try {
    const { q, station, state, speaker, startDate, endDate } = req.query;
    const values = [];
    const conditions = [];
    let rankClause = "";

    if (q) {
      conditions.push(
        `tsv @@ plainto_tsquery('english', $${values.length + 1})`
      );
      values.push(q);
      rankClause = `, ts_rank(tsv, plainto_tsquery('english', $${values.length})) AS rank`;
    }

    if (station) {
      conditions.push(`station = $${values.length + 1}`);
      values.push(station);
    }

    if (state) {
      conditions.push(`state = $${values.length + 1}`);
      values.push(state);
    }

    if (speaker) {
      conditions.push(`speaker = $${values.length + 1}`);
      values.push(speaker);
    }

    if (startDate && endDate) {
      conditions.push(
        `DATE(dt) BETWEEN $${values.length + 1} AND $${values.length + 2}`
      );
      values.push(startDate);
      values.push(endDate);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const query = `
      SELECT id, station, dt AS datetime, speaker, text AS snippet${rankClause}
      FROM transcripts
      ${whereClause}
      ORDER BY dt DESC
      LIMIT 100
    `;

    const result = await pool.query(query, values);
    res.json({ count: result.rows.length, results: result.rows });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
