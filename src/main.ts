import RAPIER from '@dimforge/rapier3d-compat';
import { emptyInputs, otherRole, type PeerMsg, type Role, type Snapshot } from '../shared/protocol.ts';
import { Sfx } from './audio/Sfx.ts';
import { CHAOS_LABEL } from './game/Chaos.ts';
import { isUnlocked, loadBest, saveBest } from './best.ts';
import { buildHub, hubDoorAt } from './game/hub.ts';
import { LEVELS } from './game/levels.ts';
import { Input } from './input/Input.ts';
import { GuestSession } from './net/GuestSession.ts';
import { HostSession, type Session } from './net/HostSession.ts';
import { NetClient } from './net/NetClient.ts';
import { GameView } from './render/Scene.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => $(id).classList.toggle('hidden', !on);

await RAPIER.init();
const STAR_TOTALS = LEVELS.map((l) => l.build().stars.length);
const HUB = -1;
/** The level being played (and drawn): an index into LEVELS, or HUB. */
let levelIndex = HUB;
/** How many level doors are open in the hub (online: the host's count). */
let hubOpen = 1;
/** Levels unlock in order, so "how many are open" says it all. */
function openCount() {
  const firstLocked = LEVELS.findIndex((_, i) => !isUnlocked(LEVELS, i));
  return firstLocked < 0 ? LEVELS.length : firstLocked;
}
function buildCurrent() {
  if (levelIndex !== HUB) return LEVELS[levelIndex].build();
  const got = LEVELS.reduce((n, l) => n + (loadBest(l.id)?.stars ?? 0), 0);
  return buildHub(LEVELS.map((info, i) => {
    const best = loadBest(info.id);
    const open = i < hubOpen;
    return { name: info.name, open, note: !open ? 'LOCKED' : best ? `★ ${best.stars}/${STAR_TOTALS[i]} · ${best.score}` : 'NEW!' };
  }), `★ ${got}/${STAR_TOTALS.reduce((a, b) => a + b, 0)} · PICK A DOOR`);
}
hubOpen = openCount();
let level = buildCurrent();
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
/** Online: counts the games started in this room, so stray snapshots of the previous one are ignored. */
let run = 0;
/** Shows the room code, and whether the two players are linked directly or through the server. */
const roomLabel = () => { if (net && mode !== 'local') $('whoText').textContent = `Room ${net.code}${net.direct ? ' ⚡' : ''}`; };
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
  show('stats', levelIndex !== HUB);
  $('quit').textContent = levelIndex !== HUB && m !== 'guest' ? 'Hub' : 'Menu';
  if (!inGame) kb.touch.show(null);
}

/** Switch the course that is played and drawn. Call right before starting a session. */
function useLevel(i: number, open = openCount()) {
  if (i === levelIndex && i !== HUB) return; // the hub is rebuilt: its doors and signs change
  levelIndex = i;
  hubOpen = open;
  level = buildCurrent();
  view.setLevel(level);
  lastSnap = null; // snapshots of the old level don't fit the new one
}

function toMenu(message = '') {
  net?.close();
  net = null;
  peerHere = false;
  setSession(new HostSession(RAPIER, { local: emptyInputs, chaos: false, level: buildCurrent }), 'menu');
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
    shared: `<span><b>LEGS</b> ${PAD_LEGS}</span><span><b>ARMS</b> right stick hand · ${K('RB')} grab/drop/pull · hold ${K('RT')} throw</span>`,
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

function startLocal(levelIdx: number) {
  useLevel(levelIdx);
  setSession(new HostSession(RAPIER, { level: buildCurrent, chaos: levelIdx !== HUB, local: () => ({ legs: kb.legs('shared'), arms: kb.arms('shared') }) }), 'local');
  show('menu', false);
  $('whoText').textContent = 'Solo';
  useControls('shared');
}

const sendStart = () => net?.send({ k: 'start', hostRole, level: levelIndex, open: hubOpen, run });

function startHosting(levelIdx: number) {
  const role = hostRole;
  useLevel(levelIdx);
  run++;
  setSession(new HostSession(RAPIER, {
    net: net!,
    run,
    level: buildCurrent,
    chaos: levelIdx !== HUB,
    local: () => (role === 'legs' ? { legs: kb.legs('solo') } : { arms: kb.arms('solo') }),
  }), 'host');
  show('lobby', false);
  roomLabel();
  useControls(role);
  sendStart();
}

function startGuest(role: Role, levelIdx: number, open: number) {
  useLevel(levelIdx, open);
  setSession(new GuestSession(net!, role, () => (role === 'legs' ? kb.legs('solo') : kb.arms('solo'))), 'guest');
  show('lobby', false);
  roomLabel();
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

const sendLobby = () => net?.send({ k: 'lobby', hostRole });

async function createRoom() {
  try {
    net = await NetClient.connect();
    await net.createRoom();
  } catch (e) {
    return toMenu((e as Error).message);
  }
  peerHere = false;
  run = 0;
  net.onLink = roomLabel;
  net.onPeerJoined = () => {
    peerHere = true;
    if (mode === 'host' && host) {
      host.waiting = false;
      show('notice', false);
      sendStart();
    } else {
      sendLobby();
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
    else if (m.k === 'start') { hostRole = m.hostRole; run = m.run; startGuest(otherRole(m.hostRole), m.level, m.open); }
    else if (m.k === 'snap') { if (m.run === run) guest?.receive(m.s); }
    else if (m.k === 'restart') { guest?.clear(); view.reset(); show('results', false); resultsTimer = 0; }
  };
  net.onLink = roomLabel;
  net.onPeerLeft = () => toMenu('The host left the room.');
  net.onClose = () => toMenu('Lost connection to the game server.');
  renderLobby(false);
}

/** Start a level, or the hub, in whichever way this session is being played. */
function go(levelIdx: number) {
  if (mode === 'host') startHosting(levelIdx);
  else startLocal(levelIdx);
}
$('btnSolo').onclick = () => startLocal(HUB);
$('btnCreate').onclick = createRoom;
$('btnJoin').onclick = joinRoom;
$('joinCode').onkeydown = (e) => { if (e.key === 'Enter') void joinRoom(); };
$('roleLegs').onclick = () => { hostRole = 'legs'; sendLobby(); renderLobby(true); };
$('roleArms').onclick = () => { hostRole = 'arms'; sendLobby(); renderLobby(true); };
$('btnStart').onclick = () => startHosting(HUB);
$('btnLeave').onclick = () => toMenu();
// The host (or solo player) steps back to the hub; a guest can only leave the room.
const leave = () => (mode === 'guest' || levelIndex === HUB ? toMenu() : go(HUB));
$('btnMenu').onclick = leave;
$('quit').onclick = leave;
$('btnAgain').onclick = () => {
  host?.restart();
  view.reset();
  resultsTimer = 0;
  show('results', false);
};

$('btnNext').onclick = () => {
  const next = levelIndex + 1;
  if (next < LEVELS.length) go(next);
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
      $('resLevel').textContent = LEVELS[levelIndex].name;
      const id = LEVELS[levelIndex].id;
      const isBest = saveBest(id, { score: final, stars, time });
      $('resBest').textContent = isBest ? 'New best!' : `Your best: ${loadBest(id)?.score ?? final}`;
      show('btnAgain', mode !== 'guest');
      $('btnMenu').textContent = mode === 'guest' ? 'Leave room' : 'Back to hub';
      show('btnNext', mode !== 'guest' && levelIndex + 1 < LEVELS.length);
      $('btnAgain').className = levelIndex + 1 < LEVELS.length ? 'alt' : '';
      show('resWait', mode === 'guest');
      show('results', true);
    }
  }
}

// Dev-only handle for poking at the running game from the console.
if (import.meta.env.DEV) (window as any).__game = {
  get host() { return host; },
  get snap() { return lastSnap; },
  levels: LEVELS,
  startLocal,
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
    // In the hub, walking into an open door starts that level.
    if (host && levelIndex === HUB) {
      const p = host.sim.monster.pos;
      const door = hubDoorAt(p.x, p.z, LEVELS.length);
      if (door >= 0 && door < hubOpen) return go(door);
    }
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
