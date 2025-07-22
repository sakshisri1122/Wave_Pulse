const request = require('supertest');
const app = require('./searchAPI.js');

describe('GET /search', () => {
  it('returns results and count for basic query', async () => {
    const res = await request(app).get('/search?q=news');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('supports station and speaker filters', async () => {
    const res = await request(app).get('/search?q=news&station=KAWC&speaker=SPEAKER_01');
    expect(res.statusCode).toBe(200);
  });

  it('handles no results cleanly', async () => {
    const res = await request(app).get('/search?q=notlikelyatoken123');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('handles sql injections', async () => {
    await request(app).get("/search?q=';DROP TABLE transcripts;--")
  .expect(400); // Input is blocked by isInputSafe
  });

  it('handles missing query parameters', async() => {
    await request(app).get('/search') // no q, no filters
  .expect(200);
  });

});
