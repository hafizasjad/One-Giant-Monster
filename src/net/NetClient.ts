import type { PeerMsg } from '../../shared/protocol.ts';

type ServerMsg =
  | { t: 'created'; code: string; id: number }
  | { t: 'joined'; code: string; id: number }
  | { t: 'peer-joined'; id: number }
  | { t: 'peer-left'; id: number }
  | { t: 'error'; msg: string }
  | { t: 'relay'; d: PeerMsg; from: number };

/** WebSocket wrapper around the relay server's room protocol. */
export class NetClient {
  code = '';
  /** This player's number in the room: 0 = host, 1..3 = guests. */
  id = 0;
  onPeerMsg: (m: PeerMsg, from: number) => void = () => {};
  /** Host: a guest arrived. */
  onPeerJoined: (id: number) => void = () => {};
  /** Host: that guest left. Guest: the host left (id 0). */
  onPeerLeft: (id: number) => void = () => {};
  onClose: () => void = () => {};
  private pending: { resolve: (code: string) => void; reject: (e: Error) => void } | null = null;

  private constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as ServerMsg;
      if (m.t === 'relay') this.onPeerMsg(m.d, m.from);
      else if (m.t === 'peer-joined') this.onPeerJoined(m.id);
      else if (m.t === 'peer-left') this.onPeerLeft(m.id);
      else if (m.t === 'created' || m.t === 'joined') { this.code = m.code; this.id = m.id; this.pending?.resolve(m.code); this.pending = null; }
      else if (m.t === 'error') { this.pending?.reject(new Error(m.msg)); this.pending = null; }
    };
    ws.onclose = () => {
      this.pending?.reject(new Error('Connection lost'));
      this.pending = null;
      this.onClose();
    };
  }

  static connect(): Promise<NetClient> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => resolve(new NetClient(ws));
      ws.onerror = () => reject(new Error('Could not reach the game server'));
    });
  }

  private request(msg: object): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.ws.send(JSON.stringify(msg));
    });
  }

  createRoom() {
    return this.request({ t: 'create' });
  }

  joinRoom(code: string) {
    return this.request({ t: 'join', code: code.toUpperCase() });
  }

  /** Guests always reach the host. The host reaches every guest, or just one with `to`. */
  send(d: PeerMsg, to?: number) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'relay', d, to }));
  }

  close() {
    this.onClose = () => {};
    this.ws.close();
  }
}
