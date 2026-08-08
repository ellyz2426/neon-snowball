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
	CylinderGeometry,
	ConeGeometry,
	Group,
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
	snowmanAllies,
	burningGrounds,
	systemRefs,
	EnemyType,
	PowerUpType,
	PowerUpData,
	ActivePowerUp,
	SnowmanAllyData,
	BurningGroundData,
	WeatherType,
	getWaveEnemyCount,
	isBossWave,
	resetGameState,
	forts,
	NEON_CYAN,
	NEON_PINK,
	NEON_GREEN,
	NEON_PURPLE,
	ARENA_RADIUS,
	ENEMY_CONFIGS,
} from './game-state.js';
import { EnemySystem } from './enemy-system.js';
import { SnowballSystem } from './snowball-system.js';

const WAVE_DELAY = 3;
const POWER_UP_SPAWN_INTERVAL = 15;
const COMBO_TIMEOUT = 3;

export class GameSystem extends createSystem({}) {
	private waveDelay = 0;
	private powerUpTimer = 0;
	private spawnQueue: EnemyType[] = [];
	private spawnTimer = 0;
	private spawnInterval = 0.8;
	private allyThrowDir = new Vector3();

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

		// Update snowman allies
		this.updateSnowmanAllies(delta);

		// Update burning ground zones
		this.updateBurningGrounds(delta);

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

		// Spawn snowman allies at living forts (max 3 per wave, wave 2+)
		if (gameState.wave >= 2) {
			this.spawnSnowmanAllies();
		}

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

	/** Spawn snowman allies at living forts */
	private spawnSnowmanAllies(): void {
		if (!systemRefs.allyGroup) return;

		// Clear old allies
		this.clearAllies();

		const livingForts = forts.filter(f => !f.isDestroyed);
		const maxAllies = Math.min(3, livingForts.length);
		const alliesThisWave = Math.min(maxAllies, 1 + Math.floor(gameState.wave / 3));

		for (let i = 0; i < alliesThisWave; i++) {
			const fort = livingForts[i];
			const fortIdx = forts.indexOf(fort);
			const group = new Group();

			// Position near the fort
			group.position.set(
				fort.position.x + 1.2,
				0,
				fort.position.z,
			);

			const s = 0.7;

			// Body
			const bodyGeo = new SphereGeometry(0.35 * s, 10, 7);
			const bodyMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
			const body = new Mesh(bodyGeo, bodyMat);
			body.position.y = 0.35 * s;
			group.add(body);

			// Torso
			const torsoGeo = new SphereGeometry(0.25 * s, 10, 7);
			const torso = new Mesh(torsoGeo, bodyMat.clone());
			torso.position.y = 0.8 * s;
			group.add(torso);

			// Head
			const headGeo = new SphereGeometry(0.18 * s, 10, 7);
			const head = new Mesh(headGeo, bodyMat.clone());
			head.position.y = 1.1 * s;
			group.add(head);

			// Green scarf (cylinder)
			const scarfGeo = new CylinderGeometry(0.2 * s, 0.2 * s, 0.06 * s, 8);
			const scarfMat = new MeshStandardMaterial({
				color: 0x44ff88,
				emissive: new Color(0x22aa44),
				emissiveIntensity: 0.4,
			});
			const scarf = new Mesh(scarfGeo, scarfMat);
			scarf.position.y = 0.65 * s;
			group.add(scarf);

			// Neon green glow
			const glow = new PointLight(NEON_GREEN, 0.4, 3);
			glow.position.y = 0.8 * s;
			group.add(glow);

			// Carrot nose
			const noseGeo = new ConeGeometry(0.03 * s, 0.12 * s, 5);
			const noseMat = new MeshStandardMaterial({ color: 0xff6622 });
			const nose = new Mesh(noseGeo, noseMat);
			nose.position.set(0, 1.08 * s, 0.18 * s);
			nose.rotation.x = -Math.PI / 2;
			group.add(nose);

			// Eyes
			const eyeGeo = new SphereGeometry(0.025 * s, 5, 4);
			const eyeMat = new MeshBasicMaterial({ color: 0x111111 });
			for (const side of [-1, 1]) {
				const eye = new Mesh(eyeGeo, eyeMat.clone());
				eye.position.set(side * 0.06 * s, 1.13 * s, 0.15 * s);
				group.add(eye);
			}

			systemRefs.allyGroup.add(group);

			snowmanAllies.push({
				group,
				fortIndex: fortIdx,
				throwsRemaining: 5 + Math.floor(gameState.wave / 2), // More throws in later waves
				throwCooldown: 2.5,
				throwTimer: 1.0 + Math.random() * 1.5, // Staggered start
			});
		}

		if (alliesThisWave > 0) {
			window.dispatchEvent(new CustomEvent('ally-spawned'));
		}
	}

	/** Update snowman allies: face enemies, auto-throw */
	private updateSnowmanAllies(delta: number): void {
		if (snowmanAllies.length === 0 || enemies.length === 0) return;

		for (let i = snowmanAllies.length - 1; i >= 0; i--) {
			const ally = snowmanAllies[i];

			// Check if the fort this ally belongs to was destroyed
			if (forts[ally.fortIndex]?.isDestroyed) {
				systemRefs.allyGroup?.remove(ally.group);
				ally.group.traverse((child: any) => {
					if (child instanceof Mesh) {
						child.geometry.dispose();
						if (child.material && typeof child.material.dispose === 'function') {
							child.material.dispose();
						}
					}
				});
				snowmanAllies.splice(i, 1);
				continue;
			}

			if (ally.throwsRemaining <= 0) continue;

			// Find nearest enemy
			let nearestDist = Infinity;
			let nearestEnemy = enemies[0];
			for (const enemy of enemies) {
				if (enemy.isDying) continue;
				const dist = ally.group.position.distanceTo(enemy.group.position);
				if (dist < nearestDist) {
					nearestDist = dist;
					nearestEnemy = enemy;
				}
			}

			// Face the nearest enemy
			if (nearestEnemy && !nearestEnemy.isDying) {
				this.allyThrowDir.copy(nearestEnemy.group.position).sub(ally.group.position);
				this.allyThrowDir.y = 0;
				if (this.allyThrowDir.lengthSq() > 0.01) {
					ally.group.rotation.y = Math.atan2(this.allyThrowDir.x, this.allyThrowDir.z);
				}
			}

			// Auto-throw
			ally.throwTimer -= delta;
			if (ally.throwTimer <= 0 && nearestEnemy && !nearestEnemy.isDying && nearestDist < 16) {
				ally.throwTimer = ally.throwCooldown;
				ally.throwsRemaining--;

				// Create snowball from ally position
				const origin = ally.group.position.clone();
				origin.y = 0.8;
				SnowballSystem.createAllySnowball(origin, nearestEnemy.group.position);

				window.dispatchEvent(new CustomEvent('ally-throw'));

				// Remove ally if out of ammo
				if (ally.throwsRemaining <= 0) {
					// Fade out ally (set emissive dark to indicate spent)
					ally.group.traverse((child: any) => {
						if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
							child.material.emissiveIntensity = 0;
							child.material.opacity = 0.5;
							child.material.transparent = true;
						}
					});
				}
			}
		}
	}

	/** Update burning ground zones from bomber deaths */
	private updateBurningGrounds(delta: number): void {
		if (burningGrounds.length === 0) return;

		const playerPos = new Vector3();
		this.world.camera.getWorldPosition(playerPos);

		for (let i = burningGrounds.length - 1; i >= 0; i--) {
			const bg = burningGrounds[i];
			bg.lifetime -= delta;
			bg.tickTimer -= delta;

			// Pulse opacity
			const lifeAlpha = Math.min(1, bg.lifetime / 2);
			const pulse = 0.6 + Math.sin(Date.now() * 0.008) * 0.2;
			(bg.mesh.material as MeshBasicMaterial).opacity = 0.3 * lifeAlpha * pulse;

			// Damage player if standing in fire
			if (bg.tickTimer <= 0 && gameState.state === GameState.PLAYING) {
				bg.tickTimer = 1.0; // Tick every second
				const dx = playerPos.x - bg.mesh.position.x;
				const dz = playerPos.z - bg.mesh.position.z;
				if (Math.sqrt(dx * dx + dz * dz) < 1.8 && !gameState.shieldActive) {
					const dmg = 8;
					gameState.health -= dmg;
					gameState.combo = 0;
					window.dispatchEvent(new CustomEvent('player-hit', { detail: { damage: dmg } }));
					if (gameState.health <= 0) {
						gameState.health = 0;
						gameState.state = GameState.GAME_OVER;
						window.dispatchEvent(new CustomEvent('game-over'));
					}
				}
			}

			// Also speed up enemies on fire
			for (const enemy of enemies) {
				if (enemy.isDying) continue;
				const ex = enemy.group.position.x - bg.mesh.position.x;
				const ez = enemy.group.position.z - bg.mesh.position.z;
				if (Math.sqrt(ex * ex + ez * ez) < 1.8) {
					// Fire damages enemies too
					if (bg.tickTimer <= 0.05) {
						enemy.health -= 1;
						enemy.hitFlashTimer = 0.15;
						if (enemy.health <= 0 && !enemy.isDying) {
							enemy.isDying = true;
							enemy.deathTimer = 0.5;
							gameState.enemiesKilled++;
							gameState.totalEnemiesKilled++;
							gameState.enemiesRemaining--;
							const config = ENEMY_CONFIGS[enemy.type];
							const pts = Math.floor(config.points * 0.3);
							gameState.score += pts;
							// Track kill by type
							gameState.killsByType[enemy.type] = (gameState.killsByType[enemy.type] || 0) + 1;
						}
					}
				}
			}

			if (bg.lifetime <= 0) {
				systemRefs.burningGroup?.remove(bg.mesh);
				bg.mesh.geometry.dispose();
				(bg.mesh.material as MeshBasicMaterial).dispose();
				burningGrounds.splice(i, 1);
			}
		}
	}

	private clearAllies(): void {
		for (const ally of snowmanAllies) {
			systemRefs.allyGroup?.remove(ally.group);
			ally.group.traverse((child: any) => {
				if (child instanceof Mesh) {
					child.geometry.dispose();
					if (child.material && typeof child.material.dispose === 'function') {
						child.material.dispose();
					}
				}
			});
		}
		snowmanAllies.length = 0;
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

		// Remove all snowman allies
		this.clearAllies();

		// Remove all burning grounds
		for (const bg of burningGrounds) {
			systemRefs.burningGroup?.remove(bg.mesh);
			bg.mesh.geometry.dispose();
			(bg.mesh.material as MeshBasicMaterial).dispose();
		}
		burningGrounds.length = 0;
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
