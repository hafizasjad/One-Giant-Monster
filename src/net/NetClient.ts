import type { PeerMsg } from '../../shared/protocol.ts';

type ServerMsg =
  | { t: 'created'; code: string }
  | { t: 'joined'; code: string }
  | { t: 'peer-joined' }
  | { t: 'peer-left' }
  | { t: 'error'; msg: string }
  | { t: 'relay'; d: PeerMsg };

/**
 * The link to the other player. Rooms and anything that must arrive (start, restart)
 * go through the relay server. Once both players are in the room the two browsers
 * also try to connect straight to each other; when that works, the fast-changing
 * messages (snapshots and input) take that short path instead of the round trip
 * through the server.
 */
export class NetClient {
  code = '';
  /** Called when the direct link opens or closes. */
  onLink: () => void = () => {};
  private pc: RTCPeerConnection | null = null;
  private fast: RTCDataChannel | null = null;
  private signalling: Promise<void> = Promise.resolve();
  onPeerMsg: (m: PeerMsg) => void = () => {};
  onPeerJoined: () => void = () => {};
  onPeerLeft: () => void = () => {};
  onClose: () => void = () => {};
  private pending: { resolve: (code: string) => void; reject: (e: Error) => void } | null = null;

  private constructor(private ws: WebSocket) {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as ServerMsg;
      if (m.t === 'relay') {
        const d = m.d;
        if (d.k === 'rtc') this.signalling = this.signalling.then(() => this.rtcSignal(d));
        else this.onPeerMsg(d);
      } else if (m.t === 'peer-joined') { this.rtcStart(true); this.onPeerJoined(); }
      else if (m.t === 'peer-left') { this.rtcStop(); this.onPeerLeft(); }
      else if (m.t === 'created' || m.t === 'joined') { this.code = m.code; this.pending?.resolve(m.code); this.pending = null; }
      else if (m.t === 'error') { this.pending?.reject(new Error(m.msg)); this.pending = null; }
    };
    ws.onclose = () => {
      this.rtcStop();
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

  /** True while snapshots and input travel straight between the two players. */
  get direct() {
    return this.fast?.readyState === 'open';
  }

  send(d: PeerMsg) {
    if ((d.k === 'snap' || d.k === 'input') && this.fast?.readyState === 'open') {
      try { return this.fast.send(JSON.stringify(d)); } catch { /* fall through to the relay */ }
    }
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'relay', d }));
  }

  // --- direct link (WebRTC data channel) ----------------------------------------

  /** The host calls this when the guest arrives; the guest when the host's offer comes in. */
  private rtcStart(initiator: boolean) {
    this.rtcStop();
    if (typeof RTCPeerConnection === 'undefined') return;
    const pc = this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ k: 'rtc', ice: e.candidate.toJSON() }); };
    const adopt = (ch: RTCDataChannel) => {
      ch.onopen = () => { this.fast = ch; this.onLink(); };
      ch.onclose = () => { if (this.fast === ch) { this.fast = null; this.onLink(); } };
      ch.onmessage = (ev) => this.onPeerMsg(JSON.parse(ev.data as string) as PeerMsg);
    };
    if (initiator) {
      // Old snapshots are worthless, so never wait for a lost one to be resent.
      adopt(pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => this.send({ k: 'rtc', sdp: pc.localDescription!.toJSON() }))
        .catch(() => { /* no direct link: the relay keeps working */ });
    } else {
      pc.ondatachannel = (e) => adopt(e.channel);
    }
  }

  private async rtcSignal(m: { sdp?: unknown; ice?: unknown }) {
    try {
      const sdp = m.sdp as RTCSessionDescriptionInit | undefined;
      if (sdp?.type === 'offer') {
        this.rtcStart(false);
        const pc = this.pc;
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        this.send({ k: 'rtc', sdp: pc.localDescription!.toJSON() });
      } else if (sdp) {
        await this.pc?.setRemoteDescription(sdp);
      } else if (m.ice) {
        await this.pc?.addIceCandidate(m.ice as RTCIceCandidateInit);
      }
    } catch { /* no direct link: the relay keeps working */ }
  }

  private rtcStop() {
    const had = this.fast !== null;
    this.fast = null;
    this.pc?.close();
    this.pc = null;
    if (had) this.onLink();
  }

  close() {
    this.onClose = () => {};
    this.onLink = () => {};
    this.rtcStop();
    this.ws.close();
  }
}
