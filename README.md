# One Giant Monster

One wobbly monster with two brains: the **legs** and the **arms**. Play online with a friend (one each), or solo with both. Get the monster through the obstacle course.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. For online play on your network, the second player opens `http://<your-ip>:5173` and joins with the room code.

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

4. Create the service. When the deploy shows as live, share the `https://<name>.onrender.com` address; one player creates a room and the other joins with the code.

Notes:

- `--include=dev` is needed because Vite and TypeScript are dev dependencies.
- `NODE_VERSION` is needed because the server runs its TypeScript file directly, which needs Node 22.18 or newer.
- Render sets `PORT` itself; the server reads it.
- Every push to `main` redeploys. A redeploy or restart closes open rooms, and everyone must reload the page to get the new version.
- On the free plan the service sleeps after about 15 minutes without visitors and takes up to a minute to wake.

## Controls

| | Online (one role each) | Solo (both roles) |
|---|---|---|
| Legs | `WASD` or arrows, `Space` jump | `WASD` move, `Space` jump |
| Arms | `WASD` or arrows, `Q` `E` reach, `Space` grab / drop / pull, hold `F` then release to throw | arrows move the hand, `,` `.` reach in/out, `Right Shift` grab / drop / pull lever, hold `Enter` then release to throw |

`M` mutes sound.

**Controller** (standard layout). Online: Legs use the left stick or d-pad and `A` to jump; Arms use the left stick for the hand, `LB` / `RB` (or right stick) to reach, `A` to grab / drop / pull, hold `X` or `RT` then release to throw. Solo: left stick and `A` are the legs; the right stick is the hand, `RB` grabs and `RT` throws.

**Touch**: on phones and tablets a joystick and buttons appear on screen. Solo has a move stick on the left with Jump, and a hand stick on the right with Grab and Throw; it works upright or sideways. Add `?touch=1` to the address to try them with a mouse.

## How it fits together

- `src/game/` is the simulation: no DOM or rendering, driven by one input per role (`shared/protocol.ts`). Adding a body part means adding a role there.
- `src/input/` merges keyboard, controllers and touch into those per-role inputs.
- `src/render/` draws snapshots of the simulation; `src/net/` runs it on the room creator's machine and streams snapshots to the other player.
- `server/index.ts` only manages rooms and relays messages.
- `npm test` runs the headless simulation tests.
