import RAPIER from '@dimforge/rapier3d-compat';
import { reassign, ROLES, splitRoles, type Inputs, type PeerMsg, type Role, type RoleInput, type RoleMap, type Snapshot } from '../shared/protocol.ts';
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
/** Players in the room (0 = host). The host keeps this up to date and tells the guests. */
let players: number[] = [0];
let roles: RoleMap = splitRoles(players);
let inGame = false;
let lastSnap: Snapshot | null = null;
let resultsTimer = 0;

const myId = () => net?.id ?? 0;
/** The roles played on this machine. */
const mine = (): Role[] => (mode === 'local' ? ROLES : ROLES.filter((r) => roles[r] === myId()));
const ROLE_NAME: Record<Role, string> = { legs: 'Legs', arms: 'Arms', head: 'Head', special: 'Special' };
const playerName = (id: number) => (id === myId() ? 'You' : id === 0 ? 'Host' : `Player ${id + 1}`);

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
  if (!inGame) kb.setRoles([], false);
}

function toMenu(message = '') {
  net?.close();
  net = null;
  players = [0];
  roles = splitRoles(players);
  setSession(new HostSession(RAPIER, { local: () => ({}), chaos: false }), 'menu');
  show('lobby', false);
  show('menu', true);
  $('menuError').textContent = message;
}

/** Inputs for every role played on this machine. */
function localInputs(): Partial<Inputs> {
  const out: Partial<Record<Role, RoleInput>> = {};
  for (const r of mine()) out[r] = kb.read(r);
  return out as Partial<Inputs>;
}

// --- controls help -----------------------------------------------------------

const K = (s: string) => `<kbd>${s}</kbd>`;
const WASD = K('W') + K('A') + K('S') + K('D');
const ARROWS = K('←') + K('↑') + K('↓') + K('→');

function helpFor(role: Role): string {
  const shared = kb.scheme === 'shared';
  if (kb.device === 'gamepad') {
    const pad = shared ? (role === 'legs' || role === 'special' ? 'controller 1: ' : 'controller 2: ') : '';
    return pad + {
      legs: `left stick move · ${K('A')} jump`,
      arms: `left stick hand · ${K('LB')}${K('RB')} reach · ${K('A')} grab/drop/pull · hold ${K('X')} throw`,
      head: 'right stick look',
      special: `${K('B')} roar · ${K('Y')} stomp`,
    }[role];
  }
  if (shared) {
    return {
      legs: `${WASD} move · ${K('Space')} jump`,
      arms: `${ARROWS} hand · ${K(',')}${K('.')} reach · ${K('R-Shift')} grab/drop · hold ${K('Enter')} throw`,
      head: `${K('I')}${K('J')}${K('K')}${K('L')} look`,
      special: `${K('Z')} roar · ${K('X')} stomp`,
    }[role];
  }
  return {
    legs: `${WASD} move · ${K('Space')} jump`,
    arms: `${WASD} hand · ${K('Q')}${K('E')} reach · ${K('Space')} grab/drop/pull · hold ${K('F')} throw`,
    head: `${kb.onlyLooks ? `${WASD} or ` : ''}${ARROWS} look around`,
    special: `${K('R')} roar · ${K('C')} stomp (jump first!)`,
  }[role];
}

function refreshHelp() {
  if (kb.device === 'touch') return; // the on-screen buttons are labelled
  $('help').innerHTML = mine().map((r) => `<span><b>${ROLE_NAME[r].toUpperCase()}</b> ${helpFor(r)}</span>`).join('');
}
kb.onDevice = () => { if (inGame) refreshHelp(); };

/** Set up keys, on-screen buttons and help for the roles played on this machine. */
function useControls() {
  const m = mine();
  kb.setRoles(m, mode === 'local');
  refreshHelp();
  const who = m.map((r) => ROLE_NAME[r]).join(' + ') || 'Watching';
  $('whoText').textContent = mode === 'local' ? 'One device' : `Room ${net!.code} · ${who}`;
}

// --- starting a game ---------------------------------------------------------

function startLocal() {
  setSession(new HostSession(RAPIER, { local: localInputs }), 'local');
  show('menu', false);
  useControls();
}

function startHosting() {
  setSession(new HostSession(RAPIER, { net: net!, local: localInputs }), 'host');
  show('lobby', false);
  useControls();
  net!.send({ k: 'start', roles });
  updateWaiting();
}

function startGuest() {
  setSession(new GuestSession(net!, mine, (r) => kb.read(r)), 'guest');
  show('lobby', false);
  useControls();
}

// --- lobby -----------------------------------------------------------------

function renderLobby() {
  const isHost = myId() === 0;
  show('menu', false);
  show('lobby', true);
  $('lobbyCode').textContent = net!.code;
  $('lobbyTitle').textContent = isHost ? 'Share this room code' : 'You joined room';
  const n = players.length;
  const canEdit = isHost && n > 1;
  $('roleList').replaceChildren(...ROLES.map((r) => {
    const b = document.createElement('button');
    b.className = (roles[r] === myId() ? 'on' : 'alt') + (canEdit ? '' : ' fixed');
    b.textContent = `${ROLE_NAME[r]}: ${playerName(roles[r])}`;
    b.onclick = () => {
      if (!canEdit) return;
      roles = { ...roles, [r]: players[(players.indexOf(roles[r]) + 1) % n] };
      sendLobby();
      renderLobby();
    };
    return b;
  }));
  show('btnStart', isHost);
  ($('btnStart') as HTMLButtonElement).disabled = n < 2;
  $('lobbyStatus').textContent = isHost
    ? (n < 2 ? 'Waiting for players to join… (up to 4)' : `${n} players here. Tap a role to change who plays it.`)
    : `${n} players here. Waiting for the host to start…`;
}

const sendLobby = () => net?.send({ k: 'lobby', roles, players });

/** Host, in game: pause while a role has nobody playing it. */
function updateWaiting() {
  if (!host || !net) return;
  const orphaned = ROLES.filter((r) => !players.includes(roles[r]));
  host.waiting = orphaned.length > 0;
  show('notice', host.waiting);
  if (host.waiting) {
    $('noticeText').textContent =
      `Nobody is playing ${orphaned.map((r) => ROLE_NAME[r]).join(' + ')}. Paused. They can rejoin with code ${net.code}.`;
  }
}

async function createRoom() {
  try {
    net = await NetClient.connect();
    await net.createRoom();
  } catch (e) {
    return toMenu((e as Error).message);
  }
  players = [0];
  roles = splitRoles(players);
  net.onPeerJoined = (id) => {
    players = [...players, id].sort();
    if (mode === 'host') {
      net!.send({ k: 'start', roles }, id);
      updateWaiting();
    } else {
      roles = splitRoles(players);
      sendLobby();
      renderLobby();
    }
  };
  net.onPeerLeft = (id) => {
    players = players.filter((p) => p !== id);
    if (mode === 'host') {
      updateWaiting();
    } else {
      roles = splitRoles(players);
      sendLobby();
      renderLobby();
    }
  };
  net.onPeerMsg = (m: PeerMsg, from) => {
    if (m.k === 'input' && roles[m.role] === from) host?.remoteInput(m.role, m.i);
  };
  net.onClose = () => toMenu('Lost connection to the game server.');
  renderLobby();
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
  players = [0, net.id];
  roles = splitRoles(players);
  net.onPeerMsg = (m: PeerMsg) => {
    if (m.k === 'lobby') {
      roles = m.roles;
      players = m.players;
      if (mode === 'menu') renderLobby();
    } else if (m.k === 'start') {
      roles = m.roles;
      if (mode === 'guest') useControls(); // roles were handed around mid-game
      else startGuest();
    } else if (m.k === 'snap') {
      guest?.receive(m.s);
    } else if (m.k === 'restart') {
      guest?.clear();
      view.reset();
      show('results', false);
      resultsTimer = 0;
    }
  };
  net.onPeerLeft = () => toMenu('The host left the room.');
  net.onClose = () => toMenu('Lost connection to the game server.');
  renderLobby();
}

$('btnLocal').onclick = startLocal;
$('btnCreate').onclick = createRoom;
$('btnJoin').onclick = joinRoom;
$('joinCode').onkeydown = (e) => { if (e.key === 'Enter') void joinRoom(); };
$('btnStart').onclick = startHosting;
$('btnLeave').onclick = () => toMenu();
$('btnMenu').onclick = () => toMenu();
$('quit').onclick = () => toMenu();
$('btnCarry').onclick = () => {
  roles = reassign(roles, players);
  net?.send({ k: 'start', roles });
  useControls();
  updateWaiting();
};
$('btnAgain').onclick = () => {
  host?.restart();
  view.reset();
  resultsTimer = 0;
  show('results', false);
};

// --- HUD + results ------------------------------------------------------------

const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

function rank(score: number) {
  if (score >= 4600) return 'Legendary Mega-Beast';
  if (score >= 3600) return 'Certified Giant Monster';
  if (score >= 2600) return 'Wobbly But Proud';
  if (score >= 1300) return 'Many Brains, Zero Coordination';
  return 'Lovable Disaster';
}

function cooldown(id: string, left: number) {
  $(id).classList.toggle('ready', left === 0);
  ($(id).querySelector('b') as HTMLElement).style.width = `${(1 - left) * 100}%`;
}

function updateHud(s: Snapshot, dt: number) {
  const [time, fumbles, finished, final, stars] = s.sc;
  $('time').textContent = fmtTime(time);
  $('starsHud').textContent = `★ ${stars}/${level.stars.length}`;
  $('fumblesHud').textContent = `Oops ${fumbles}`;
  cooldown('abRoar', s.sp[0]);
  cooldown('abStomp', s.sp[1]);
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
if (import.meta.env.DEV) (window as any).__game = { get host() { return host; }, get snap() { return lastSnap; }, get roles() { return roles; },
  /** Run n frames right now (the Browser pane stops animation frames while hidden). */
  frames(n: number) { for (let i = 0; i < n; i++) { prev = performance.now() - 50; tick(performance.now(), true); } },
};

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
