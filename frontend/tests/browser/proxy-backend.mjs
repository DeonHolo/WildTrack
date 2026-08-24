import http from 'node:http';

const host = '127.0.0.1';
const port = Number(process.env.WILDTRACK_PROXY_TEST_PORT || 4180);

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    if (request.url?.startsWith('/api/proxy-echo')) {
      response.writeHead(207, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'proxy-session=accepted; Path=/; HttpOnly; SameSite=Lax',
        'X-WildTrack-Proxy': 'preserved'
      });
      response.end(JSON.stringify({
        method: request.method,
        url: request.url,
        cookie: request.headers.cookie || '',
        csrf: request.headers['x-xsrf-token'] || '',
        requestMarker: request.headers['x-wildtrack-request'] || '',
        body: Buffer.concat(chunks).toString('utf8')
      }));
      return;
    }

    if (request.url === '/api/auth/session') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ authenticated: false }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not available in the browser proxy fixture.' }));
  });
});

server.listen(port, host, () => {
  process.stdout.write(`WildTrack proxy fixture listening on http://${host}:${port}\n`);
});

function close() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
