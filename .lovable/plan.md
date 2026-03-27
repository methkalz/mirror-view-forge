

# Skyfall Survival — Top-Down 2D Survival Game

A mobile-first browser game where the player dodges falling missiles and shrapnel, collects power-ups, and survives as long as possible for a high score.

## Phase 1 — Core Game

### 1. Game Canvas & Structure
- Full-screen responsive Canvas component (100vw × 100vh)
- Game loop using requestAnimationFrame targeting 60 FPS
- Game states: Start Screen → Playing → Game Over (with score display)
- Cracked asphalt ground texture drawn via Canvas

### 2. Player & Controls
- Player character rendered as a top-down sprite on the canvas
- Virtual joystick appears on left half of screen on touch
- Dash button on right half of screen for quick dodge
- Keyboard support (WASD/arrows + Space for dash) on desktop
- Smooth 8-directional movement with bounded area

### 3. Falling Hazards System
- Missiles and shrapnel fall from top of screen with randomized patterns
- Red shadow/circle warning indicator grows on ground before impact
- Three threat types: fast shrapnel (light damage), standard missiles (medium damage + crater), cluster missiles (split into 3 pieces mid-fall)
- Object pooling for efficient memory management
- Collision detection between player and projectiles

### 4. Health & Scoring
- Health bar UI at top of screen
- Score counter increases every second of survival
- Game ends when health reaches zero
- Difficulty scaling: missile frequency increases every 30 seconds

### 5. Power-ups
- Randomly spawning pickups: Medkit (heals), Shield (blocks one hit with blue aura), Interceptor (auto-destroys 3 nearest missiles)

### 6. Visual Effects
- Screen shake on missile impact
- Simple particle explosions on impact
- Temporary crater marks on ground
- Red flash overlay when player takes damage

## Phase 2 — Advanced Features

### 7. Advanced Threats
- Cluster missiles (appear after 45s): split into 3 shrapnel mid-air
- Homing drones (appear after 60s): enter from screen edges, track player with simple AI, destroyed by interceptors or luring into explosions

### 8. Parachute Drops
- Power-ups descend slowly from top with parachute visual instead of appearing instantly
- Interceptors launch 3 homing projectiles that destroy nearest threats with explosion effects

### 9. Close Call Mechanic
- Detect near-misses (close to explosion but no damage)
- Show floating "Close Call!" text that rises and fades
- Award +50 bonus points

### 10. Audio (Web Audio API)
- Synthesized sound effects for explosions, pickups, damage, and dash
- Placeholder system ready for MP3 replacement

