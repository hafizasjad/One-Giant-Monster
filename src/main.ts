import RAPIER from '@dimforge/rapier3d-compat';
import { emptyInputs, otherRole, type PeerMsg, type Role, type Snapshot } from '../shared/protocol.ts';
import { Sfx } from './audio/Sfx.ts';
import { CHAOS_LABEL } from './game/Chaos.ts';
import { buildLevel } from './game/level1.ts';
import { Input } from './input/Input.ts';
import { GuestSession } from './net/GuestSession.ts';
import { HostSession, type Session } from './net/HostSession.ts';
import { NetClient } from './net/NetClient.ts';
import { GameView } from './render/Scene.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle('hidden', !on);

await RAPIER.init();
const level = buildLevel();
const sfx = new Sfx();
const kb = new Input($('touch'));
const view = new GameView($('game'), $('overlay'), level, sfx);

type Mode = 'menu' | 'local' | 'host' | 'guest';
let mode: Mode = 'menu';
let session: Session;
let host: HostSession | null = null;
let guest: GuestSession | null = null;
let net: NetClient | null = null;
let hostRole: Role = 'legs';
let peerHere = false;
let inGame = false;
let lastSnap: Snapshot | null = null;
let resultsTimer = 0;

window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) sfx.muted = !sfx.muted;
});

// --- session management ------------------------------------------------------

function setSession(s: Session, m: Mode) {
  session?.dispose();
  session = s;
  mode = m;
  host = s instanceof HostSession ? s : null;
  guest = s instanceof GuestSession ? s : null;
  inGame = m !== 'menu';
  resultsTimer = 0;
  view.reset();
  show('results', false);
  show('notice', false);
  show('hud', inGame);
  if (!inGame) kb.touch.show(null);
}

function toMenu(message = '') {
  net?.close();
  net = null;
  peerHere = false;
  setSession(new HostSession(RAPIER, { local: emptyInputs, chaos: false }), 'menu');
  show('lobby', false);
  show('menu', true);
  $('menuError').textContent = message;
}

const K = (s: string) => `<kbd>${s}</kbd>`;
type Controls = 'shared' | Role;
const PAD_LEGS = `left stick move · ${K('A')} jump`;
const PAD_ARMS = `left stick hand · ${K('LB')}${K('RB')} reach · ${K('A')} grab/drop/pull · hold ${K('X')} throw`;
const HELP: Record<'keyboard' | 'gamepad', Record<Controls, string>> = {
  keyboard: {
    shared: `<span><b>LEGS</b> ${K('W')}${K('A')}${K('S')}${K('D')} move · ${K('Space')} jump</span>` +
      `<span><b>ARMS</b> ${K('←')}${K('↑')}${K('↓')}${K('→')} hand · ${K(',')}${K('.')} reach · ${K('R-Shift')} grab/drop · hold ${K('Enter')} throw</span>`,
    legs: `<span><b>YOU ARE THE LEGS</b> ${K('W')}${K('A')}${K('S')}${K('D')} or arrows to move · ${K('Space')} jump</span>`,
    arms: `<span><b>YOU ARE THE ARMS</b> ${K('W')}${K('A')}${K('S')}${K('D')} or arrows move the hand · ${K('Q')}${K('E')} reach in/out · ${K('Space')} grab/drop/pull · hold ${K('F')} then release to throw</span>`,
  },
  gamepad: {
    shared: `<span><b>LEGS</b> controller 1: ${PAD_LEGS}</span><span><b>ARMS</b> controller 2 (or keyboard): ${PAD_ARMS}</span>`,
    legs: `<span><b>YOU ARE THE LEGS</b> ${PAD_LEGS}</span>`,
    arms: `<span><b>YOU ARE THE ARMS</b> ${PAD_ARMS}</span>`,
  },
};

let controls: Controls = 'shared';
/** Show the help and on-screen buttons for the roles played on this device. */
function useControls(c: Controls = controls) {
  controls = c;
  kb.touch.show(c === 'shared' ? ['legs', 'arms'] : [c]);
  if (kb.device !== 'touch') $('help').innerHTML = HELP[kb.device][c];
}
kb.onDevice = () => { if (inGame) useControls(); };

function startLocal() {
  setSession(new HostSession(RAPIER, { local: () => ({ legs: kb.legs('shared'), arms: kb.arms('shared') }) }), 'local');
  show('menu', false);
  $('whoText').textContent = 'One device';
  useControls('shared');
}

function startHosting() {
  const role = hostRole;
  setSession(new HostSession(RAPIER, {
    net: net!,
    local: () => (role === 'legs' ? { legs: kb.legs('solo') } : { arms: kb.arms('solo') }),
  }), 'host');
  show('lobby', false);
  $('whoText').textContent = `Room ${net!.code}`;
  useControls(role);
  net!.send({ k: 'start', hostRole: role });
}

function startGuest(role: Role) {
  setSession(new GuestSession(net!, role, () => (role === 'legs' ? kb.legs('solo') : kb.arms('solo'))), 'guest');
  show('lobby', false);
  $('whoText').textContent = `Room ${net!.code}`;
  useControls(role);
}

// --- lobby -----------------------------------------------------------------

function renderLobby(isHost: boolean) {
  show('menu', false);
  show('lobby', true);
  $('lobbyCode').textContent = net!.code;
  show('rolePick', isHost);
  show('btnStart', isHost);
  $('roleLegs').className = hostRole === 'legs' ? 'on' : 'alt';
  $('roleArms').className = hostRole === 'arms' ? 'on' : 'alt';
  ($('btnStart') as HTMLButtonElement).disabled = !peerHere;
  if (isHost) {
    $('lobbyTitle').textContent = 'Share this room code';
    $('lobbyStatus').textContent = peerHere ? 'Your partner is here! Pick who does what.' : 'Waiting for your partner to join…';
  } else {
    $('lobbyTitle').textContent = 'You joined room';
    $('lobbyStatus').textContent = `You will be the ${otherRole(hostRole).toUpperCase()}. Waiting for the host to start…`;
  }
}

async function createRoom() {
  try {
    net = await NetClient.connect();
    await net.createRoom();
  } catch (e) {
    return toMenu((e as Error).message);
  }
  peerHere = false;
  net.onPeerJoined = () => {
    peerHere = true;
    if (mode === 'host' && host) {
      host.waiting = false;
      show('notice', false);
      net!.send({ k: 'start', hostRole });
    } else {
      net!.send({ k: 'lobby', hostRole });
      renderLobby(true);
    }
  };
  net.onPeerLeft = () => {
    peerHere = false;
    if (mode === 'host' && host) {
      host.waiting = true;
      $('notice').textContent = `Your partner left. Paused. They can rejoin with code ${net!.code}.`;
      show('notice', true);
    } else {
      renderLobby(true);
    }
  };
  net.onPeerMsg = (m: PeerMsg) => {
    if (m.k === 'input') host?.remoteInput(m.role, m.i);
  };
  net.onClose = () => toMenu('Lost connection to the game server.');
  renderLobby(true);
}

async function joinRoom() {
  const code = ($('joinCode') as HTMLInputElement).value.trim();
  if (code.length !== 4) return void ($('menuError').textContent = 'Type the 4-letter room code first.');
  try {
    net = await NetClient.connect();
    await net.joinRoom(code);
  } catch (e) {
    return toMenu((e as Error).message);
  }
  net.onPeerMsg = (m: PeerMsg) => {
    if (m.k === 'lobby') { hostRole = m.hostRole; renderLobby(false); }
    else if (m.k === 'start') { hostRole = m.hostRole; startGuest(otherRole(m.hostRole)); }
    else if (m.k === 'snap') guest?.receive(m.s);
    else if (m.k === 'restart') { guest?.clear(); view.reset(); show('results', false); resultsTimer = 0; }
  };
  net.onPeerLeft = () => toMenu('The host left the room.');
  net.onClose = () => toMenu('Lost connection to the game server.');
  renderLobby(false);
}

$('btnLocal').onclick = startLocal;
$('btnCreate').onclick = createRoom;
$('btnJoin').onclick = joinRoom;
$('joinCode').onkeydown = (e) => { if (e.key === 'Enter') void joinRoom(); };
$('roleLegs').onclick = () => { hostRole = 'legs'; net?.send({ k: 'lobby', hostRole }); renderLobby(true); };
$('roleArms').onclick = () => { hostRole = 'arms'; net?.send({ k: 'lobby', hostRole }); renderLobby(true); };
$('btnStart').onclick = startHosting;
$('btnLeave').onclick = () => toMenu();
$('btnMenu').onclick = () => toMenu();
$('quit').onclick = () => toMenu();
$('btnAgain').onclick = () => {
  host?.restart();
  view.reset();
  resultsTimer = 0;
  show('results', false);
};

// --- HUD + results ------------------------------------------------------------

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function rank(score: number) {
  if (score >= 3600) return 'Legendary Mega-Beast';
  if (score >= 2800) return 'Certified Giant Monster';
  if (score >= 2000) return 'Wobbly But Proud';
  if (score >= 1000) return 'Two Brains, Zero Coordination';
  return 'Lovable Disaster';
}

function updateHud(s: Snapshot, dt: number) {
  const [time, fumbles, finished, final, stars] = s.sc;
  $('time').textContent = fmtTime(time);
  $('starsHud').textContent = `★ ${stars}/${level.stars.length}`;
  $('fumblesHud').textContent = `Oops ${fumbles}`;
  const c = $('chaos');
  c.classList.toggle('hidden', !s.ch);
  if (s.ch) {
    c.classList.toggle('warn', s.ch.warn);
    c.textContent = s.ch.warn ? 'Uh oh… the monster feels funny…' : CHAOS_LABEL[s.ch.name];
  }
  show('power', s.h[4] > 0);
  $('powerFill').style.width = `${s.h[4] * 100}%`;
  if (finished) {
    resultsTimer += dt;
    if (resultsTimer > 2 && $('results').classList.contains('hidden')) {
      $('rank').textContent = rank(final);
      $('finalScore').textContent = String(final);
      $('resTime').textContent = fmtTime(time);
      $('resStars').textContent = `${stars} / ${level.stars.length}`;
      $('resFumbles').textContent = String(fumbles);
      show('btnAgain', mode !== 'guest');
      show('resWait', mode === 'guest');
      show('results', true);
    }
  }
}

// Dev-only handle for poking at the running game from the console.
if (import.meta.env.DEV) (window as any).__game = { get host() { return host; }, get snap() { return lastSnap; } };

// --- main loop ---------------------------------------------------------------

toMenu();
let prev = performance.now();
function tick(now: number, draw: boolean) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  const snap = session.update(dt) ?? lastSnap;
  if (!snap) return;
  if (inGame) {
    view.handleEvents(snap.ev);
    updateHud(snap, dt);
  }
  snap.ev = [];
  lastSnap = snap;
  if (draw) view.render(snap, dt);
}
function frame(now: number) {
  tick(now, true);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Browsers stop animation frames for covered or background windows. Keep the
// simulation and networking alive from a timer so the other player isn't frozen.
setInterval(() => {
  const now = performance.now();
  if (now - prev > 100) tick(now, false);
}, 33);
