import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() { 
  const [q, setQ] = useState('');
  const [station, setStation] = useState('');
  const [state, setState] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [stationOptions, setStationOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);
 
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const res = await axios.get('http://localhost:2000/filters');
        setStationOptions(res.data.stations);
        setStateOptions(res.data.states);
      } catch (err) {
        console.error('Failed to fetch filter options', err);
      }
    };
    fetchFilters();
  }, []);

  const handleSearch = async () => {
    try {
      const params = {
        q,
        station,
        state,
        speaker,
        startDate,
        endDate
      };
      const response = await axios.get('http://localhost:2000/search', { params });
      setResults(response.data.results);
      setCount(response.data.count);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Transcript Search</h1>
      <button onClick={() => setShowModal(true)} style={{ padding: '0.5rem 1rem', fontWeight: 'bold' }}>Open Search</button>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>Search Transcript</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input type="text" placeholder="Search text..." value={q} onChange={e => setQ(e.target.value)} />

              <select value={station} onChange={e => setStation(e.target.value)}>
                <option value="">Select Station</option>
                {stationOptions.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>

              <select value={state} onChange={e => setState(e.target.value)}>
                <option value="">Select State</option>
                {stateOptions.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>

              <input type="text" placeholder="Speaker" value={speaker} onChange={e => setSpeaker(e.target.value)} />

              <div style={{ display: 'flex', gap: '1rem' }}>
                <label>
                  From: <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </label>
                <label>
                  To: <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button onClick={handleSearch} style={{ padding: '0.5rem', fontWeight: 'bold' }}>Search</button>
                <button onClick={() => setShowModal(false)} style={{ padding: '0.5rem' }}>Close</button>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <p>{count} result(s) found</p>
              {results.length > 0 ? (
                <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  {results.map(result => (
                    <div key={result.id} style={{ border: '1px solid #ccc', margin: '1rem 0', padding: '1rem' }}>
                      <p><strong>Station:</strong> {result.station}</p>
                      <p><strong>Date:</strong> {new Date(result.datetime).toLocaleString()}</p>
                      <p><strong>Speaker:</strong> {result.speaker || 'Unknown'}</p>
                      <p><strong>Snippet:</strong> {result.snippet}</p>
                      {result.rank !== undefined && <p><strong>Rank:</strong> {result.rank.toFixed(5)}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#888' }}>No results found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
