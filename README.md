# Neon Snowball VR ⛄❄️

A winter wonderland snowball fight arcade built with [IWSDK](https://iwsdk.dev) (Meta's WebXR framework). Defend against waves of snowman enemies, charge elemental snowballs, and survive the blizzard!

**[▶ Play Now](https://ellyz2426.github.io/neon-snowball/)**

## Gameplay

Survive increasingly difficult waves of snowball-throwing snowmen in a neon-lit winter arena. Throw snowballs, dodge attacks, collect power-ups, and use the environment to your advantage.

### Controls

| Action | Browser | VR |
|--------|---------|-----|
| Throw Snowball | Click | Trigger |
| Charge Snowball | Hold Click | Hold Trigger |
| Move | WASD | Thumbstick |
| Look | Mouse | Head/Controller |
| Pause | Escape / P | — |

### Charge System
- **Tap** — Quick normal snowball
- **Hold to 50%** — **ICE snowball** (slows enemies for 3s)
- **Hold to 80%** — **FIRE snowball** (AoE splash damage, 3-ball spread shot)

## Features

### Combat
- 6 enemy types: Basic, Speedy, Tank, Bomber, Yeti, Boss
- Enemy AI: dodging, flanking, coordinated attacks
- Boss every 5th wave with ground pound + charge attacks
- Combo scoring with multiplier chain
- Elemental snowball system (Normal / Ice / Fire)
- Spread shot mechanic for crowd control

### Environment
- Winter wonderland arena with snow, forts, trees, lamps, frozen pond
- **Destructible forts** — enemy snowballs damage forts, which rebuild between waves
- Dynamic weather system (Clear → Light Snow → Heavy Snow → Blizzard)
- Sky dome with twinkling stars and animated aurora curtains
- Falling snow particles, ground wind drifts, flickering campfires
- Icicle environmental hazards (wave 3+)
- Ice patches from Yeti boulders that speed up enemies

### Power-ups
| Power-up | Effect | Duration |
|----------|--------|----------|
| 🔴 Giant | Area damage snowballs | 10s |
| ⚡ Rapid Fire | Fast throwing | 10s |
| 🛡️ Shield | Block incoming hits | 8s |
| ❄️ Freeze | Slow all enemies | 6s |
| 🌪️ Blizzard Blast | AoE freeze + massive particle burst | 4s |

### UI & Audio
- 6 spatial UIKitMLAsset panels (Menu, HUD, Pause, Results, Settings, Tutorial)
- Fort health status indicator in HUD
- Procedural audio with element-specific sounds
- Weather-responsive ambient wind
- Visual telegraphs for boss charges and bomber AoE

### Technical
- IWSDK 0.5.1 with UIKitMLAsset spatial UI
- XR controller support + browser dual runtime
- 3 difficulty levels (Easy / Normal / Hard)
- High score persistence via localStorage
- Statistics tracking (throws, accuracy, play time)

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
npx iwsdk dev

# Build for production
npm run build

# Type check
npx tsc --noEmit
```

## Built With

- [IWSDK](https://iwsdk.dev) — Meta's Immersive Web SDK
- [Three.js](https://threejs.org/) — 3D rendering (via IWSDK)
- [EliCS](https://github.com/elixr-games/elics) — Entity Component System

## License

MIT
