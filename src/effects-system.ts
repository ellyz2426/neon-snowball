/**
 * EffectsSystem — particle effects, trails, damage zones, screen shake.
 */
import {
	createSystem,
	Mesh,
	MeshBasicMaterial,
	SphereGeometry,
	CircleGeometry,
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
	systemRefs,
	particleGeo,
	ParticleData,
	DamageZoneData,
	NEON_CYAN,
	NEON_PINK,
	NEON_GREEN,
	NEON_PURPLE,
	SNOW_WHITE,
} from './game-state.js';

const MAX_PARTICLES = 400;

export class EffectsSystem extends createSystem({}) {
	private shieldIndicator: Mesh | null = null;
	private trailTimer = 0;
	private shakeIntensity = 0;
	private shakeOriginalPos = new Vector3();

	init(): void {
		// Snowball impact
		window.addEventListener('snowball-impact', (e: Event) => {
			const d = (e as CustomEvent).detail;
			this.spawnImpact(d.x, d.y, d.z, d.isGiant);
		});

		// Enemy killed
		window.addEventListener('enemy-hit', (e: Event) => {
			const d = (e as CustomEvent).detail;
			if (d.killed) {
				this.spawnBurst(0, 1, 0, 20, NEON_CYAN, 0.5);
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
