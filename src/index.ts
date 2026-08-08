import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ArenaSystem } from './arena-system.js';
import { SnowballSystem } from './snowball-system.js';
import { EnemySystem } from './enemy-system.js';
import { GameSystem } from './game-system.js';
import { UISystem } from './ui-system.js';
import { AudioSystem } from './audio-system.js';
import { EffectsSystem } from './effects-system.js';

World.create(
	document.getElementById('scene-container') as HTMLDivElement,
	projectOptions,
).then((world) => {
	// Priority order: arena first, then game logic, then rendering/UI
	world.registerSystem(ArenaSystem);      // Environment setup
	world.registerSystem(GameSystem);       // Wave/scoring logic
	world.registerSystem(SnowballSystem);   // Snowball physics
	world.registerSystem(EnemySystem);      // Enemy AI
	world.registerSystem(EffectsSystem);    // Particle effects
	world.registerSystem(AudioSystem);      // Sound effects
	world.registerSystem(UISystem);         // UI panels (last)
});
