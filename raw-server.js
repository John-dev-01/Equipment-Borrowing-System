// The legacy unauthenticated server is intentionally disabled. Use the
// authenticated Express app so department inventory boundaries are enforced.
const http = require('http');

http.createServer((req, res) => {
  res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('This legacy server is disabled. Start the authenticated app with npm start.');
}).listen(process.env.RAW_PORT || 4000, () => console.log('Raw server disabled; use npm start.'));
