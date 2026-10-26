import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.md':'text/plain; charset=utf-8' };

http.createServer(async (request, response) => {
  try {
    const file = request.url === '/' ? 'index.html' : request.url.replace(/^\//, '').split('?')[0];
    const body = await readFile(join(import.meta.dirname, file));
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4175, '127.0.0.1', () => console.log('exo preview ready'));
