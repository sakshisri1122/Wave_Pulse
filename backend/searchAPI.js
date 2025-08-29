const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const morgan = require("morgan");
const { Parser } = require("json2csv");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 2000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Enforce HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

// Strip stack traces from production responses
function safeErrorHandler(err, req, res, next) {
  console.error("Server Error:", err); // logs stack internally
  res.status(500).json({ error: "An unexpected error occurred." }); // generic error to client
}
// Health check endpoint for uptime monitoring
app.get("/health", (req, res) => res.status(200).send("OK"));


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

// Validate dateRanges query param
function validateDateRanges(req, res, next) {
  try {
    const dateRanges = JSON.parse(req.query.dateRanges || "[]");
    if (
      !Array.isArray(dateRanges) ||
      !dateRanges.every(range => typeof range.from === "string" && typeof range.to === "string")
    ) {
      return res.status(400).json({ error: "Invalid dateRanges format. Expected array of { from, to }." });
    }
    next();
  } catch {
    return res.status(400).json({ error: "Malformed dateRanges JSON." });
  }
}

app.get("/search", validateDateRanges, async (req, res) => {
  const client = await pool.connect();
  try {
    let {
      q = "",
      station = "",
      state = "",
      speaker = "",
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      sort = "desc",
    } = req.query;

    // ensure limit and offset are integers
    limit = parseInt(limit, 10);
    offset = parseInt(offset, 10);
    if (isNaN(limit)) limit = 50;
    if (isNaN(offset)) offset = 0;

    // sanitize sort direction
    sort = sort.toLowerCase() === "asc" ? "ASC" : "DESC";

    const parseArrayParam = (param) => {
      if (Array.isArray(param)) return param;
      if (typeof param === "string" && param.includes("|"))
        return param.split("|");
      if (typeof param === "string" && param.length > 0) return [param];
      return [];
    };

    const stations = parseArrayParam(station);
    const states = parseArrayParam(state);
    const speakers = parseArrayParam(speaker);

    const conditions = [];
    const values = [];

    if (q) {
      const formattedQuery = q
        .split(",") // split by comma for AND query
        .map((term) => term.trim().replace(/\s+/g, " & "))
        .filter(Boolean)
        .join(" & "); // join with AND

      values.push(formattedQuery);
      conditions.push(`tsv @@ to_tsquery('english', $${values.length})`);
    }

    if (stations.length) {
      values.push(stations);
      conditions.push(`station = ANY($${values.length}::text[])`);
    }
    if (states.length) {
      values.push(states);
      conditions.push(`state = ANY($${values.length}::text[])`);
    }
    if (speakers.length) {
      values.push(speakers);
      conditions.push(`speaker = ANY($${values.length}::text[])`);
    }
    if (startDate && endDate) {
      values.push(startDate);
      conditions.push(`dt >= $${values.length}`);
      values.push(endDate);
      conditions.push(`dt <= $${values.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    values.push(limit);
    values.push(offset);

    const limitIndex = values.length - 1;
    const offsetIndex = values.length;

    const query = `
      SELECT id, station, dt AS datetime, state, speaker, text AS snippet,
             ts_rank(tsv, to_tsquery('english', $1)) AS rank
      FROM transcripts
      ${whereClause}
      ORDER BY dt ${sort}
      LIMIT $${limitIndex} OFFSET $${offsetIndex};
    `;

    const countQuery = `SELECT COUNT(*) FROM transcripts ${whereClause};`;

    const result = await client.query(query, values);
    const countResult = await client.query(
      countQuery,
      values.slice(0, values.length - 2)
    );

    res.json({
      count: parseInt(countResult.rows[0].count, 10),
      results: result.rows,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  } finally {
    client.release();
  }
});

// /aggregate route in searchAPI.js
app.get("/aggregate", async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      groupBy = "date",
      q = "",
      station = "",
      state = "",
      speaker = "",
      startDate,
      endDate,
    } = req.query;

    const parseArrayParam = (param) => {
      if (Array.isArray(param)) return param;
      if (typeof param === "string" && param.includes("|"))
        return param.split("|");
      if (typeof param === "string" && param.length > 0) return [param];
      return [];
    };

    const stations = parseArrayParam(station);
    const states = parseArrayParam(state);
    const speakers = parseArrayParam(speaker);

    let groupClause;
    if (groupBy === "station") {
      groupClause = "station";
    } else if (groupBy === "week") {
      groupClause = "to_char(dt, 'IYYY-IW')";
    } else if (groupBy === "month") {
      groupClause = "to_char(dt, 'YYYY-MM')";
    } else {
      groupClause = "DATE(dt)";
    }

    const conditions = [];
    const values = [];

    if (q) {
      const formattedQuery = q
        .split(",") // split by comma for AND query
        .map((term) => term.trim().replace(/\s+/g, " & "))
        .filter(Boolean)
        .join(" & "); // join with AND

      values.push(formattedQuery);
      conditions.push(`tsv @@ to_tsquery('english', $${values.length})`);
    }

    if (stations.length) {
      values.push(stations);
      conditions.push(`station = ANY($${values.length}::text[])`);
    }
    if (states.length) {
      values.push(states);
      conditions.push(`state = ANY($${values.length}::text[])`);
    }
    if (speakers.length) {
      values.push(speakers);
      conditions.push(`speaker = ANY($${values.length}::text[])`);
    }
    if (startDate && endDate) {
      values.push(startDate);
      conditions.push(`dt >= $${values.length}`);
      values.push(endDate);
      conditions.push(`dt <= $${values.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const query = `
      SELECT ${groupClause} AS label, COUNT(*) AS count
      FROM transcripts
      ${whereClause}
      GROUP BY label
      ORDER BY label;
    `;

    const result = await client.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("Aggregation error:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/segment_context", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, direction } = req.query;
    const contextCount = 5;

    if (!id || !["before", "after"].includes(direction)) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    const comparison = direction === "before" ? "<" : ">";
    const order = direction === "before" ? "DESC" : "ASC";

    const query = `
      SELECT id, text, speaker, station, state, dt
      FROM transcripts
      WHERE id ${comparison} $1
      ORDER BY id ${order}
      LIMIT ${contextCount};
    `;

    const result = await client.query(query, [id]);
    const rows = direction === "before" ? result.rows.reverse() : result.rows;

    res.json(rows);
  } catch (err) {
    console.error("Error fetching context segments:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post("/export_csv", async (req, res) => {
  const client = await pool.connect();
  try {
    const { filters = {}, contextRequested = {} } = req.body;
    const {
      q = "",
      station = "",
      state = "",
      speaker = "",
      startDate,
      endDate,
      sort = "desc",
    } = filters;

    const parseArrayParam = (param) => {
      if (Array.isArray(param)) return param;
      if (typeof param === "string" && param.includes("|"))
        return param.split("|");
      if (typeof param === "string" && param.length > 0) return [param];
      return [];
    };

    const stations = parseArrayParam(station);
    const states = parseArrayParam(state);
    const speakers = parseArrayParam(speaker);

    const conditions = [];
    const values = [];

    if (q) {
      const formattedQuery = q
        .split(",") // split by comma for AND query
        .map((term) => term.trim().replace(/\s+/g, " & "))
        .filter(Boolean)
        .join(" & "); // join with AND

      values.push(formattedQuery);
      conditions.push(`tsv @@ to_tsquery('english', $${values.length})`);
    }

    if (stations.length) {
      values.push(stations);
      conditions.push(`station = ANY($${values.length}::text[])`);
    }
    if (states.length) {
      values.push(states);
      conditions.push(`state = ANY($${values.length}::text[])`);
    }
    if (speakers.length) {
      values.push(speakers);
      conditions.push(`speaker = ANY($${values.length}::text[])`);
    }
    if (startDate && endDate) {
      values.push(startDate);
      conditions.push(`dt >= $${values.length}`);
      values.push(endDate);
      conditions.push(`dt <= $${values.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const searchQuery = `
      SELECT id, station, dt AS datetime, state, speaker, text AS snippet
      FROM transcripts
      ${whereClause}
      ORDER BY dt ${sort};
    `;

    const mainResults = await client.query(searchQuery, values);
    const allRows = [];

    for (let row of mainResults.rows) {
      const base = {
        id: row.id,
        type: "main",
        ...row,
      };
      allRows.push(base);

      const idStr = row.id.toString();
      const ctxInfo = contextRequested[idStr];

      const beforeCount = ctxInfo?.before || 0;
      if (beforeCount > 0) {
        const beforeRes = await client.query(
          `SELECT id, station, dt AS datetime, state, speaker, text AS snippet
     FROM transcripts
     WHERE id < $1
     ORDER BY id DESC
     LIMIT ${beforeCount}`,
          [row.id]
        );
        beforeRes.rows.reverse().forEach((seg) => {
          allRows.push({ id: seg.id, type: "before", ...seg });
        });
      }

      if (ctxInfo?.after) {
        const afterRes = await client.query(
          `SELECT id, station, dt AS datetime, state, speaker, text AS snippet
           FROM transcripts
           WHERE id > $1 ORDER BY id ASC LIMIT 5`,
          [row.id]
        );
        afterRes.rows.forEach((seg) => {
          allRows.push({
            id: seg.id,
            type: "after",
            ...seg,
          });
        });
      }
    }

    const parser = new Parser({
      fields: [
        "id",
        "type",
        "station",
        "datetime",
        "state",
        "speaker",
        "snippet",
      ],
    });
    const csv = parser.parse(allRows);

    res.header("Content-Type", "text/csv");
    res.attachment("transcript_export.csv");
    res.send(csv);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Failed to export CSV" });
  } finally {
    client.release();
  }
});

/*app.post("/ask", async (req, res) => {
  const { question } = req.body;
  console.log("Received question:", question);

  const scriptPath =
    "/Users/sakshisrivastava/Documents/Wave_Pulse_Internship/Wave_Pulse/src/analytics/track_narratives/run_rag.py";

  const py = spawn("/Users/sakshisrivastava/anaconda3/bin/python", [
    scriptPath,
    "--question",
    question,
  ]);

  let output = "";
  py.stdout.on("data", (data) => {
    output += data.toString();
    console.log("Python STDOUT:", data.toString());
  });

  let errorOutput = "";
  py.stderr.on("data", (data) => {
    errorOutput += data.toString();
    console.error("Python STDERR:", data.toString());
  });

  py.on("close", (code) => {
    if (code !== 0) {
      console.error("Python exited with code:", code);
      console.error("Error output:", errorOutput);
      return res.status(500).json({ error: "Failed to generate answer" });
    }
    console.log("Final Output:", output.trim());
    res.json({ answer: output.trim() });
  });
});*/
app.use(safeErrorHandler); // Use after all routes

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
