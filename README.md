# One Giant Monster

Two to four players, one wobbly monster. Between you, you are its **legs**, **arms**, **head** and **special powers**. Get the monster through the obstacle course.

| Role | Does |
|---|---|
| Legs | walks and jumps |
| Arms | steers the hand: grab, carry, throw, pull levers |
| Head | steers where the monster looks (the camera swings with it); ghost platforms and ghost stars only exist while the gaze spot is on them |
| Special | **Roar** shoves loose things away and shatters cracked walls; **Stomp** slams the ground, and from mid-air it presses heavy buttons |

All four roles are always in play. With fewer than four players some people hold two (by default Legs + Special and Arms + Head); the host can change who plays what in the lobby.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. For online play on your network, the other players open `http://<your-ip>:5173` and join with the room code.

To serve the built game and the room server from one port:

```bash
npm run build
npm start
```

Then open http://localhost:3001 (set `PORT` to change it).

## Deploy on Render

The room server also serves the built game, so one Render web service runs everything.

1. Push the project to a GitHub repository.
2. In the Render dashboard choose **New → Web Service** and connect the repository.
3. Use these settings:

   | Setting | Value |
   |---|---|
   | Language | Node |
   | Branch | `main` |
   | Build command | `npm install --include=dev && npm run build` |
   | Start command | `npm start` |
   | Environment variable | `NODE_VERSION` = `24` |

4. Create the service. When the deploy shows as live, share the `https://<name>.onrender.com` address; one player creates a room and the others join with the code.

Notes:

- `--include=dev` is needed because Vite and TypeScript are dev dependencies.
- `NODE_VERSION` is needed because the server runs its TypeScript file directly, which needs Node 22.18 or newer.
- Render sets `PORT` itself; the server reads it.
- Every push to `main` redeploys. A redeploy or restart closes open rooms, and everyone must reload the page to get the new version.
- On the free plan the service sleeps after about 15 minutes without visitors and takes up to a minute to wake.

## Controls

| | Online, your own keyboard | Everyone on one keyboard | Controller |
|---|---|---|---|
| Legs | `WASD` move, `Space` jump | `WASD`, `Space` | left stick or d-pad, `A` jump |
| Arms | `WASD` hand, `Q` `E` reach, `Space` grab / drop / pull, hold `F` then release to throw | arrows, `,` `.`, `Right Shift`, hold `Enter` | left stick, `LB` `RB` reach, `A` grab, hold `X` or `RT` to throw |
| Head | arrow keys | `I` `J` `K` `L` | right stick |
| Special | `R` roar, `C` stomp | `Z` roar, `X` stomp | `B` roar, `Y` stomp |

- Online, the arrow keys also move the legs or the hand unless you are the head as well. If you only play the head, `WASD` looks too.
- If one person online holds both legs and arms, they get the one-keyboard layout.
- Controllers on one device: controller 1 is legs + special, controller 2 is arms + head.
- **Touch**: on phones and tablets a joystick and buttons appear for the roles you hold. All four roles on one phone is very cramped; use a tablet. Add `?touch=1` to the address to try them with a mouse.
- `M` mutes sound.

## How it fits together

- `src/game/` is the simulation: no DOM or rendering, driven by one input per role (`shared/protocol.ts`). Adding a body part means adding a role there.
- `src/input/` merges keyboard, controllers and touch into those per-role inputs.
- `src/render/` draws snapshots of the simulation; `src/net/` runs it on the room creator's machine and streams snapshots to the other players.
- `server/index.ts` only manages rooms (a host and up to three guests) and relays messages.
- `npm test` runs the headless simulation tests.
