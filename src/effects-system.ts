/**
 * EffectsSystem — particle effects for impacts, power-ups, visual feedback.
 */
import {
	createSystem,
	Mesh,
	MeshBasicMaterial,
	SphereGeometry,
	Vector3,
	Color,
} from '@iwsdk/core';
import {
	gameState,
	GameState,
	particles,
	systemRefs,
	particleGeo,
	ParticleData,
	NEON_CYAN,
	NEON_PINK,
	NEON_GREEN,
	NEON_PURPLE,
	SNOW_WHITE,
} from './game-state.js';

const MAX_PARTICLES = 300;

export class EffectsSystem extends createSystem({}) {
	private shieldIndicator: Mesh | null = null;
	private freezeOverlay: Mesh | null = null;

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
				// Extra particles for kill
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
		// Brief visual indicator — could add screen overlay in future
		// For now, emit particles near camera
		const cam = this.world.camera;
		const pos = new Vector3();
		cam.getWorldPosition(pos);
		this.spawnBurst(pos.x, pos.y, pos.z, 8, color, 0.3);
	}
}
