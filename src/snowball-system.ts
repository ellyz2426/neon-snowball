/**
 * SnowballSystem — handles snowball creation, physics, and collision.
 * Player throws by clicking/triggering, direction from camera/controller.
 */
import {
	createSystem,
	Mesh,
	MeshStandardMaterial,
	SphereGeometry,
	Vector3,
	Color,
} from '@iwsdk/core';
import {
	gameState,
	GameState,
	snowballs,
	enemies,
	systemRefs,
	snowballGeo,
	giantSnowballGeo,
	NEON_CYAN,
	NEON_PINK,
	SnowballData,
	EnemyType,
	DIFFICULTY_CONFIGS,
	ENEMY_CONFIGS,
	ARENA_RADIUS,
} from './game-state.js';

const THROW_SPEED = 18;
const GRAVITY = -9.8;
const SNOWBALL_LIFETIME = 4;
const THROW_COOLDOWN = 0.35;
const RAPID_FIRE_COOLDOWN = 0.1;
const ENEMY_HIT_RADIUS = 0.6;
const PLAYER_HIT_RADIUS = 0.8;

const _dir = new Vector3();
const _pos = new Vector3();
const _tmp = new Vector3();

export class SnowballSystem extends createSystem({}) {
	private throwCooldown = 0;
	private wasMouseDown = false;

	init(): void {
		// Mouse / touch for browser mode
		const canvas = this.world.renderer.domElement;
		canvas.addEventListener('mousedown', () => {
			if (gameState.state === GameState.PLAYING && this.throwCooldown <= 0) {
				this.throwSnowball();
				this.throwCooldown = gameState.rapidFireActive ? RAPID_FIRE_COOLDOWN : THROW_COOLDOWN;
			}
		});
		canvas.addEventListener('touchstart', () => {
			if (gameState.state === GameState.PLAYING && this.throwCooldown <= 0) {
				this.throwSnowball();
				this.throwCooldown = gameState.rapidFireActive ? RAPID_FIRE_COOLDOWN : THROW_COOLDOWN;
			}
		});
	}

	update(delta: number): void {
		if (gameState.state !== GameState.PLAYING) return;

		this.throwCooldown -= delta;

		// XR: check trigger via input actions
		const actions = this.world.input?.actions;
		if (actions) {
			const triggerDown = actions.getButtonDown('interaction.select');
			if (triggerDown && this.throwCooldown <= 0) {
				this.throwSnowball();
				this.throwCooldown = gameState.rapidFireActive ? RAPID_FIRE_COOLDOWN : THROW_COOLDOWN;
			}
		}

		// Update all snowballs
		this.updateSnowballs(delta);
	}

	private throwSnowball(): void {
		if (!systemRefs.snowballGroup) return;

		// Get camera direction
		const camera = this.world.camera;
		camera.getWorldDirection(_dir);
		camera.getWorldPosition(_pos);

		const isGiant = gameState.giantSnowballActive;
		const geo = isGiant ? giantSnowballGeo : snowballGeo;

		const mat = new MeshStandardMaterial({
			color: 0xffffff,
			roughness: 0.4,
			metalness: 0.1,
			emissive: new Color(isGiant ? NEON_PINK : NEON_CYAN),
			emissiveIntensity: 0.4,
		});

		const mesh = new Mesh(geo, mat);
		mesh.position.copy(_pos).add(_dir.clone().multiplyScalar(0.5));

		// Add slight upward arc
		const velocity = _dir.clone().multiplyScalar(THROW_SPEED);
		velocity.y += 2;

		systemRefs.snowballGroup.add(mesh);

		snowballs.push({
			mesh,
			velocity,
			damage: isGiant ? 3 : 1,
			lifetime: SNOWBALL_LIFETIME,
			isPlayerOwned: true,
			isGiant,
		});

		gameState.totalThrows++;

		// Fire event for audio
		window.dispatchEvent(new CustomEvent('snowball-throw', { detail: { isGiant } }));
	}

	/** Called by EnemySystem to create enemy snowballs */
	static createEnemySnowball(
		origin: Vector3,
		targetPos: Vector3,
		damage: number,
		type: EnemyType,
	): void {
		if (!systemRefs.snowballGroup) return;

		const dir = _tmp.copy(targetPos).sub(origin).normalize();
		const speed = type === EnemyType.SPEEDY ? 14 : type === EnemyType.BOMBER ? 10 : 12;

		const isBomber = type === EnemyType.BOMBER;
		const geo = isBomber ? giantSnowballGeo : snowballGeo;
		const mat = new MeshStandardMaterial({
			color: isBomber ? 0xff4444 : 0xccccdd,
			roughness: 0.5,
			emissive: new Color(isBomber ? 0xff2200 : 0x334455),
			emissiveIntensity: isBomber ? 0.6 : 0.2,
		});

		const mesh = new Mesh(geo, mat);
		mesh.position.copy(origin);

		const velocity = dir.clone().multiplyScalar(speed);
		// Add arc to reach target
		const dist = origin.distanceTo(targetPos);
		velocity.y += dist * 0.3;

		systemRefs.snowballGroup.add(mesh);

		snowballs.push({
			mesh,
			velocity,
			damage,
			lifetime: SNOWBALL_LIFETIME,
			isPlayerOwned: false,
			isGiant: isBomber,
		});
	}

	private updateSnowballs(delta: number): void {
		const playerPos = new Vector3();
		this.world.camera.getWorldPosition(playerPos);

		for (let i = snowballs.length - 1; i >= 0; i--) {
			const sb = snowballs[i];
			sb.lifetime -= delta;

			// Apply gravity
			sb.velocity.y += GRAVITY * delta;

			// Move
			sb.mesh.position.x += sb.velocity.x * delta;
			sb.mesh.position.y += sb.velocity.y * delta;
			sb.mesh.position.z += sb.velocity.z * delta;

			// Spin
			sb.mesh.rotation.x += delta * 5;
			sb.mesh.rotation.z += delta * 3;

			let shouldRemove = false;

			// Ground collision
			if (sb.mesh.position.y < 0) {
				shouldRemove = true;
				window.dispatchEvent(new CustomEvent('snowball-impact', {
					detail: { x: sb.mesh.position.x, y: 0, z: sb.mesh.position.z, isGiant: sb.isGiant },
				}));
				// Bomber AoE zone
				if (!sb.isPlayerOwned && sb.isGiant) {
					window.dispatchEvent(new CustomEvent('bomber-aoe', {
						detail: { x: sb.mesh.position.x, z: sb.mesh.position.z },
					}));
				}
			}

			// Out of bounds
			if (
				Math.abs(sb.mesh.position.x) > ARENA_RADIUS + 5 ||
				Math.abs(sb.mesh.position.z) > ARENA_RADIUS + 5
			) {
				shouldRemove = true;
			}

			// Lifetime
			if (sb.lifetime <= 0) {
				shouldRemove = true;
			}

			// Player snowball hitting enemies
			if (sb.isPlayerOwned) {
				for (let j = enemies.length - 1; j >= 0; j--) {
					const enemy = enemies[j];
					if (enemy.isDying) continue;

					const dist = sb.mesh.position.distanceTo(enemy.group.position);
					const hitRadius = ENEMY_HIT_RADIUS * (enemy.type === EnemyType.BOSS ? 1.5 : 1.0);

					if (dist < hitRadius) {
						enemy.health -= sb.damage;
						enemy.hitFlashTimer = 0.15;
						gameState.totalHits++;

						if (sb.isGiant) {
							// Giant snowball area damage
							for (let k = enemies.length - 1; k >= 0; k--) {
								if (k === j || enemies[k].isDying) continue;
								const aoeDist = sb.mesh.position.distanceTo(enemies[k].group.position);
								if (aoeDist < 2.5) {
									enemies[k].health -= 1;
									enemies[k].hitFlashTimer = 0.15;
								}
							}
						}

						if (enemy.health <= 0) {
							enemy.isDying = true;
							enemy.deathTimer = 0.5;
							gameState.enemiesKilled++;
							gameState.totalEnemiesKilled++;
							gameState.enemiesRemaining--;

							// Scoring
							const config = ENEMY_CONFIGS[enemy.type];
							const diffConfig = DIFFICULTY_CONFIGS[gameState.difficulty];
							const comboMult = 1 + gameState.combo * 0.1;
							const points = Math.floor(
								config.points * comboMult * diffConfig.scoreMultiplier,
							);
							gameState.score += points;
							gameState.combo++;
							gameState.comboTimer = 3;
							if (gameState.combo > gameState.maxCombo) {
								gameState.maxCombo = gameState.combo;
							}

							window.dispatchEvent(new CustomEvent('enemy-hit', {
								detail: { killed: true, points, combo: gameState.combo },
							}));
						} else {
							window.dispatchEvent(new CustomEvent('enemy-hit', {
								detail: { killed: false },
							}));
						}

						shouldRemove = true;
						break;
					}
				}
			}

			// Enemy snowball hitting player
			if (!sb.isPlayerOwned) {
				const dist = sb.mesh.position.distanceTo(playerPos);
				if (dist < PLAYER_HIT_RADIUS) {
					if (!gameState.shieldActive) {
						const diffConfig = DIFFICULTY_CONFIGS[gameState.difficulty];
						const damage = sb.damage * diffConfig.enemyDamageMult;
						gameState.health -= damage;
						gameState.combo = 0;

						window.dispatchEvent(new CustomEvent('player-hit', {
							detail: { damage },
						}));

						if (gameState.health <= 0) {
							gameState.health = 0;
							gameState.state = GameState.GAME_OVER;
							window.dispatchEvent(new CustomEvent('game-over'));
						}
					} else {
						window.dispatchEvent(new CustomEvent('shield-block'));
					}
					shouldRemove = true;
				}
			}

			if (shouldRemove) {
				systemRefs.snowballGroup?.remove(sb.mesh);
				sb.mesh.geometry.dispose();
				(sb.mesh.material as MeshStandardMaterial).dispose();
				snowballs.splice(i, 1);
			}
		}
	}
}
