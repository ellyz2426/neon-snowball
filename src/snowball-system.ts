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
const MAX_CHARGE_TIME = 1.5;
const CHARGE_SPEED_BONUS = 8;
const CHARGE_DAMAGE_BONUS = 2;

const _dir = new Vector3();
const _pos = new Vector3();
const _tmp = new Vector3();

export class SnowballSystem extends createSystem({}) {
	private throwCooldown = 0;
	private isMouseDown = false;
	private chargeTime = 0;
	private chargeMesh: Mesh | null = null;

	init(): void {
		// Mouse / touch for browser mode
		const canvas = this.world.renderer.domElement;
		canvas.addEventListener('mousedown', () => {
			if (gameState.state === GameState.PLAYING && this.throwCooldown <= 0) {
				this.startCharge();
			}
		});
		canvas.addEventListener('mouseup', () => {
			if (this.isMouseDown) {
				this.releaseCharge();
			}
		});
		canvas.addEventListener('touchstart', () => {
			if (gameState.state === GameState.PLAYING && this.throwCooldown <= 0) {
				this.startCharge();
			}
		});
		canvas.addEventListener('touchend', () => {
			if (this.isMouseDown) {
				this.releaseCharge();
			}
		});
	}

	private startCharge(): void {
		this.isMouseDown = true;
		this.chargeTime = 0;
		gameState.isCharging = true;
		gameState.chargeLevel = 0;
	}

	private releaseCharge(): void {
		this.isMouseDown = false;
		const chargeRatio = Math.min(this.chargeTime / MAX_CHARGE_TIME, 1.0);
		this.throwSnowball(chargeRatio);
		this.throwCooldown = gameState.rapidFireActive ? RAPID_FIRE_COOLDOWN : THROW_COOLDOWN;
		gameState.isCharging = false;
		gameState.chargeLevel = 0;
		// Remove charge indicator
		if (this.chargeMesh) {
			this.world.scene.remove(this.chargeMesh);
			this.chargeMesh.geometry.dispose();
			(this.chargeMesh.material as MeshStandardMaterial).dispose();
			this.chargeMesh = null;
		}
	}

	update(delta: number): void {
		if (gameState.state !== GameState.PLAYING) return;

		this.throwCooldown -= delta;

		// Charging logic
		if (this.isMouseDown) {
			this.chargeTime += delta;
			const chargeRatio = Math.min(this.chargeTime / MAX_CHARGE_TIME, 1.0);
			gameState.chargeLevel = chargeRatio;
			this.updateChargeIndicator(chargeRatio);
		}

		// XR: check trigger via input actions
		const actions = this.world.input?.actions;
		if (actions) {
			const triggerDown = actions.getButtonDown('interaction.select');
			const triggerUp = actions.getButtonUp('interaction.select');
			if (triggerDown && this.throwCooldown <= 0) {
				this.startCharge();
			}
			if (triggerUp && this.isMouseDown) {
				this.releaseCharge();
			}
		}

		// Update all snowballs
		this.updateSnowballs(delta);
	}

	private updateChargeIndicator(chargeRatio: number): void {
		const camera = this.world.camera;
		camera.getWorldDirection(_dir);
		camera.getWorldPosition(_pos);

		// Show/update charge indicator sphere
		const indicatorPos = _pos.clone().add(_dir.clone().multiplyScalar(0.8));
		const size = 0.05 + chargeRatio * 0.15;
		const glowIntensity = 0.3 + chargeRatio * 0.7;

		if (!this.chargeMesh) {
			const geo = new SphereGeometry(1, 10, 8);
			const mat = new MeshStandardMaterial({
				color: 0xffffff,
				emissive: new Color(NEON_CYAN),
				emissiveIntensity: glowIntensity,
				transparent: true,
				opacity: 0.6 + chargeRatio * 0.3,
			});
			this.chargeMesh = new Mesh(geo, mat);
			this.world.scene.add(this.chargeMesh);
		}

		this.chargeMesh.position.copy(indicatorPos);
		this.chargeMesh.scale.setScalar(size);
		const mat = this.chargeMesh.material as MeshStandardMaterial;
		mat.emissiveIntensity = glowIntensity;
		mat.opacity = 0.6 + chargeRatio * 0.3;

		// Color shifts: cyan → blue (ice) → orange (fire) as charge increases
		if (chargeRatio > 0.8) {
			mat.emissive.setHex(0xff4400); // Fire
		} else if (chargeRatio > 0.5) {
			mat.emissive.setHex(0x4488ff); // Ice
		} else {
			mat.emissive.setHex(NEON_CYAN); // Normal
		}
	}

	private throwSnowball(chargeRatio: number = 0): void {
		if (!systemRefs.snowballGroup) return;

		// Full fire charge: spread shot (3 snowballs in a fan)
		if (chargeRatio > 0.8) {
			this.throwSpreadShot(chargeRatio);
			return;
		}

		// Get camera direction
		const camera = this.world.camera;
		camera.getWorldDirection(_dir);
		camera.getWorldPosition(_pos);

		const isGiant = gameState.giantSnowballActive;
		const isCharged = chargeRatio > 0.3;

		// Determine element based on charge level
		let element: 'normal' | 'ice' | 'fire' = 'normal';
		if (chargeRatio > 0.8) {
			element = 'fire';
		} else if (chargeRatio > 0.5) {
			element = 'ice';
		}

		const geo = isGiant ? giantSnowballGeo : (isCharged ? new SphereGeometry(0.12 + chargeRatio * 0.1, 12, 8) : snowballGeo);

		// Color based on element
		let emissiveColor: number;
		let baseColor: number = 0xffffff;
		if (element === 'fire') {
			emissiveColor = 0xff4400;
			baseColor = 0xffccaa;
		} else if (element === 'ice') {
			emissiveColor = 0x4488ff;
			baseColor = 0xccddff;
		} else {
			emissiveColor = isGiant ? NEON_PINK : NEON_CYAN;
		}

		const mat = new MeshStandardMaterial({
			color: baseColor,
			roughness: 0.4,
			metalness: 0.1,
			emissive: new Color(emissiveColor),
			emissiveIntensity: 0.4 + chargeRatio * 0.4,
		});

		const mesh = new Mesh(geo, mat);
		mesh.position.copy(_pos).add(_dir.clone().multiplyScalar(0.5));

		// Add slight upward arc + charge speed bonus
		const speed = THROW_SPEED + chargeRatio * CHARGE_SPEED_BONUS;
		const velocity = _dir.clone().multiplyScalar(speed);
		velocity.y += 2;

		systemRefs.snowballGroup.add(mesh);

		const damage = (isGiant ? 3 : 1) + Math.floor(chargeRatio * CHARGE_DAMAGE_BONUS);

		snowballs.push({
			mesh,
			velocity,
			damage,
			lifetime: SNOWBALL_LIFETIME,
			isPlayerOwned: true,
			isGiant,
			element,
		});

		gameState.totalThrows++;

		// Fire event for audio
		window.dispatchEvent(new CustomEvent('snowball-throw', { detail: { isGiant, charged: isCharged, element } }));
	}

	/** Fire-charged spread shot: 3 snowballs in a fan pattern */
	private throwSpreadShot(chargeRatio: number): void {
		if (!systemRefs.snowballGroup) return;

		const camera = this.world.camera;
		camera.getWorldDirection(_dir);
		camera.getWorldPosition(_pos);

		const isGiant = gameState.giantSnowballActive;
		const speed = THROW_SPEED + chargeRatio * CHARGE_SPEED_BONUS;
		const baseDamage = (isGiant ? 3 : 1) + Math.floor(chargeRatio * CHARGE_DAMAGE_BONUS);

		// Fan angles: center, left, right (spread ~15 degrees)
		const spreadAngles = [0, -0.26, 0.26];

		for (const angleOffset of spreadAngles) {
			const geo = isGiant ? giantSnowballGeo : new SphereGeometry(0.14, 12, 8);
			const mat = new MeshStandardMaterial({
				color: 0xffccaa,
				roughness: 0.4,
				metalness: 0.1,
				emissive: new Color(0xff4400),
				emissiveIntensity: 0.7,
			});

			const mesh = new Mesh(geo, mat);
			mesh.position.copy(_pos).add(_dir.clone().multiplyScalar(0.5));

			// Rotate direction by angleOffset around Y axis
			const spreadDir = _dir.clone();
			const cos = Math.cos(angleOffset);
			const sin = Math.sin(angleOffset);
			const rx = spreadDir.x * cos - spreadDir.z * sin;
			const rz = spreadDir.x * sin + spreadDir.z * cos;
			spreadDir.x = rx;
			spreadDir.z = rz;

			const velocity = spreadDir.multiplyScalar(speed);
			velocity.y += 2;

			systemRefs.snowballGroup.add(mesh);

			// Slightly reduced damage per ball (balancing 3x projectiles)
			const damage = Math.max(1, Math.floor(baseDamage * 0.7));

			snowballs.push({
				mesh,
				velocity,
				damage,
				lifetime: SNOWBALL_LIFETIME,
				isPlayerOwned: true,
				isGiant,
				element: 'fire',
			});
		}

		gameState.totalThrows += 3;
		window.dispatchEvent(new CustomEvent('snowball-throw', {
			detail: { isGiant, charged: true, element: 'fire', spread: true },
		}));
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
			element: 'normal',
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
				// Bomber AoE zone with telegraph
				if (!sb.isPlayerOwned && sb.isGiant) {
					window.dispatchEvent(new CustomEvent('bomber-telegraph', {
						detail: { x: sb.mesh.position.x, z: sb.mesh.position.z },
					}));
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

						// Elemental effects
						if (sb.element === 'ice') {
							// Ice ball: slow enemy for 3 seconds
							const id = enemies.indexOf(enemy);
							gameState.slowedEnemies.set(id, 3.0);
							window.dispatchEvent(new CustomEvent('ice-hit', {
								detail: { x: enemy.group.position.x, y: enemy.group.position.y + 0.5, z: enemy.group.position.z },
							}));
						} else if (sb.element === 'fire') {
							// Fire ball: AoE damage to nearby enemies
							for (let k = enemies.length - 1; k >= 0; k--) {
								if (k === j || enemies[k].isDying) continue;
								const aoeDist = sb.mesh.position.distanceTo(enemies[k].group.position);
								if (aoeDist < 3.0) {
									enemies[k].health -= 2;
									enemies[k].hitFlashTimer = 0.2;
								}
							}
							window.dispatchEvent(new CustomEvent('fire-aoe', {
								detail: { x: sb.mesh.position.x, y: sb.mesh.position.y, z: sb.mesh.position.z },
							}));
						}

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
								detail: {
									killed: true,
									points,
									combo: gameState.combo,
									x: enemy.group.position.x,
									y: enemy.group.position.y + 1.5,
									z: enemy.group.position.z,
								},
							}));
						} else {
							window.dispatchEvent(new CustomEvent('enemy-hit', {
								detail: {
									killed: false,
									x: enemy.group.position.x,
									y: enemy.group.position.y + 1.0,
									z: enemy.group.position.z,
								},
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
