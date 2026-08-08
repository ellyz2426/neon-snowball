/**
 * EnemySystem — snowman enemy AI, spawning, behavior.
 */
import {
	createSystem,
	Group,
	Mesh,
	MeshStandardMaterial,
	MeshBasicMaterial,
	SphereGeometry,
	CylinderGeometry,
	ConeGeometry,
	BoxGeometry,
	Vector3,
	Color,
	PointLight,
	PlaneGeometry,
} from '@iwsdk/core';
import {
	gameState,
	GameState,
	enemies,
	systemRefs,
	EnemyData,
	EnemyType,
	ENEMY_CONFIGS,
	DIFFICULTY_CONFIGS,
	SPAWN_DISTANCE,
	NEON_CYAN,
	NEON_PURPLE,
	NEON_PINK,
	NEON_BLUE,
	ARENA_RADIUS,
	HealthBarData,
	icePatches,
} from './game-state.js';
import { SnowballSystem } from './snowball-system.js';

const _playerPos = new Vector3();
const _dir = new Vector3();
const _throwOrigin = new Vector3();

export class EnemySystem extends createSystem({}) {
	init(): void {}

	update(delta: number): void {
		if (gameState.state !== GameState.PLAYING) return;

		this.world.camera.getWorldPosition(_playerPos);

		const diffConfig = DIFFICULTY_CONFIGS[gameState.difficulty];
		const isFrozen = gameState.freezeActive;

		// Update slow timers
		for (const [id, remaining] of gameState.slowedEnemies.entries()) {
			const newRemaining = remaining - delta;
			if (newRemaining <= 0) {
				gameState.slowedEnemies.delete(id);
			} else {
				gameState.slowedEnemies.set(id, newRemaining);
			}
		}

		for (let i = enemies.length - 1; i >= 0; i--) {
			const enemy = enemies[i];

			// Death animation
			if (enemy.isDying) {
				enemy.deathTimer -= delta;
				enemy.group.scale.multiplyScalar(0.93);
				enemy.group.rotation.y += delta * 8;
				enemy.group.position.y -= delta * 0.5;

				if (enemy.deathTimer <= 0) {
					systemRefs.enemyGroup?.remove(enemy.group);
					this.disposeGroup(enemy.group);
					enemies.splice(i, 1);
				}
				continue;
			}

			// Hit flash
			if (enemy.hitFlashTimer > 0) {
				enemy.hitFlashTimer -= delta;
				this.setEnemyEmissive(enemy.group, enemy.hitFlashTimer > 0 ? 0xff4444 : 0x000000);
			}

			const dist = enemy.group.position.distanceTo(_playerPos);

			// Boss charge timer countdown (when not charging)
			if (enemy.type === EnemyType.BOSS && !enemy.isCharging && !isFrozen) {
				enemy.chargeTimer -= delta;
				// Telegraph warning when about to charge (1.5 seconds before)
				if (enemy.chargeTimer <= 1.5 && enemy.chargeTimer > 1.5 - delta) {
					window.dispatchEvent(new CustomEvent('boss-charge-telegraph', {
						detail: { x: _playerPos.x, z: _playerPos.z },
					}));
				}
				if (enemy.chargeTimer <= 0) {
					enemy.isCharging = true;
					enemy.chargeTimer = 3.0; // charge duration
				}
			}

			// Movement (unless frozen)
			let speedMult = isFrozen ? 0.15 : diffConfig.enemySpeedMult;

			// Apply ice-ball slow debuff
			const enemyIdx = enemies.indexOf(enemy);
			if (gameState.slowedEnemies.has(enemyIdx)) {
				speedMult *= 0.35;
				// Tint the enemy blue when slowed
				this.setEnemyEmissive(enemy.group, enemy.hitFlashTimer > 0 ? 0xff4444 : 0x4488ff);
			}

			// Check if on ice patch (enemies speed up on ice)
			let onIce = false;
			for (const patch of icePatches) {
				const dx = enemy.group.position.x - patch.mesh.position.x;
				const dz = enemy.group.position.z - patch.mesh.position.z;
				if (Math.sqrt(dx * dx + dz * dz) < patch.radius) {
					onIce = true;
					break;
				}
			}
			if (onIce && !gameState.slowedEnemies.has(enemyIdx)) {
				speedMult *= 1.5; // Enemies slide faster on ice
			}

			if (enemy.type === EnemyType.BOSS && enemy.isCharging) {
				// Boss charge: rush toward player at high speed
				_dir.copy(_playerPos).sub(enemy.group.position).normalize();
				_dir.y = 0;
				const chargeSpeed = 4.0;
				enemy.group.position.x += _dir.x * chargeSpeed * delta;
				enemy.group.position.z += _dir.z * chargeSpeed * delta;
				enemy.chargeTimer -= delta;

				// Hit player if close enough
				if (dist < 2.0) {
					if (!gameState.shieldActive) {
						const dmg = 25;
						gameState.health -= dmg;
						gameState.combo = 0;
						window.dispatchEvent(new CustomEvent('player-hit', {
							detail: { damage: dmg },
						}));
						if (gameState.health <= 0) {
							gameState.health = 0;
							gameState.state = GameState.GAME_OVER;
							window.dispatchEvent(new CustomEvent('game-over'));
						}
					}
					enemy.isCharging = false;
					enemy.chargeTimer = 12;
				} else if (enemy.chargeTimer <= 0) {
					// Charge expired
					enemy.isCharging = false;
					enemy.chargeTimer = 12;
				}
			} else if (dist > 4) {
				// Move toward player
				_dir
					.copy(_playerPos)
					.sub(enemy.group.position)
					.normalize();
				_dir.y = 0;

				// Add some lateral movement for interest
				const lateralPhase =
					Math.sin(Date.now() * 0.001 + enemy.group.position.x * 2) * 0.3;
				_dir.x += lateralPhase;
				_dir.normalize();

				enemy.group.position.x += _dir.x * enemy.speed * speedMult * delta;
				enemy.group.position.z += _dir.z * enemy.speed * speedMult * delta;
			} else if (dist < 3) {
				// Too close - back away
				_dir
					.copy(enemy.group.position)
					.sub(_playerPos)
					.normalize();
				_dir.y = 0;
				enemy.group.position.x += _dir.x * enemy.speed * speedMult * delta * 0.5;
				enemy.group.position.z += _dir.z * enemy.speed * speedMult * delta * 0.5;
			}

			// Face player
			_dir.copy(_playerPos).sub(enemy.group.position);
			_dir.y = 0;
			if (_dir.lengthSq() > 0.01) {
				enemy.group.rotation.y = Math.atan2(_dir.x, _dir.z);
			}

			// Throwing (skip while charging)
			if (!(enemy.type === EnemyType.BOSS && enemy.isCharging)) {
				const throwMult = isFrozen ? 0.3 : diffConfig.enemyThrowRateMult;
				enemy.throwTimer -= delta * throwMult;

				if (enemy.throwTimer <= 0 && dist < 15) {
					enemy.throwTimer = enemy.throwCooldown;
					enemy.throwCount++;

					if (enemy.type === EnemyType.BOSS && enemy.throwCount % 3 === 0) {
						// Boss ground pound: radial snowball burst + screen shake
						this.bossGroundPound(enemy);
					} else if (enemy.type === EnemyType.YETI && enemy.throwCount % 2 === 0) {
						// Yeti boulder: create ice patch where it lands
						const headY = 2.0 * ENEMY_CONFIGS[enemy.type].scale;
						_throwOrigin.copy(enemy.group.position);
						_throwOrigin.y = headY;
						const config = ENEMY_CONFIGS[enemy.type];
						SnowballSystem.createEnemySnowball(
							_throwOrigin,
							_playerPos,
							config.damage,
							enemy.type,
						);
						// Dispatch ice patch event at predicted landing spot
						window.dispatchEvent(new CustomEvent('yeti-boulder', {
							detail: {
								x: _playerPos.x + (Math.random() - 0.5) * 3,
								z: _playerPos.z + (Math.random() - 0.5) * 3,
							},
						}));
						window.dispatchEvent(new CustomEvent('enemy-throw'));
					} else {
						// Normal throw
						const headY = enemy.type === EnemyType.BOSS ? 3.5 : 1.5;
						_throwOrigin.copy(enemy.group.position);
						_throwOrigin.y = headY * (enemy.type === EnemyType.BOSS ? 1 : ENEMY_CONFIGS[enemy.type].scale);

						const config = ENEMY_CONFIGS[enemy.type];
						SnowballSystem.createEnemySnowball(
							_throwOrigin,
							_playerPos,
							config.damage,
							enemy.type,
						);

						window.dispatchEvent(new CustomEvent('enemy-throw'));
					}
				}
			}

			// Update health bar
			if (enemy.healthBar) {
				const hpPct = Math.max(0, enemy.health / enemy.maxHealth);
				enemy.healthBar.fill.scale.x = hpPct;
				enemy.healthBar.fill.position.x = -(1 - hpPct) * 0.3;

				// Color based on health
				const fillMat = enemy.healthBar.fill.material as MeshBasicMaterial;
				if (hpPct > 0.5) {
					fillMat.color.setHex(0x44ff88);
				} else if (hpPct > 0.25) {
					fillMat.color.setHex(0xffdd44);
				} else {
					fillMat.color.setHex(0xff4444);
				}

				// Billboard: face camera
				const camPos = _playerPos;
				enemy.healthBar.group.lookAt(camPos.x, enemy.healthBar.group.position.y, camPos.z);
			}

			// Bobbing animation
			const bob = Math.sin(Date.now() * 0.003 + enemy.group.position.x) * 0.03;
			enemy.group.position.y = bob;
		}
	}

	private bossGroundPound(boss: EnemyData): void {
		// Screen shake
		window.dispatchEvent(new CustomEvent('screen-shake'));

		// Spawn radial snowballs
		const numBalls = 8;
		const origin = boss.group.position.clone();
		origin.y = 1.5;
		const config = ENEMY_CONFIGS[EnemyType.BOSS];

		for (let i = 0; i < numBalls; i++) {
			const angle = (i / numBalls) * Math.PI * 2;
			const target = new Vector3(
				origin.x + Math.cos(angle) * 10,
				0,
				origin.z + Math.sin(angle) * 10,
			);
			SnowballSystem.createEnemySnowball(origin, target, config.damage, EnemyType.BOSS);
		}

		// Particles at boss position
		window.dispatchEvent(new CustomEvent('boss-ground-pound', {
			detail: { x: boss.group.position.x, z: boss.group.position.z },
		}));
		window.dispatchEvent(new CustomEvent('enemy-throw'));
	}

	private setEnemyEmissive(group: Group, color: number): void {
		group.traverse((child) => {
			if (child instanceof Mesh) {
				const mat = child.material as MeshStandardMaterial;
				if (mat.emissive) {
					mat.emissive.setHex(color);
					mat.emissiveIntensity = color === 0x000000 ? 0 : 0.8;
				}
			}
		});
	}

	private disposeGroup(group: Group): void {
		group.traverse((child) => {
			if (child instanceof Mesh) {
				child.geometry.dispose();
				if (child.material instanceof MeshStandardMaterial || child.material instanceof MeshBasicMaterial) {
					child.material.dispose();
				}
			}
		});
	}

	static spawnEnemy(type: EnemyType): void {
		if (!systemRefs.enemyGroup) return;

		const config = ENEMY_CONFIGS[type];
		const group = new Group();

		// Random spawn position around arena edge
		const angle = Math.random() * Math.PI * 2;
		group.position.set(
			Math.cos(angle) * SPAWN_DISTANCE,
			0,
			Math.sin(angle) * SPAWN_DISTANCE,
		);

		const s = config.scale;

		// Body (bottom sphere)
		const bodyGeo = new SphereGeometry(0.45 * s, 12, 8);
		const bodyMat = new MeshStandardMaterial({
			color: config.bodyColor,
			roughness: 0.8,
		});
		const body = new Mesh(bodyGeo, bodyMat);
		body.position.y = 0.45 * s;
		group.add(body);

		// Torso (middle sphere)
		const torsoGeo = new SphereGeometry(0.35 * s, 12, 8);
		const torsoMat = new MeshStandardMaterial({
			color: config.bodyColor,
			roughness: 0.8,
		});
		const torso = new Mesh(torsoGeo, torsoMat);
		torso.position.y = 1.0 * s;
		group.add(torso);

		// Head
		const headGeo = new SphereGeometry(0.25 * s, 12, 8);
		const headMat = new MeshStandardMaterial({
			color: config.bodyColor,
			roughness: 0.8,
		});
		const head = new Mesh(headGeo, headMat);
		head.position.y = 1.45 * s;
		group.add(head);

		// Eyes (small dark spheres)
		const eyeGeo = new SphereGeometry(0.04 * s, 6, 4);
		const eyeMat = new MeshBasicMaterial({ color: 0x111111 });
		for (const side of [-1, 1]) {
			const eye = new Mesh(eyeGeo, eyeMat.clone());
			eye.position.set(side * 0.08 * s, 1.5 * s, 0.2 * s);
			group.add(eye);
		}

		// Neon eye glow
		const glowColor =
			type === EnemyType.BOSS
				? NEON_PURPLE
				: type === EnemyType.BOMBER
					? NEON_PINK
					: type === EnemyType.YETI
						? 0x88ddff
						: type === EnemyType.SPEEDY
							? NEON_BLUE
							: NEON_CYAN;
		const eyeLight = new PointLight(glowColor, 0.4, 2);
		eyeLight.position.set(0, 1.5 * s, 0.25 * s);
		group.add(eyeLight);

		// Carrot nose
		const noseGeo = new ConeGeometry(0.04 * s, 0.2 * s, 6);
		const noseMat = new MeshStandardMaterial({ color: 0xff6622 });
		const nose = new Mesh(noseGeo, noseMat);
		nose.position.set(0, 1.42 * s, 0.26 * s);
		nose.rotation.x = -Math.PI / 2;
		group.add(nose);

		// Hat
		const hatBaseGeo = new CylinderGeometry(0.3 * s, 0.3 * s, 0.04 * s, 12);
		const hatMat = new MeshStandardMaterial({
			color: config.hatColor,
			roughness: 0.5,
		});
		const hatBase = new Mesh(hatBaseGeo, hatMat);
		hatBase.position.y = 1.7 * s;
		group.add(hatBase);

		const hatTopGeo = new CylinderGeometry(0.18 * s, 0.22 * s, 0.3 * s, 12);
		const hatTop = new Mesh(hatTopGeo, hatMat.clone());
		hatTop.position.y = 1.87 * s;
		group.add(hatTop);

		// Hat neon band
		const bandGeo = new CylinderGeometry(0.23 * s, 0.23 * s, 0.03 * s, 12);
		const bandMat = new MeshBasicMaterial({
			color: glowColor,
			transparent: true,
			opacity: 0.9,
		});
		const band = new Mesh(bandGeo, bandMat);
		band.position.y = 1.75 * s;
		group.add(band);

		// Stick arms
		const armMat = new MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9 });
		for (const side of [-1, 1]) {
			const armGeo = new CylinderGeometry(0.02 * s, 0.025 * s, 0.6 * s, 6);
			const arm = new Mesh(armGeo, armMat.clone());
			arm.position.set(side * 0.4 * s, 1.0 * s, 0);
			arm.rotation.z = side * 0.8;
			group.add(arm);
		}

		// Buttons
		const btnGeo = new SphereGeometry(0.03 * s, 6, 4);
		const btnMat = new MeshBasicMaterial({ color: 0x111111 });
		for (let b = 0; b < 3; b++) {
			const btn = new Mesh(btnGeo, btnMat.clone());
			btn.position.set(0, (0.7 + b * 0.15) * s, 0.35 * s);
			group.add(btn);
		}

		// Yeti: add fur tufts and icy horns instead of buttons + different arms
		if (type === EnemyType.YETI) {
			// Fur tufts (small spiky spheres around body)
			const furMat = new MeshStandardMaterial({
				color: 0xc0d8e8,
				roughness: 1.0,
				emissive: new Color(0x223344),
				emissiveIntensity: 0.2,
			});
			for (let f = 0; f < 8; f++) {
				const furGeo = new SphereGeometry(0.06 * s, 5, 4);
				const fur = new Mesh(furGeo, furMat.clone());
				const fAngle = (f / 8) * Math.PI * 2;
				const fY = 0.5 + Math.random() * 0.8;
				fur.position.set(
					Math.cos(fAngle) * 0.4 * s,
					fY * s,
					Math.sin(fAngle) * 0.4 * s,
				);
				group.add(fur);
			}

			// Icy horns on head
			const hornMat = new MeshStandardMaterial({
				color: 0x88ccff,
				roughness: 0.1,
				metalness: 0.5,
				emissive: new Color(0x4488ff),
				emissiveIntensity: 0.4,
				transparent: true,
				opacity: 0.8,
			});
			for (const side of [-1, 1]) {
				const hornGeo = new ConeGeometry(0.04 * s, 0.25 * s, 5);
				const horn = new Mesh(hornGeo, hornMat.clone());
				horn.position.set(side * 0.15 * s, 1.7 * s, 0);
				horn.rotation.z = side * -0.4;
				group.add(horn);
			}

			// Icy glow
			const iceGlow = new PointLight(0x88ccff, 0.3, 4);
			iceGlow.position.set(0, 1.0 * s, 0);
			group.add(iceGlow);
		}

		// Boss: add crown
		if (type === EnemyType.BOSS) {
			const crownGeo = new CylinderGeometry(0.15, 0.2, 0.15, 5);
			const crownMat = new MeshBasicMaterial({
				color: 0xffdd00,
				transparent: true,
				opacity: 0.9,
			});
			const crown = new Mesh(crownGeo, crownMat);
			crown.position.y = 2.05 * s;
			group.add(crown);

			const crownLight = new PointLight(0xffdd00, 0.5, 4);
			crownLight.position.y = 2.1 * s;
			group.add(crownLight);
		}

		systemRefs.enemyGroup.add(group);

		// Create health bar for multi-HP enemies
		let healthBar: HealthBarData | null = null;
		if (config.health > 1) {
			const hbGroup = new Group();
			const hbHeight = (type === EnemyType.BOSS ? 2.3 : 1.8) * config.scale;
			hbGroup.position.y = hbHeight;

			const bgGeo = new PlaneGeometry(0.65, 0.06);
			const bgMat = new MeshBasicMaterial({
				color: 0x111111,
				transparent: true,
				opacity: 0.7,
			});
			const bg = new Mesh(bgGeo, bgMat);
			hbGroup.add(bg);

			const fillGeo = new PlaneGeometry(0.6, 0.04);
			const fillMat = new MeshBasicMaterial({
				color: 0x44ff88,
				transparent: true,
				opacity: 0.9,
			});
			const fill = new Mesh(fillGeo, fillMat);
			fill.position.z = 0.001;
			hbGroup.add(fill);

			group.add(hbGroup);
			healthBar = { background: bg, fill, group: hbGroup };
		}

		enemies.push({
			group,
			type,
			health: config.health,
			maxHealth: config.health,
			throwCooldown: config.throwCooldown,
			throwTimer: config.throwCooldown * (0.5 + Math.random() * 0.5),
			speed: config.speed,
			targetPos: new Vector3(),
			isDying: false,
			deathTimer: 0,
			hitFlashTimer: 0,
			throwCount: 0,
			isCharging: false,
			chargeTimer: type === EnemyType.BOSS ? 10 : 999,
			healthBar,
		});
	}
}
