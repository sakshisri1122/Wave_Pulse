# Transcript Search System 


![system_design](/assets/WavePulse_System_Design.png)
This documentation covers the entire architecture and implementation of the search functionality. It includes:

- Data ingestion into PostgreSQL
- Keyword-based search endpoint using Express and PostgreSQL full-text search
- A React-based frontend with filtering and live display
- Segment context navigation (before/after)
- CSV export with optional context
- Security and error-handling middleware
- UI enhancements with Bootstrap
- Ask-a-Question mode (UI only)
- Pagination, histogram charts, and date-range filtering
- Cloud deployment (DigitalOcean + GitHub Pages)
- System environment variable usage
- API examples and CI/CD deployment

---

## 1. Data Ingestion into PostgreSQL

### What Is Done
- Parses raw transcript JSON files
- Extracts metadata from filenames (station, state, datetime)
- Normalizes and validates each data segment
- Stores records in a PostgreSQL database
- Prepares `tsvector` column for full-text search
- Tracks processed files using `checkpoint.txt`

### Why This Was Done
- To support structured and scalable storage of large volumes of transcript text
- Enables fast querying, filtering, and full-text search using PostgreSQL’s built-in tools
- Avoids duplicate ingestion and makes it easy to resume failed or partial runs

### How It Was Done
**Script**: `ingest.py`  
**Language**: Python  
**Database**: PostgreSQL hosted on [DigitalOcean Managed Database](https://www.digitalocean.com/products/managed-databases)

#### Key Features:
- Uses `click` to expose CLI flags like `--samples-dir`, `--start-date`, and `--end-date`
- Applies field normalization to clean `text`, `speaker`, `station`, `state`, etc.
- Parses timestamps from filenames like `AZ_KAWC_2024_06_27_18_45.json`
- Uses PostgreSQL `psycopg2` for batched inserts
- Computes `tsvector` using `to_tsvector('english', text)`
- Stores ingestion history in `checkpoint.txt`

---

## 2. Search Endpoint (Express.js + PostgreSQL)

### What Is Done
- Implemented a secure and flexible `GET /search` endpoint
- Supports keyword-based queries using PostgreSQL’s full-text search
- Filters results based on state, station, speaker, and **multiple date ranges**
- Comma-separated keywords act as AND queries within one field; multiple keyword fields trigger OR logic
- Segment context support: fetch 5-before and 5-after results around each match
- Added `GET /aggregate` for histogram-based visualizations
- Supports CSV export via `POST /export_csv`, including selected before/after context
- Added HTTPS enforcement and input validation

### Why This Was Done
- To allow structured, fast, and filtered access to transcript data
- Enables scalable querying and visualization
- Prevents abuse and ensures security in a public-facing system

### How It Was Done
**File:** `backend/searchAPI.js`  
**Framework:** Node.js + Express  
**Deployment:** Hosted on [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform) with persistent connection to the managed PostgreSQL instance

#### Supported Query Parameters:
- `q` — keyword search (supports AND with commas, OR with multiple fields)
- `state`, `station`, `speaker` — filtering
- `dateRanges` — array of `{ from, to }` pairs
- `limit`, `offset`, `sort` — pagination controls

#### Key Features:
- Uses `tsvector` and `to_tsquery()` for ranked text matching
- Parses multiple date ranges for flexible time filtering
- Exports a combined CSV with selected results and optional context segments
- Middleware for:
  - Enforcing HTTPS in production
  - Sanitizing server errors from the client
  - Validating `dateRanges` input shape

#### Environment Variables Used:
- `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT` — for PostgreSQL credentials
- `PORT` — for Express server port
- `NODE_ENV=production` — enables HTTPS redirect logic

#### Example API Usage:
```bash
curl 'https://your-api-domain/search?q=mail,vote&state=CA&sort=desc&limit=20'
```

---

## 3. React Frontend Interface

### What Is Done
- Developed an interactive React frontend with Bootstrap styling
- Dynamically filters transcripts using keyword fields, dropdowns, and date selectors
- Enables segment context navigation via Before/After buttons
- Displays interactive charts (histogram, station counts)
- Allows exporting current results and loaded segments to CSV
- Supports toggling to “Ask a Question” mode
- Pagination across search results
- Scrollable segment display

### Why This Was Done
- To provide an intuitive UI for analysts and users to query and explore transcripts
- Offer dynamic filtering, context view, and bulk export
- Prepare UI for future RAG-powered Q&A mode

### How It Was Done
**File:** `frontend/SearchPage.js`  
**Framework:** React + Bootstrap + Chart.js  
**Deployment:** Frontend deployed via [GitHub Pages](https://pages.github.com) using a CI/CD GitHub Actions workflow

#### GitHub Actions CI/CD:
- Automatically deploys frontend to GitHub Pages on push to `main`
- Runs `npm install`, `npm run build`, and pushes `/build` to the `gh-pages` branch

#### UI Components:
- **Keyword Fields** — OR logic via multiple fields, AND via comma-separated terms
- **Dropdown Filters** — dynamically populated from backend
- **Calendar Filters** — now supports multiple time ranges
- **Sort Selector** — toggle between newest/oldest first
- **Before/After Context** — reveals additional surrounding segments on click
- **CSV Export** — collects all search results + manually revealed segments
- **Pagination** — adaptive display with Prev/Next, First/Last block navigation
- **Ask Mode Toggle** — switch from search UI to Q&A input box with answer preview
- **Error Boundaries & Alerts** — to catch UI crashes or loading failures

---

## 4. Testing and Monitoring

### What Is Done
- Unit tests for backend API using Jest
- Integration tests for React UI (SearchPage interactions)
- Manual testing flows defined for:
  - Segment context loading
  - Ask Mode switching
  - CSV download matching visible context
- Added Babel + Jest config for React unit testing
- Added error boundaries and loading states for robust UI feedback

### Deployment
- **Database**: DigitalOcean Managed PostgreSQL
- **Backend**: Node.js Express app on DigitalOcean App Platform
- **Frontend**: GitHub Pages + GitHub Actions (CI/CD)
