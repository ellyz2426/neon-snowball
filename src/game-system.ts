/**
 * GameSystem — wave management, power-ups, game flow controller.
 */
import {
	createSystem,
	Mesh,
	MeshStandardMaterial,
	MeshBasicMaterial,
	SphereGeometry,
	OctahedronGeometry,
	Vector3,
	Color,
	PointLight,
} from '@iwsdk/core';
import {
	gameState,
	GameState,
	enemies,
	snowballs,
	powerUps,
	activePowerUps,
	damageZones,
	floatingTexts,
	icicles,
	icePatches,
	systemRefs,
	EnemyType,
	PowerUpType,
	PowerUpData,
	ActivePowerUp,
	WeatherType,
	getWaveEnemyCount,
	isBossWave,
	resetGameState,
	NEON_CYAN,
	NEON_PINK,
	NEON_GREEN,
	NEON_PURPLE,
	ARENA_RADIUS,
} from './game-state.js';
import { EnemySystem } from './enemy-system.js';

const WAVE_DELAY = 3;
const POWER_UP_SPAWN_INTERVAL = 15;
const COMBO_TIMEOUT = 3;

export class GameSystem extends createSystem({}) {
	private waveDelay = 0;
	private powerUpTimer = 0;
	private spawnQueue: EnemyType[] = [];
	private spawnTimer = 0;
	private spawnInterval = 0.8;

	init(): void {
		// Load high score
		try {
			const saved = localStorage.getItem('neon-snowball-highscore');
			if (saved) gameState.highScore = parseInt(saved, 10);
		} catch {}
	}

	update(delta: number): void {
		// Combo timer
		if (gameState.comboTimer > 0) {
			gameState.comboTimer -= delta;
			if (gameState.comboTimer <= 0) {
				gameState.combo = 0;
			}
		}

		// Active power-ups
		for (let i = activePowerUps.length - 1; i >= 0; i--) {
			const ap = activePowerUps[i];
			ap.remaining -= delta;
			if (ap.remaining <= 0) {
				this.deactivatePowerUp(ap.type);
				activePowerUps.splice(i, 1);
			}
		}

		if (gameState.state === GameState.PLAYING) {
			this.updatePlaying(delta);
		} else if (gameState.state === GameState.WAVE_COMPLETE) {
			this.updateWaveComplete(delta);
		}
	}

	private updatePlaying(delta: number): void {
		// Spawn queued enemies
		if (this.spawnQueue.length > 0) {
			this.spawnTimer -= delta;
			if (this.spawnTimer <= 0) {
				const type = this.spawnQueue.shift()!;
				EnemySystem.spawnEnemy(type);
				this.spawnTimer = this.spawnInterval;
			}
		}

		// Power-up spawning
		this.powerUpTimer -= delta;
		if (this.powerUpTimer <= 0 && powerUps.length < 2) {
			this.spawnPowerUp();
			this.powerUpTimer = POWER_UP_SPAWN_INTERVAL;
		}

		// Update power-up bobbing
		this.updatePowerUps(delta);

		// Check wave complete
		if (
			gameState.enemiesRemaining <= 0 &&
			this.spawnQueue.length === 0 &&
			enemies.length === 0
		) {
			gameState.state = GameState.WAVE_COMPLETE;
			this.waveDelay = WAVE_DELAY;
			window.dispatchEvent(new CustomEvent('wave-complete', {
				detail: { wave: gameState.wave },
			}));
		}
	}

	private updateWaveComplete(delta: number): void {
		this.waveDelay -= delta;
		if (this.waveDelay <= 0) {
			this.startNextWave();
		}
	}

	startNextWave(): void {
		gameState.wave++;
		gameState.state = GameState.PLAYING;
		gameState.enemiesKilled = 0;

		const count = getWaveEnemyCount(gameState.wave);
		gameState.waveEnemiesTotal = count;
		gameState.enemiesRemaining = count;

		// Weather transitions every 3 waves
		this.updateWeather();

		// Build spawn queue
		this.spawnQueue = [];

		if (isBossWave(gameState.wave)) {
			// Boss wave: boss + some minions
			this.spawnQueue.push(EnemyType.BOSS);
			for (let i = 0; i < count - 1; i++) {
				this.spawnQueue.push(this.randomEnemyType());
			}
		} else {
			for (let i = 0; i < count; i++) {
				this.spawnQueue.push(this.randomEnemyType());
			}
		}

		this.spawnTimer = 0;
		this.spawnInterval = Math.max(0.3, 0.8 - gameState.wave * 0.02);
		this.powerUpTimer = 8;

		window.dispatchEvent(new CustomEvent('wave-start', {
			detail: { wave: gameState.wave, count },
		}));
	}

	private randomEnemyType(): EnemyType {
		const wave = gameState.wave;
		const roll = Math.random();

		// Smoother progression: introduce types gradually
		// Wave 1-2: mostly basics, occasional speedy
		// Wave 3-4: speedy common, tank introduced
		// Wave 5-7: tanks regular, bombers introduced
		// Wave 6+: yetis introduced
		// Wave 8+: everything in mix

		if (wave <= 2) {
			return roll < 0.15 ? EnemyType.SPEEDY : EnemyType.BASIC;
		}
		if (wave <= 4) {
			if (roll < 0.05 * wave) return EnemyType.TANK;
			if (roll < 0.25 + wave * 0.05) return EnemyType.SPEEDY;
			return EnemyType.BASIC;
		}
		if (wave <= 6) {
			if (roll < 0.08) return EnemyType.YETI;
			if (roll < 0.18) return EnemyType.BOMBER;
			if (roll < 0.35) return EnemyType.TANK;
			if (roll < 0.55) return EnemyType.SPEEDY;
			return EnemyType.BASIC;
		}
		// Wave 7+
		if (roll < 0.12) return EnemyType.YETI;
		if (roll < 0.25) return EnemyType.BOMBER;
		if (roll < 0.4) return EnemyType.TANK;
		if (roll < 0.6) return EnemyType.SPEEDY;
		return EnemyType.BASIC;
	}

	private updateWeather(): void {
		const wave = gameState.wave;
		const weatherCycle: WeatherType[] = [
			WeatherType.CLEAR,
			WeatherType.LIGHT_SNOW,
			WeatherType.HEAVY_SNOW,
			WeatherType.BLIZZARD,
		];
		// Cycle through weather every 3 waves
		const weatherIdx = Math.floor((wave - 1) / 3) % weatherCycle.length;
		const newWeather = weatherCycle[weatherIdx];

		if (newWeather !== gameState.weather) {
			gameState.weather = newWeather;
			window.dispatchEvent(new CustomEvent('weather-change', {
				detail: { weather: newWeather },
			}));
		}
	}

	private spawnPowerUp(): void {
		if (!systemRefs.powerUpGroup) return;

		const types = [PowerUpType.GIANT, PowerUpType.RAPID, PowerUpType.SHIELD, PowerUpType.FREEZE];
		// Blizzard Blast: available from wave 4+, rarer
		if (gameState.wave >= 4 && Math.random() < 0.25) {
			types.push(PowerUpType.BLIZZARD_BLAST);
		}
		const type = types[Math.floor(Math.random() * types.length)];

		const colors: Record<PowerUpType, number> = {
			[PowerUpType.GIANT]: NEON_PINK,
			[PowerUpType.RAPID]: NEON_CYAN,
			[PowerUpType.SHIELD]: NEON_GREEN,
			[PowerUpType.FREEZE]: NEON_PURPLE,
			[PowerUpType.BLIZZARD_BLAST]: 0xaaddff,
		};

		const geo = new OctahedronGeometry(0.2, 0);
		const mat = new MeshStandardMaterial({
			color: colors[type],
			emissive: new Color(colors[type]),
			emissiveIntensity: 0.6,
			transparent: true,
			opacity: 0.85,
			metalness: 0.3,
			roughness: 0.2,
		});
		const mesh = new Mesh(geo, mat);

		// Random position in arena
		const angle = Math.random() * Math.PI * 2;
		const dist = 3 + Math.random() * 5;
		mesh.position.set(Math.cos(angle) * dist, 1.0, Math.sin(angle) * dist);

		// Add glow light
		const glow = new PointLight(colors[type], 0.5, 4);
		glow.position.copy(mesh.position);
		systemRefs.powerUpGroup.add(glow);

		systemRefs.powerUpGroup.add(mesh);

		powerUps.push({
			mesh,
			type,
			lifetime: 20,
			bobPhase: Math.random() * Math.PI * 2,
		});
	}

	private updatePowerUps(delta: number): void {
		const playerPos = new Vector3();
		this.world.camera.getWorldPosition(playerPos);

		for (let i = powerUps.length - 1; i >= 0; i--) {
			const pu = powerUps[i];
			pu.lifetime -= delta;
			pu.bobPhase += delta * 2;

			// Bobbing and rotation
			pu.mesh.position.y = 1.0 + Math.sin(pu.bobPhase) * 0.15;
			pu.mesh.rotation.y += delta * 1.5;
			pu.mesh.rotation.x += delta * 0.8;

			// Check player proximity
			const dist = pu.mesh.position.distanceTo(playerPos);
			if (dist < 1.5) {
				this.activatePowerUp(pu.type);
				this.removePowerUp(i);
				continue;
			}

			if (pu.lifetime <= 0) {
				this.removePowerUp(i);
			}
		}
	}

	private removePowerUp(index: number): void {
		const pu = powerUps[index];
		systemRefs.powerUpGroup?.remove(pu.mesh);
		pu.mesh.geometry.dispose();
		(pu.mesh.material as MeshStandardMaterial).dispose();
		powerUps.splice(index, 1);
	}

	private activatePowerUp(type: PowerUpType): void {
		const duration = type === PowerUpType.SHIELD ? 8
			: type === PowerUpType.FREEZE ? 6
			: type === PowerUpType.BLIZZARD_BLAST ? 4
			: 10;

		// Remove existing of same type
		for (let i = activePowerUps.length - 1; i >= 0; i--) {
			if (activePowerUps[i].type === type) {
				this.deactivatePowerUp(type);
				activePowerUps.splice(i, 1);
			}
		}

		activePowerUps.push({ type, remaining: duration });

		switch (type) {
			case PowerUpType.GIANT:
				gameState.giantSnowballActive = true;
				break;
			case PowerUpType.RAPID:
				gameState.rapidFireActive = true;
				break;
			case PowerUpType.SHIELD:
				gameState.shieldActive = true;
				break;
			case PowerUpType.FREEZE:
				gameState.freezeActive = true;
				break;
			case PowerUpType.BLIZZARD_BLAST:
				gameState.blizzardBlastActive = true;
				gameState.blizzardBlastTimer = duration;
				window.dispatchEvent(new CustomEvent('blizzard-blast'));
				break;
		}

		window.dispatchEvent(new CustomEvent('powerup-collected', { detail: { type } }));
	}

	private deactivatePowerUp(type: PowerUpType): void {
		switch (type) {
			case PowerUpType.GIANT:
				gameState.giantSnowballActive = false;
				break;
			case PowerUpType.RAPID:
				gameState.rapidFireActive = false;
				break;
			case PowerUpType.SHIELD:
				gameState.shieldActive = false;
				break;
			case PowerUpType.FREEZE:
				gameState.freezeActive = false;
				break;
			case PowerUpType.BLIZZARD_BLAST:
				gameState.blizzardBlastActive = false;
				gameState.blizzardBlastTimer = 0;
				break;
		}
	}

	/** Called externally to start a new game */
	startNewGame(): void {
		// Clear all existing objects
		this.clearAll();
		resetGameState();
		gameState.state = GameState.PLAYING;
		this.startNextWave();
	}

	/** Called externally to restart */
	restart(): void {
		this.clearAll();
		resetGameState();
		gameState.state = GameState.PLAYING;
		this.startNextWave();
	}

	clearAll(): void {
		// Remove all snowballs
		for (const sb of snowballs) {
			systemRefs.snowballGroup?.remove(sb.mesh);
			sb.mesh.geometry.dispose();
			(sb.mesh.material as MeshStandardMaterial).dispose();
		}
		snowballs.length = 0;

		// Remove all enemies
		for (const e of enemies) {
			systemRefs.enemyGroup?.remove(e.group);
		}
		enemies.length = 0;

		// Remove all power-ups
		for (const pu of powerUps) {
			systemRefs.powerUpGroup?.remove(pu.mesh);
			pu.mesh.geometry.dispose();
			(pu.mesh.material as MeshStandardMaterial).dispose();
		}
		powerUps.length = 0;

		activePowerUps.length = 0;
		this.spawnQueue = [];

		// Remove all damage zones
		for (const dz of damageZones) {
			systemRefs.damageZoneGroup?.remove(dz.mesh);
			dz.mesh.geometry.dispose();
			(dz.mesh.material as MeshBasicMaterial).dispose();
		}
		damageZones.length = 0;

		// Remove all floating texts
		for (const ft of floatingTexts) {
			systemRefs.floatingTextGroup?.remove(ft.group);
		}
		floatingTexts.length = 0;

		// Remove all icicles
		for (const ic of icicles) {
			systemRefs.icicleGroup?.remove(ic.mesh);
			ic.mesh.geometry.dispose();
			(ic.mesh.material as MeshStandardMaterial).dispose();
		}
		icicles.length = 0;

		// Remove all ice patches
		for (const patch of icePatches) {
			systemRefs.icePatchGroup?.remove(patch.mesh);
			patch.mesh.geometry.dispose();
			(patch.mesh.material as MeshBasicMaterial).dispose();
		}
		icePatches.length = 0;
	}

	saveHighScore(): void {
		if (gameState.score > gameState.highScore) {
			gameState.highScore = gameState.score;
			try {
				localStorage.setItem('neon-snowball-highscore', String(gameState.highScore));
			} catch {}
		}
	}
}
