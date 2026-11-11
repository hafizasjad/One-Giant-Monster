// Relay server: rooms of two players, messages forwarded verbatim. No game logic.
// In production it also serves the built game from dist/.
// Runs directly with Node (type stripping), so keep this file to erasable TypeScript.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

// In dev (--dev) the relay always sits on 3001 behind Vite's /ws proxy.
const PORT = process.argv.includes('--dev') ? 3001 : Number(process.env.PORT ?? 3001);
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const http = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([/\\]|\.\.)+/, '');
  let file = join(DIST, path || 'index.html');
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Game not built yet. Run "npm run build", or use "npm run dev" and open the Vite URL.');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

interface Room { host: WebSocket; guest: WebSocket | null }
const rooms = new Map<string, Room>();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}
const send = (ws: WebSocket | null, msg: object) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', (ws) => {
  let code = '';
  let isHost = false;

  ws.on('message', (raw) => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.t === 'create' && !code) {
      code = newCode();
      isHost = true;
      rooms.set(code, { host: ws, guest: null });
      send(ws, { t: 'created', code });
    } else if (m.t === 'join' && !code) {
      const room = rooms.get(String(m.code ?? '').toUpperCase());
      if (!room) return send(ws, { t: 'error', msg: 'No room with that code' });
      if (room.guest) return send(ws, { t: 'error', msg: 'That room is full' });
      code = String(m.code).toUpperCase();
      room.guest = ws;
      send(ws, { t: 'joined', code });
      send(room.host, { t: 'peer-joined' });
    } else if (m.t === 'relay' && code) {
      const room = rooms.get(code);
      if (room) send(isHost ? room.guest : room.host, { t: 'relay', d: m.d });
    }
  });

  ws.on('close', () => {
    const room = rooms.get(code);
    if (!room) return;
    if (isHost) {
      send(room.guest, { t: 'peer-left' });
      room.guest?.close();
      rooms.delete(code);
    } else {
      room.guest = null;
      send(room.host, { t: 'peer-left' });
    }
  });
});

http.listen(PORT, () => console.log(`One Giant Monster server on http://localhost:${PORT}`));
