# Shot Parameter Visualizer – Team 1700

Interactive webapp for visualizing valid shooting positions on a 2D FRC field.

Given configurable shot speed, hood angle, and robot velocity constraints, the tool
computes and displays which field positions can produce a valid shot into the target
(blue hub), along with the required shot speed and hood angle at each position.

## Features

- **2D field heatmap** showing valid/invalid shooting zones
- **Fixed or variable** shot speed and hood angle modes
- **Robot velocity** sliders (tangential and radial) to see how motion affects the shooting envelope
- **Hover tooltip** with per-position shot details (speed, angle, flight time, apex height)
- **Color modes** for shot speed or hood angle visualization
- **Adjustable target**, shooter height, ceiling height, and grid resolution

## Physics

The shot calculator is a direct JavaScript port of the Java `ShotCalculator` used on the
robot. It uses a 2D sweep over (speed, angle) candidates followed by Newton's method
refinement to find descending trajectories that clear the ceiling and hit the target height.

## Deployment

This is a single `index.html` file with zero dependencies. To deploy with GitHub Pages:

1. Push this repo to GitHub
2. Go to **Settings > Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose the **main** branch and **/ (root)** folder
5. Save — the site will be live at `https://<org>.github.io/rebuilt_shot_visualizer/`

Or just open `index.html` locally in any browser.

## Development

No build step required. Edit `index.html` and refresh.
