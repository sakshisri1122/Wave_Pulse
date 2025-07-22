import React, { useState } from "react";
import axios from "axios";

function App() {
  const [q, setQ] = useState("");
  const [station, setStation] = useState("");
  const [state, setState] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [date, setDate] = useState("");
  const [useDictionary, setUseDictionary] = useState(false);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const station_list = [
    "KSRM",
    "KVNT",
    "KAWC",
    "KVOI",
    "KNFO",
    "WLAD",
    "WPFM",
    "WGMD",
    "WFTL",
    "WGBO",
    "WNRP",
    "WNZF",
    "WPIK",
    "WWBA",
    "WXJB",
    "WRGA",
    "WRWH",
    "WSBB",
    "KANO",
    "KIDG",
    "KOUW",
    "WBGZ",
    "WCPT",
    "WJPF",
    "WTRH",
    "WBIW",
    "KIUL",
    "KLWN",
    "KQAM",
    "WZXI",
    "KWLA",
    "WCBM",
    "WFMD",
    "WAAM",
    "WKHM",
    "WKNW",
    "WMIC",
    "WPHM",
    "WZFG",
    "KRMS",
    "KRTK",
    "KAFH",
    "KNOX",
    "KRGI",
    "WEMJ",
    "WTSN",
    "KOBE",
    "KELY",
    "WBAI",
    "WGDJ",
    "WLNL",
    "WTBQ",
    "WUTQ",
    "WYSL",
    "WHTX",
    "KQOB",
    "KFIR",
    "WFYL",
    "WRSC",
    "WRTA",
    "KELQ",
    "KWAM",
    "WBFG",
    "WCMT",
    "WCHV",
    "KNWN",
  ];

  const state_list = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
  ];

  const handleSearch = async () => {
    try {
      const params = {
        q,
        station,
        state,
        speaker,
        date,
        ...(useDictionary && { mode: "dictionary" }),
      };
      const response = await axios.get("http://localhost:2000/search", {
        params,
      });
      setResults(response.data.results);
      setCount(response.data.count);
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  /*const downloadPDF = () => {
    const doc = new jsPDF();
    let y = 10;
    results.forEach((result, i) => {
      doc.text(`Result ${i + 1}:`, 10, y);
      y += 6;
      doc.text(`Station: ${result.station}`, 10, y);
      y += 6;
      doc.text(`Date: ${new Date(result.datetime).toLocaleString()}`, 10, y);
      y += 6;
      doc.text(`Speaker: ${result.speaker || 'Unknown'}`, 10, y);
      y += 6;
      doc.text(`Snippet:`, 10, y);
      y += 6;
      doc.text(doc.splitTextToSize(result.snippet, 180), 10, y);
      y += 10 + Math.ceil(result.snippet.length / 90) * 6;

      if (y > 270) {
        doc.addPage();
        y = 10;
      }
    });
    doc.save("search_results.pdf");
  };*/

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
      <h1>Transcript Search</h1>
      <button
        onClick={() => setShowModal(true)}
        style={{ padding: "0.5rem 1rem", fontWeight: "bold" }}
      >
        Open Search
      </button>

      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "white",
              padding: "2rem",
              borderRadius: "8px",
              width: "90%",
              maxWidth: "700px",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h2>Search Transcript</h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <input
                type="text"
                placeholder="Search text..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <select
                value={station}
                onChange={(e) => setStation(e.target.value)}
              >
                <option value="">Select Station</option>
                {station_list.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <select value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">Select State</option>
                {state_list.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Speaker"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <label
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={useDictionary}
                  onChange={(e) => setUseDictionary(e.target.checked)}
                />
                Use Dictionary Mode
              </label>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <button
                  onClick={handleSearch}
                  style={{ padding: "0.5rem", fontWeight: "bold" }}
                >
                  Search
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ padding: "0.5rem" }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem" }}>
              <p>{count} result(s) found</p>
              {/*<button
                onClick={downloadPDF}
                style={{ marginBottom: "1rem", padding: "0.5rem 1rem" }}
              >
                Download PDF
              </button>*/}
              {results.length > 0 ? (
                <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
                  {results.map((result) => (
                    <div
                      key={result.id}
                      style={{
                        border: "1px solid #ccc",
                        margin: "1rem 0",
                        padding: "1rem",
                      }}
                    >
                      <p>
                        <strong>Station:</strong> {result.station}
                      </p>
                      <p>
                        <strong>Date:</strong>{" "}
                        {new Date(result.datetime).toLocaleString()}
                      </p>
                      <p>
                        <strong>Speaker:</strong> {result.speaker || 'Unknown'}
                      </p>
                      <p>
                        <strong>Snippet:</strong> {result.snippet}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#888" }}>No results found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
