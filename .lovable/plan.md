

# Skyfall Survival — Major Overhaul

The current game uses basic circles and allows free movement in all directions. This plan transforms it into a visually polished, fun survival game with a human character, ground-restricted movement, better physics, and richer visual effects.

## 1. Human Player Character (Procedural Sprite)

Replace the circle with a procedurally drawn human figure using Canvas paths — no sprite sheet needed.

- **Idle pose**: Standing figure with body, head, arms, legs drawn via Canvas shapes
- **Walk animation**: 4-frame walk cycle (alternating leg/arm positions) driven by a frame timer
- **Run animation**: Faster cycle when dashing, with lean angle
- **Direction facing**: Character faces left/right based on movement direction
- **Hit reaction**: Brief red flash and knockback animation
- **Shadow**: Oval shadow beneath the character for grounding

## 2. Ground-Only Horizontal Movement

Currently the player moves freely in all directions including upward. Change to:

- **Restrict vertical movement**: Player stays on a ground plane (bottom ~30% of screen)
- **Horizontal movement**: Full left/right movement along the ground
- **Dodge roll**: Replace the generic dash with a visible roll animation (horizontal only)
- **Jump/duck** (optional): Small jump to dodge low debris, duck to avoid aerial threats
- The camera perspective shifts to a **side-view** instead of top-down, making missiles fall from above naturally

## 3. Improved Visual Environment

Replace the flat grey ground with a richer scene:

- **Parallax sky background**: Gradient sky with moving clouds at different speeds
- **City skyline silhouette**: Dark buildings in the mid-ground with lit windows
- **Textured ground**: Asphalt/concrete surface with cracks, debris details
- **Dust particles**: Ambient floating dust/ash particles for atmosphere
- **Dynamic lighting**: Explosions cast brief orange glow on nearby surfaces
- **Better craters**: Scorched marks with debris rings and smoke wisps

## 4. Improved Hazard Visuals

- **Missiles**: Properly shaped with fins, exhaust trails (particle stream), rotation
- **Shrapnel**: Angular metal chunks with spin and sparks
- **Cluster bombs**: Glowing sphere that visibly splits with connecting lines
- **Warning indicators**: Crosshair/target reticle instead of plain circles, with pulsing animation
- **Explosion effects**: Multi-stage explosion — flash → fireball → smoke ring → debris scatter
- **Smoke trails**: Missiles leave fading smoke trails as they fall

## 5. Better Physics & Game Feel

- **Gravity on particles**: Particles arc downward instead of moving linearly
- **Momentum**: Player has acceleration/deceleration, not instant stop
- **Screen shake improvement**: Directional shake based on explosion position, with frequency variation
- **Camera follow**: Slight camera lag following player for dynamic feel
- **Debris bounce**: Small debris pieces bounce on ground after explosions
- **Wind effect**: Slight horizontal drift on falling objects

## 6. Enhanced Audio

- **Richer explosions**: Layered sounds — bass thump + crackle + debris scatter
- **Footstep sounds**: Rhythmic taps synced to walk animation
- **Ambient wind**: Low continuous background sound
- **Warning siren**: Rising tone when hazard warning appears
- **Impact variety**: Different sounds for different surfaces/sizes

## 7. Improved HUD & UI

- **Health bar**: Styled with icon, gradient fill, damage tick marks
- **Score**: Animated counter with combo multiplier display
- **Wave indicator**: Cleaner design with progress bar to next wave
- **Start screen**: Animated background with falling missiles, better typography
- **Game over**: Stats summary (time survived, close calls, power-ups collected)

## Technical Approach

All changes are in 4 files:
- **`src/game/types.ts`** — Add animation state, facing direction, camera offset, player grounding fields
- **`src/game/engine.ts`** — Restrict Y movement to ground zone, add momentum physics, improve particle gravity, animation frame cycling
- **`src/game/renderer.ts`** — Complete visual overhaul: procedural human character, parallax background, improved explosions, smoke trails, better HUD
- **`src/game/audio.ts`** — Richer layered sound effects, ambient audio, footsteps

No external assets or sprite sheets needed — everything is procedurally drawn with Canvas API.

