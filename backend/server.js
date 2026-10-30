import { createServer } from 'node:http';
import places from './api/places.js';
import health from './api/health.js';
const port = Number(process.env.PORT || 3001);
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/places') return places(req, res);
  if (pathname === '/api/health') return health(req, res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Rota não encontrada.' }));
});
server.listen(port, '127.0.0.1', () => console.log(`VORKA backend: http://127.0.0.1:${port}`));
server.on('error', error => { console.error(`Não foi possível iniciar o backend: ${error.code || 'erro de servidor'}`); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close());
