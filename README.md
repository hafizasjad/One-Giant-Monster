# One Giant Monster

Two players, one wobbly monster. One player is the **legs**, the other is the **arms**. Get the monster through the obstacle course.

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

## Controls

| | One keyboard | Online (own keyboard) |
|---|---|---|
| Legs | `WASD` move, `Space` jump | `WASD` or arrows, `Space` jump |
| Arms | arrows move the hand, `,` `.` reach in/out, `Right Shift` grab / drop / pull lever, hold `Enter` then release to throw | `WASD` or arrows, `Q` `E` reach, `Space` grab / drop / pull, hold `F` then release to throw |

`M` mutes sound.

**Controller** (standard layout): Legs use the left stick or d-pad and `A` to jump. Arms use the left stick for the hand, `LB` / `RB` (or right stick) to reach, `A` to grab / drop / pull, hold `X` or `RT` then release to throw. Online, any controller drives your role. On one device, controller 1 is the legs and controller 2 is the arms; with a single controller the arms stay on the keyboard.

**Touch**: on phones and tablets a joystick and buttons appear on screen for your role (both roles when playing on one device, which wants a tablet). Add `?touch=1` to the address to try them with a mouse.

## How it fits together

- `src/game/` is the simulation: no DOM or rendering, driven by one input per role (`shared/protocol.ts`). Adding a body part means adding a role there.
- `src/input/` merges keyboard, controllers and touch into those per-role inputs.
- `src/render/` draws snapshots of the simulation; `src/net/` runs it on the room creator's machine and streams snapshots to the other player.
- `server/index.ts` only manages rooms and relays messages.
- `npm test` runs the headless simulation tests.
