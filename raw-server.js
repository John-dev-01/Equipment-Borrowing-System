// Plain Node.js `http` version (no Express) - read-only equipment list.
// Shares the same database as express-server.js. Run: npm run raw
const http = require('http');
const db = require('./middleware/db');
const { esc } = require('./middleware/views');

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && pathname === '/equipment') {
    const rows = db.prepare('SELECT * FROM equipment ORDER BY name').all();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Equipment (raw)</title><h1>Equipment</h1><ul>${
      rows.map(e => `<li>${esc(e.name)} (${esc(e.category)}) - ${e.quantity} available</li>`).join('')}</ul>`);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}).listen(process.env.RAW_PORT || 4000, () => console.log('Raw server at http://localhost:4000/equipment'));
