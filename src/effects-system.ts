/**
 * EffectsSystem — particle effects, trails, damage zones, screen shake.
 */
import {
	createSystem,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	SphereGeometry,
	CircleGeometry,
	ConeGeometry,
	BoxGeometry,
	Group,
	Vector3,
	Color,
	DoubleSide,
} from '@iwsdk/core';
import {
	gameState,
	GameState,
	particles,
	snowballs,
	damageZones,
	floatingTexts,
	icicles,
	icePatches,
	enemies,
	systemRefs,
	particleGeo,
	ParticleData,
	DamageZoneData,
	FloatingTextData,
	IcicleData,
	IcePatchData,
	NEON_CYAN,
	NEON_PINK,
	NEON_GREEN,
	NEON_PURPLE,
	SNOW_WHITE,
	ARENA_RADIUS,
	ENEMY_CONFIGS,
	DIFFICULTY_CONFIGS,
	EnemyType,
} from './game-state.js';

const MAX_PARTICLES = 400;

export class EffectsSystem extends createSystem({}) {
	private shieldIndicator: Mesh | null = null;
	private trailTimer = 0;
	private shakeIntensity = 0;
	private shakeOriginalPos = new Vector3();
	private icicleTimer = 0;
	private icicleInterval = 8; // seconds between icicle drops

	init(): void {
		// Snowball impact
		window.addEventListener('snowball-impact', (e: Event) => {
			const d = (e as CustomEvent).detail;
			this.spawnImpact(d.x, d.y, d.z, d.isGiant);
		});

		// Enemy killed - show score
		window.addEventListener('enemy-hit', (e: Event) => {
			const d = (e as CustomEvent).detail;
			if (d.killed) {
				this.spawnBurst(0, 1, 0, 20, NEON_CYAN, 0.5);
				if (d.points) {
					this.spawnFloatingText(
						d.x ?? 0,
						d.y ?? 1.5,
						d.z ?? 0,
						`+${d.points}`,
						d.combo > 3 ? NEON_PINK : NEON_CYAN,
					);
					if (d.combo >= 3) {
						this.spawnFloatingText(
							d.x ?? 0,
							(d.y ?? 1.5) + 0.4,
							d.z ?? 0,
							`${d.combo}x COMBO`,
							NEON_PINK,
						);
					}
				}
			}
		});

		// Player hit
		window.addEventListener('player-hit', () => {
			this.flashScreen(0xff4444);
		});

		// Shield block
		window.addEventListener('shield-block', () => {
			this.flashScreen(NEON_GREEN);
		});

		// Power-up collected
		window.addEventListener('powerup-collected', (e: Event) => {
			const d = (e as CustomEvent).detail;
			const colors: Record<string, number> = {
				GIANT: NEON_PINK,
				RAPID: NEON_CYAN,
				SHIELD: NEON_GREEN,
				FREEZE: NEON_PURPLE,
			};
			this.spawnBurst(0, 1.5, 0, 15, colors[d.type] || NEON_CYAN, 0.6);
		});

		// Bomber AoE zone
		window.addEventListener('bomber-aoe', (e: Event) => {
			const d = (e as CustomEvent).detail;
			this.createDamageZone(d.x, d.z);
		});

		// Screen shake (boss ground pound)
		window.addEventListener('screen-shake', () => {
			this.shakeIntensity = 0.35;
			if (systemRefs.arenaGroup) {
				this.shakeOriginalPos.copy(systemRefs.arenaGroup.position);
			}
		});

		// Boss ground pound particles
		window.addEventListener('boss-ground-pound', (e: Event) => {
			const d = (e as CustomEvent).detail;
			this.spawnBurst(d.x, 0.2, d.z, 30, NEON_PURPLE, 0.8);
		});

		// Ice ball hit — blue particle burst
		window.addEventListener('ice-hit', (e: Event) => {
			const d = (e as CustomEvent).detail;
			this.spawnBurst(d.x, d.y, d.z, 12, 0x4488ff, 0.5);
		});

		// Fire ball AoE — orange/red burst
		window.addEventListener('fire-aoe', (e: Event) => {
			const d = (e as CustomEvent).detail;
			this.spawnBurst(d.x, d.y, d.z, 25, 0xff4400, 0.7);
			this.spawnBurst(d.x, d.y + 0.3, d.z, 10, 0xffaa00, 0.4);
		});

		// Yeti boulder creates ice patch
		window.addEventListener('yeti-boulder', (e: Event) => {
			const d = (e as CustomEvent).detail;
			// Delayed ice patch creation (boulder needs to land)
			setTimeout(() => {
				this.createIcePatch(d.x, d.z);
			}, 800);
		});

		// Create shield indicator mesh
		const shieldGeo = new SphereGeometry(1.0, 16, 12);
		const shieldMat = new MeshBasicMaterial({
			color: NEON_GREEN,
			transparent: true,
			opacity: 0,
			wireframe: true,
		});
		this.shieldIndicator = new Mesh(shieldGeo, shieldMat);
		this.shieldIndicator.visible = false;
		this.world.scene.add(this.shieldIndicator);
	}

	update(delta: number): void {
		// Update particles
		for (let i = particles.length - 1; i >= 0; i--) {
			const p = particles[i];
			p.lifetime -= delta;

			p.mesh.position.x += p.velocity.x * delta;
			p.mesh.position.y += p.velocity.y * delta;
			p.mesh.position.z += p.velocity.z * delta;

			// Gravity
			p.velocity.y -= 3 * delta;

			// Fade
			const alpha = Math.max(0, p.lifetime / p.maxLifetime);
			(p.mesh.material as MeshBasicMaterial).opacity = alpha;
			p.mesh.scale.setScalar(alpha);

			if (p.lifetime <= 0) {
				systemRefs.particleGroup?.remove(p.mesh);
				p.mesh.geometry.dispose();
				(p.mesh.material as MeshBasicMaterial).dispose();
				particles.splice(i, 1);
			}
		}

		// Trail particles for snowballs
		this.trailTimer -= delta;
		if (this.trailTimer <= 0) {
			this.trailTimer = 0.04;
			this.spawnTrails();
		}

		// Damage zones
		this.updateDamageZones(delta);

		// Floating texts
		this.updateFloatingTexts(delta);

		// Icicle hazards
		this.updateIcicles(delta);

		// Ice patches
		this.updateIcePatches(delta);

		// Screen shake
		if (this.shakeIntensity > 0 && systemRefs.arenaGroup) {
			this.shakeIntensity *= 0.92;
			if (this.shakeIntensity > 0.01) {
				systemRefs.arenaGroup.position.x =
					this.shakeOriginalPos.x + (Math.random() - 0.5) * this.shakeIntensity;
				systemRefs.arenaGroup.position.y =
					this.shakeOriginalPos.y + (Math.random() - 0.5) * this.shakeIntensity * 0.5;
				systemRefs.arenaGroup.position.z =
					this.shakeOriginalPos.z + (Math.random() - 0.5) * this.shakeIntensity;
			} else {
				systemRefs.arenaGroup.position.copy(this.shakeOriginalPos);
				this.shakeIntensity = 0;
			}
		}

		// Shield indicator follows player
		if (this.shieldIndicator) {
			if (gameState.shieldActive) {
				const cam = this.world.camera;
				const pos = new Vector3();
				cam.getWorldPosition(pos);
				this.shieldIndicator.position.copy(pos);
				this.shieldIndicator.visible = true;
				(this.shieldIndicator.material as MeshBasicMaterial).opacity =
					0.15 + Math.sin(Date.now() * 0.005) * 0.1;
			} else {
				this.shieldIndicator.visible = false;
			}
		}
	}

	private spawnTrails(): void {
		if (!systemRefs.particleGroup) return;
		if (particles.length >= MAX_PARTICLES - 30) return;

		for (const sb of snowballs) {
			const color = sb.isPlayerOwned
				? sb.isGiant
					? NEON_PINK
					: NEON_CYAN
				: 0x334455;

			const mat = new MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.5,
			});
			const mesh = new Mesh(particleGeo, mat);
			mesh.position.copy(sb.mesh.position);
			mesh.position.x += (Math.random() - 0.5) * 0.06;
			mesh.position.y += (Math.random() - 0.5) * 0.06;
			mesh.position.z += (Math.random() - 0.5) * 0.06;

			const vel = new Vector3(
				(Math.random() - 0.5) * 0.2,
				(Math.random() - 0.5) * 0.2,
				(Math.random() - 0.5) * 0.2,
			);

			const lifetime = 0.15 + Math.random() * 0.2;
			systemRefs.particleGroup.add(mesh);
			particles.push({
				mesh,
				velocity: vel,
				lifetime,
				maxLifetime: lifetime,
			});
		}
	}

	private createDamageZone(x: number, z: number): void {
		if (!systemRefs.damageZoneGroup) return;

		const geo = new CircleGeometry(2.0, 24);
		const mat = new MeshBasicMaterial({
			color: 0xff2200,
			transparent: true,
			opacity: 0.35,
			side: DoubleSide,
		});
		const mesh = new Mesh(geo, mat);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(x, 0.03, z);
		systemRefs.damageZoneGroup.add(mesh);

		damageZones.push({
			mesh,
			lifetime: 3.0,
			playerInZoneTime: 0,
		});
	}

	private updateDamageZones(delta: number): void {
		if (damageZones.length === 0) return;

		const playerPos = new Vector3();
		this.world.camera.getWorldPosition(playerPos);

		for (let i = damageZones.length - 1; i >= 0; i--) {
			const zone = damageZones[i];
			zone.lifetime -= delta;

			// Pulse opacity
			const lifeAlpha = Math.min(zone.lifetime / 3.0, 1.0);
			const pulse = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;
			(zone.mesh.material as MeshBasicMaterial).opacity = 0.35 * lifeAlpha * pulse;

			// Scale pulse
			const scalePulse = 1.0 + Math.sin(Date.now() * 0.008) * 0.05;
			zone.mesh.scale.setScalar(scalePulse);

			// Check player in zone (2D distance)
			const dx = playerPos.x - zone.mesh.position.x;
			const dz = playerPos.z - zone.mesh.position.z;
			const dist2D = Math.sqrt(dx * dx + dz * dz);

			if (dist2D < 2.0 && gameState.state === GameState.PLAYING) {
				zone.playerInZoneTime += delta;
				if (zone.playerInZoneTime >= 2.0 && !gameState.shieldActive) {
					// Burst damage
					const dmg = 20;
					gameState.health -= dmg;
					gameState.combo = 0;
					window.dispatchEvent(
						new CustomEvent('player-hit', { detail: { damage: dmg } }),
					);
					if (gameState.health <= 0) {
						gameState.health = 0;
						gameState.state = GameState.GAME_OVER;
						window.dispatchEvent(new CustomEvent('game-over'));
					}
					zone.lifetime = 0; // Remove zone after dealing damage
				}
			} else {
				zone.playerInZoneTime = Math.max(0, zone.playerInZoneTime - delta * 2);
			}

			if (zone.lifetime <= 0) {
				systemRefs.damageZoneGroup?.remove(zone.mesh);
				zone.mesh.geometry.dispose();
				(zone.mesh.material as MeshBasicMaterial).dispose();
				damageZones.splice(i, 1);
			}
		}
	}

	private spawnFloatingText(
		x: number,
		y: number,
		z: number,
		text: string,
		color: number,
	): void {
		if (!systemRefs.floatingTextGroup) return;

		const group = new Group();
		group.position.set(x, y, z);

		// Create text using colored boxes as a visual indicator
		// Since we can't render text in 3D easily, we use a colored quad
		const bgGeo = new BoxGeometry(0.4 + text.length * 0.04, 0.12, 0.01);
		const bgMat = new MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0.9,
		});
		const bg = new Mesh(bgGeo, bgMat);
		group.add(bg);

		// Billboard toward camera
		const camPos = new Vector3();
		this.world.camera.getWorldPosition(camPos);
		group.lookAt(camPos);

		systemRefs.floatingTextGroup.add(group);

		const lifetime = 1.2;
		floatingTexts.push({
			group,
			lifetime,
			maxLifetime: lifetime,
			velocity: new Vector3(
				(Math.random() - 0.5) * 0.3,
				1.5 + Math.random() * 0.5,
				(Math.random() - 0.5) * 0.3,
			),
		});
	}

	private updateFloatingTexts(delta: number): void {
		const camPos = new Vector3();
		this.world.camera.getWorldPosition(camPos);

		for (let i = floatingTexts.length - 1; i >= 0; i--) {
			const ft = floatingTexts[i];
			ft.lifetime -= delta;

			ft.group.position.x += ft.velocity.x * delta;
			ft.group.position.y += ft.velocity.y * delta;
			ft.group.position.z += ft.velocity.z * delta;

			// Slow down vertical speed
			ft.velocity.y *= 0.97;

			// Fade and scale
			const alpha = Math.max(0, ft.lifetime / ft.maxLifetime);
			ft.group.scale.setScalar(0.7 + alpha * 0.3);

			// Billboard
			ft.group.lookAt(camPos);

			// Set opacity
			ft.group.traverse((child) => {
				if (child instanceof Mesh) {
					(child.material as MeshBasicMaterial).opacity = alpha;
				}
			});

			if (ft.lifetime <= 0) {
				systemRefs.floatingTextGroup?.remove(ft.group);
				ft.group.traverse((child) => {
					if (child instanceof Mesh) {
						child.geometry.dispose();
						(child.material as MeshBasicMaterial).dispose();
					}
				});
				floatingTexts.splice(i, 1);
			}
		}
	}

	private updateIcicles(delta: number): void {
		if (gameState.state !== GameState.PLAYING) return;

		// Spawn icicles periodically (starts wave 3+)
		if (gameState.wave >= 3) {
			this.icicleTimer -= delta;
			// More frequent in later waves
			const interval = Math.max(3, this.icicleInterval - gameState.wave * 0.3);
			if (this.icicleTimer <= 0) {
				this.icicleTimer = interval;
				this.spawnIcicle();
			}
		}

		// Update existing icicles
		for (let i = icicles.length - 1; i >= 0; i--) {
			const ic = icicles[i];
			ic.lifetime -= delta;

			// Fall with gravity
			ic.velocity.y -= 12 * delta;
			ic.mesh.position.x += ic.velocity.x * delta;
			ic.mesh.position.y += ic.velocity.y * delta;
			ic.mesh.position.z += ic.velocity.z * delta;

			// Check hit on enemies
			for (let j = enemies.length - 1; j >= 0; j--) {
				const enemy = enemies[j];
				if (enemy.isDying) continue;
				const dist = ic.mesh.position.distanceTo(enemy.group.position);
				if (dist < 1.0 && ic.mesh.position.y < 1.5) {
					enemy.health -= ic.damage;
					enemy.hitFlashTimer = 0.2;
					if (enemy.health <= 0) {
						enemy.isDying = true;
						enemy.deathTimer = 0.5;
						gameState.enemiesKilled++;
						gameState.totalEnemiesKilled++;
						gameState.enemiesRemaining--;

						const config = ENEMY_CONFIGS[enemy.type];
						const diffConfig = DIFFICULTY_CONFIGS[gameState.difficulty];
						const points = Math.floor(config.points * 0.5 * diffConfig.scoreMultiplier);
						gameState.score += points;

						this.spawnFloatingText(
							enemy.group.position.x,
							enemy.group.position.y + 1.5,
							enemy.group.position.z,
							`+${points}`,
							0x88ccff,
						);

						window.dispatchEvent(new CustomEvent('enemy-hit', {
							detail: {
								killed: true,
								points,
								combo: 0,
								x: enemy.group.position.x,
								y: enemy.group.position.y + 1.5,
								z: enemy.group.position.z,
							},
						}));
					}
					this.spawnBurst(ic.mesh.position.x, ic.mesh.position.y, ic.mesh.position.z, 8, 0x88ccff, 0.3);
					ic.lifetime = 0;
					break;
				}
			}

			// Hit ground
			if (ic.mesh.position.y < 0) {
				this.spawnBurst(ic.mesh.position.x, 0.1, ic.mesh.position.z, 6, 0x88ccff, 0.2);
				ic.lifetime = 0;
			}

			if (ic.lifetime <= 0 || ic.mesh.position.y < -1) {
				systemRefs.icicleGroup?.remove(ic.mesh);
				ic.mesh.geometry.dispose();
				(ic.mesh.material as MeshStandardMaterial).dispose();
				icicles.splice(i, 1);
			}
		}
	}

	private spawnIcicle(): void {
		if (!systemRefs.icicleGroup) return;

		// Drop near a random enemy if possible, otherwise random position
		let x: number, z: number;
		if (enemies.length > 0) {
			const target = enemies[Math.floor(Math.random() * enemies.length)];
			x = target.group.position.x + (Math.random() - 0.5) * 2;
			z = target.group.position.z + (Math.random() - 0.5) * 2;
		} else {
			const angle = Math.random() * Math.PI * 2;
			const dist = 3 + Math.random() * (ARENA_RADIUS - 3);
			x = Math.cos(angle) * dist;
			z = Math.sin(angle) * dist;
		}

		// Spawn warning sparkle first (visual telegraph)
		this.spawnBurst(x, 0.1, z, 4, 0x88ccff, 0.1);

		const geo = new ConeGeometry(0.08, 0.5, 6);
		const mat = new MeshStandardMaterial({
			color: 0x88ccff,
			roughness: 0.1,
			metalness: 0.5,
			emissive: new Color(0x4488ff),
			emissiveIntensity: 0.5,
			transparent: true,
			opacity: 0.85,
		});
		const mesh = new Mesh(geo, mat);
		mesh.position.set(x, 12 + Math.random() * 3, z);
		mesh.rotation.x = Math.PI; // Point downward

		systemRefs.icicleGroup.add(mesh);

		icicles.push({
			mesh,
			velocity: new Vector3(0, -2, 0),
			lifetime: 5,
			damage: 2,
		});

		// Spawn audio event
		window.dispatchEvent(new CustomEvent('icicle-drop'));
	}

	private createIcePatch(x: number, z: number): void {
		if (!systemRefs.icePatchGroup) return;
		if (icePatches.length >= 6) {
			// Remove oldest patch
			const old = icePatches.shift()!;
			systemRefs.icePatchGroup.remove(old.mesh);
			old.mesh.geometry.dispose();
			(old.mesh.material as MeshBasicMaterial).dispose();
		}

		const radius = 1.5 + Math.random() * 0.5;
		const geo = new CircleGeometry(radius, 24);
		const mat = new MeshBasicMaterial({
			color: 0x88ccff,
			transparent: true,
			opacity: 0.35,
			side: DoubleSide,
		});
		const mesh = new Mesh(geo, mat);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(x, 0.015, z);
		systemRefs.icePatchGroup.add(mesh);

		icePatches.push({ mesh, lifetime: 20, radius });

		// Sparkle effect
		this.spawnBurst(x, 0.1, z, 8, 0x88ccff, 0.3);
		window.dispatchEvent(new CustomEvent('ice-patch-create'));
	}

	private updateIcePatches(delta: number): void {
		for (let i = icePatches.length - 1; i >= 0; i--) {
			const patch = icePatches[i];
			patch.lifetime -= delta;

			// Shimmer
			const shimmer = 0.25 + Math.sin(Date.now() * 0.003 + patch.mesh.position.x) * 0.1;
			(patch.mesh.material as MeshBasicMaterial).opacity = shimmer * Math.min(1, patch.lifetime / 2);

			if (patch.lifetime <= 0) {
				systemRefs.icePatchGroup?.remove(patch.mesh);
				patch.mesh.geometry.dispose();
				(patch.mesh.material as MeshBasicMaterial).dispose();
				icePatches.splice(i, 1);
			}
		}
	}

	private spawnImpact(x: number, y: number, z: number, isGiant: boolean): void {
		const count = isGiant ? 20 : 10;
		this.spawnBurst(x, y, z, count, SNOW_WHITE, isGiant ? 0.6 : 0.4);
	}

	private spawnBurst(
		x: number,
		y: number,
		z: number,
		count: number,
		color: number,
		speed: number,
	): void {
		if (!systemRefs.particleGroup) return;
		if (particles.length >= MAX_PARTICLES) return;

		const actualCount = Math.min(count, MAX_PARTICLES - particles.length);

		for (let i = 0; i < actualCount; i++) {
			const mat = new MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 1,
			});
			const mesh = new Mesh(particleGeo, mat);
			mesh.position.set(x, y + 0.1, z);

			const vel = new Vector3(
				(Math.random() - 0.5) * speed * 4,
				Math.random() * speed * 3 + 1,
				(Math.random() - 0.5) * speed * 4,
			);

			const lifetime = 0.3 + Math.random() * 0.6;

			systemRefs.particleGroup.add(mesh);
			particles.push({
				mesh,
				velocity: vel,
				lifetime,
				maxLifetime: lifetime,
			});
		}
	}

	private flashScreen(color: number): void {
		const cam = this.world.camera;
		const pos = new Vector3();
		cam.getWorldPosition(pos);
		this.spawnBurst(pos.x, pos.y, pos.z, 8, color, 0.3);
	}
}
