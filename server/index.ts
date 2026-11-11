// Relay server: rooms of up to four players (a host plus three guests). The host's messages
// go to the guests, the guests' messages go to the host. No game logic.
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

const MAX_GUESTS = 3;
interface Room { host: WebSocket; guests: Map<number, WebSocket> }
const rooms = new Map<string, Room>();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}
const send = (ws: WebSocket | undefined, msg: object) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 256 * 1024 });
wss.on('connection', (ws) => {
  let code = '';
  let id = -1; // 0 = host, 1..3 = guests

  ws.on('message', (raw) => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.t === 'create' && !code) {
      code = newCode();
      id = 0;
      rooms.set(code, { host: ws, guests: new Map() });
      send(ws, { t: 'created', code, id });
    } else if (m.t === 'join' && !code) {
      const want = String(m.code ?? '').toUpperCase();
      const room = rooms.get(want);
      if (!room) return send(ws, { t: 'error', msg: 'No room with that code' });
      if (room.guests.size >= MAX_GUESTS) return send(ws, { t: 'error', msg: 'That room is full' });
      code = want;
      id = 1;
      while (room.guests.has(id)) id++;
      room.guests.set(id, ws);
      send(ws, { t: 'joined', code, id });
      send(room.host, { t: 'peer-joined', id });
    } else if (m.t === 'relay' && code) {
      const room = rooms.get(code);
      if (!room) return;
      if (id !== 0) send(room.host, { t: 'relay', d: m.d, from: id });
      else if (typeof m.to === 'number') send(room.guests.get(m.to), { t: 'relay', d: m.d, from: 0 });
      else for (const g of room.guests.values()) send(g, { t: 'relay', d: m.d, from: 0 });
    }
  });

  ws.on('close', () => {
    const room = rooms.get(code);
    if (!room) return;
    if (id === 0) {
      for (const g of room.guests.values()) {
        send(g, { t: 'peer-left', id: 0 });
        g.close();
      }
      rooms.delete(code);
    } else if (room.guests.get(id) === ws) {
      room.guests.delete(id);
      send(room.host, { t: 'peer-left', id });
    }
  });
});

http.listen(PORT, () => console.log(`One Giant Monster server on http://localhost:${PORT}`));
