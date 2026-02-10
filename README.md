# Shot Parameter Visualizer – Team 1700

Interactive webapp for visualizing valid shooting positions on a 2D FRC field.

Given configurable shot speed, hood angle, and robot velocity constraints, the tool
computes and displays which field positions can produce a valid shot into the target
(blue hub), along with the required shot speed and hood angle at each position.

## Features

- **Field map heatmap** showing valid/invalid shooting zones across the 2D field
- **Range chart** — multi-panel view sweeping distance × tangential velocity × radial velocity
- **Fixed or variable** shot speed and hood angle modes
- **Robot velocity** sliders (tangential and radial) to see how motion affects the shooting envelope
- **Hover tooltip** with per-position shot details (speed, angle, flight time, apex, descent angle)
- **Shot detail modal** — click any valid cell for side/top/back trajectory views and full shot parameters
- **Color modes**: descent angle (default, fixed 15°–60° scale), shot speed, or hood angle
- **Adjustable target**, shooter height, ceiling height, and grid resolution
- **Shareable deep links** — all control state is encoded in the URL

## Physics

The shot calculator is a direct JavaScript port of the Java `ShotCalculator` used on the
robot. It uses a 2D sweep over (speed, angle) candidates followed by Newton's method
refinement to find descending trajectories that clear the ceiling and hit the target height.

## Development

Requires Node.js. Built with [Vite](https://vitejs.dev/) and TypeScript.

```bash
npm install
npm run dev
```

This starts a dev server (default `http://localhost:5173`) with hot module replacement — edits to any `.ts` file are reflected instantly.

### Build

```bash
npm run build
```

Outputs a production bundle to `dist/`.

## Deployment

Deployed via GitHub Pages using the GitHub Actions workflow in `.github/workflows/deploy.yml`, which runs the Vite build and publishes the `dist/` output.
