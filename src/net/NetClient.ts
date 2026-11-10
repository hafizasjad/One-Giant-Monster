import type { PeerMsg } from '../../shared/protocol.ts';

type ServerMsg =
  | { t: 'created'; code: string }
  | { t: 'joined'; code: string }
  | { t: 'peer-joined' }
  | { t: 'peer-left' }
  | { t: 'error'; msg: string }
  | { t: 'relay'; d: PeerMsg };

/** WebSocket wrapper around the relay server's room protocol. */
export class NetClient {
  code = '';
  onPeerMsg: (m: PeerMsg) => void = () => {};
  onPeerJoined: () => void = () => {};
  onPeerLeft: () => void = () => {};
  onClose: () => void = () => {};
  private pending: { resolve: (code: string) => void; reject: (e: Error) => void } | null = null;

  private constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as ServerMsg;
      if (m.t === 'relay') this.onPeerMsg(m.d);
      else if (m.t === 'peer-joined') this.onPeerJoined();
      else if (m.t === 'peer-left') this.onPeerLeft();
      else if (m.t === 'created' || m.t === 'joined') { this.code = m.code; this.pending?.resolve(m.code); this.pending = null; }
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

  send(d: PeerMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'relay', d }));
  }

  close() {
    this.onClose = () => {};
    this.ws.close();
  }
}
