/**
 * ArenaSystem — builds the winter wonderland environment.
 * Snow ground, forts with neon trim, pine trees, street lamps, frozen pond,
 * falling snow particles, aurora borealis sky.
 */
import {
	createSystem,
	Group,
	Object3D,
	Mesh,
	MeshStandardMaterial,
	MeshBasicMaterial,
	PlaneGeometry,
	BoxGeometry,
	CylinderGeometry,
	ConeGeometry,
	SphereGeometry,
	CircleGeometry,
	RingGeometry,
	PointLight,
	DirectionalLight,
	AmbientLight,
	Color,
	DoubleSide,
	Vector3,
	FogExp2,
} from '@iwsdk/core';
import {
	systemRefs,
	gameState,
	GameState,
	ARENA_RADIUS,
	NEON_CYAN,
	NEON_BLUE,
	NEON_PURPLE,
	NEON_PINK,
	WARM_YELLOW,
	SNOW_WHITE,
	ICE_BLUE,
	WeatherType,
	isBossWave,
	forts,
	FortData,
	FORT_MAX_HEALTH,
	FORT_DAMAGE_RADIUS,
} from './game-state.js';

export class ArenaSystem extends createSystem({}) {
	private snowParticles: { mesh: Mesh; vel: Vector3; baseY: number }[] = [];
	private auroraLights: PointLight[] = [];
	private ambientLight: AmbientLight | null = null;
	private moonLight: DirectionalLight | null = null;
	private time = 0;
	private auroraCurtains: Mesh[] = [];
	private starField: Mesh[] = [];
	private windDrifts: { mesh: Mesh; vel: Vector3; life: number; maxLife: number }[] = [];
	private campfires: { light: PointLight; flames: Mesh[]; baseY: number }[] = [];
	private skyDome: Mesh | null = null;
	private auroraFlashTimer = 0;
	private bossSpawnLightTimer = 0;

	init(): void {
		const scene = this.world.scene;
		systemRefs.scene = scene;

		// Container groups
		const arenaGroup = new Group();
		arenaGroup.name = 'arena';
		scene.add(arenaGroup);
		systemRefs.arenaGroup = arenaGroup;

		const snowballGroup = new Group();
		snowballGroup.name = 'snowballs';
		scene.add(snowballGroup);
		systemRefs.snowballGroup = snowballGroup;

		const enemyGroup = new Group();
		enemyGroup.name = 'enemies';
		scene.add(enemyGroup);
		systemRefs.enemyGroup = enemyGroup;

		const particleGroup = new Group();
		particleGroup.name = 'particles';
		scene.add(particleGroup);
		systemRefs.particleGroup = particleGroup;

		const powerUpGroup = new Group();
		powerUpGroup.name = 'powerups';
		scene.add(powerUpGroup);
		systemRefs.powerUpGroup = powerUpGroup;

		const damageZoneGroup = new Group();
		damageZoneGroup.name = 'damage-zones';
		scene.add(damageZoneGroup);
		systemRefs.damageZoneGroup = damageZoneGroup;

		const floatingTextGroup = new Group();
		floatingTextGroup.name = 'floating-text';
		scene.add(floatingTextGroup);
		systemRefs.floatingTextGroup = floatingTextGroup;

		const icicleGroup = new Group();
		icicleGroup.name = 'icicles';
		scene.add(icicleGroup);
		systemRefs.icicleGroup = icicleGroup;

		const icePatchGroup = new Group();
		icePatchGroup.name = 'ice-patches';
		scene.add(icePatchGroup);
		systemRefs.icePatchGroup = icePatchGroup;

		const allyGroup = new Group();
		allyGroup.name = 'allies';
		scene.add(allyGroup);
		systemRefs.allyGroup = allyGroup;

		const burningGroup = new Group();
		burningGroup.name = 'burning-ground';
		scene.add(burningGroup);
		systemRefs.burningGroup = burningGroup;

		// Lighting
		this.setupLighting(scene);

		// Ground
		this.buildGround(arenaGroup);

		// Forts
		this.buildForts(arenaGroup);

		// Trees
		this.buildTrees(arenaGroup);

		// Street lamps
		this.buildLamps(arenaGroup);

		// Frozen pond
		this.buildPond(arenaGroup);

		// Snow piles (ammo indicators)
		this.buildSnowPiles(arenaGroup);

		// Snow-covered rocks
		this.buildRocks(arenaGroup);

		// Campfires near forts
		this.buildCampfires(arenaGroup);

		// Fog
		scene.fog = new FogExp2(0x0a1428, 0.02);

		// Falling snow
		this.initFallingSnow(scene);

		// Sky dome with stars
		this.buildSkyDome(scene);

		// Aurora curtain meshes
		this.buildAuroraCurtains(scene);

		// Ground-level wind drift particles
		this.initWindDrifts(scene);

		// Wave transition effects
		window.addEventListener('wave-complete', () => {
			this.auroraFlashTimer = 1.5; // Aurora flash for 1.5s
		});

		window.addEventListener('wave-start', (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.wave > 0 && detail.wave % 5 === 0) {
				// Boss wave: dramatic lighting pulse + screen shake
				this.bossSpawnLightTimer = 2.0;
				window.dispatchEvent(new CustomEvent('screen-shake', {
					detail: { intensity: 0.5 },
				}));
			}
		});
	}

	private setupLighting(scene: Object3D): void {
		// Ambient
		const ambient = new AmbientLight(0x334466, 0.4);
		scene.add(ambient);
		this.ambientLight = ambient;

		// Main directional (moonlight)
		const moon = new DirectionalLight(0x8899cc, 0.6);
		moon.position.set(5, 15, -5);
		scene.add(moon);
		this.moonLight = moon;

		// Fill from below (snow reflection)
		const fill = new DirectionalLight(0x445577, 0.2);
		fill.position.set(-3, -2, 3);
		scene.add(fill);

		// Aurora borealis lights (cycle colors)
		const auroraColors = [0x00ff88, 0x4488ff, 0x8844ff, 0x00ffcc];
		for (let i = 0; i < 4; i++) {
			const light = new PointLight(auroraColors[i], 0.3, 50);
			const angle = (i / 4) * Math.PI * 2;
			light.position.set(
				Math.cos(angle) * 20,
				12 + Math.random() * 5,
				Math.sin(angle) * 20,
			);
			scene.add(light);
			this.auroraLights.push(light);
		}
	}

	private buildGround(parent: Group): void {
		// Snow ground
		const groundGeo = new PlaneGeometry(60, 60, 20, 20);
		const groundMat = new MeshStandardMaterial({
			color: SNOW_WHITE,
			roughness: 0.85,
			metalness: 0.05,
			emissive: new Color(0x112233),
			emissiveIntensity: 0.1,
		});
		const ground = new Mesh(groundGeo, groundMat);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = 0;
		ground.receiveShadow = true;
		parent.add(ground);

		// Subtle grid lines on snow (neon blue)
		for (let i = -6; i <= 6; i++) {
			const lineGeo = new BoxGeometry(30, 0.005, 0.02);
			const lineMat = new MeshBasicMaterial({
				color: NEON_CYAN,
				transparent: true,
				opacity: 0.08,
			});
			const line = new Mesh(lineGeo, lineMat);
			line.position.set(0, 0.005, i * 2.5);
			parent.add(line);

			const line2 = new Mesh(lineGeo.clone(), lineMat.clone());
			line2.rotation.y = Math.PI / 2;
			line2.position.set(i * 2.5, 0.005, 0);
			parent.add(line2);
		}
	}

	private buildForts(parent: Group): void {
		const fortPositions = [
			{ x: -5, z: -4, rot: 0.3 },
			{ x: 5, z: -5, rot: -0.2 },
			{ x: -4, z: 4, rot: -0.4 },
			{ x: 6, z: 3, rot: 0.5 },
		];

		forts.length = 0;

		for (const pos of fortPositions) {
			const fort = new Group();
			fort.position.set(pos.x, 0, pos.z);
			fort.rotation.y = pos.rot;

			const walls: Mesh[] = [];
			const originalScales: Vector3[] = [];

			// Main snow wall
			const wallGeo = new BoxGeometry(2.5, 1.0, 0.5);
			const wallMat = new MeshStandardMaterial({
				color: SNOW_WHITE,
				roughness: 0.9,
				metalness: 0.0,
			});
			const wall = new Mesh(wallGeo, wallMat);
			wall.position.y = 0.5;
			fort.add(wall);
			walls.push(wall);
			originalScales.push(new Vector3(1, 1, 1));

			// Side walls
			for (const side of [-1, 1]) {
				const sideGeo = new BoxGeometry(0.5, 0.8, 1.2);
				const sideWall = new Mesh(sideGeo, wallMat.clone());
				sideWall.position.set(side * 1.2, 0.4, -0.5);
				fort.add(sideWall);
				walls.push(sideWall);
				originalScales.push(new Vector3(1, 1, 1));
			}

			// Neon trim on top
			const trimGeo = new BoxGeometry(2.6, 0.04, 0.06);
			const trimMat = new MeshBasicMaterial({
				color: NEON_CYAN,
				transparent: true,
				opacity: 0.9,
			});
			const trim = new Mesh(trimGeo, trimMat);
			trim.position.set(0, 1.02, 0);
			fort.add(trim);
			walls.push(trim);
			originalScales.push(new Vector3(1, 1, 1));

			// Neon glow
			const glow = new PointLight(NEON_CYAN, 0.3, 4);
			glow.position.set(0, 1.1, 0);
			fort.add(glow);

			parent.add(fort);

			forts.push({
				group: fort,
				walls,
				glowLight: glow,
				health: FORT_MAX_HEALTH,
				maxHealth: FORT_MAX_HEALTH,
				position: new Vector3(pos.x, 0, pos.z),
				originalScales,
				isDestroyed: false,
				rebuildProgress: 0,
			});
		}

		// Listen for fort damage from enemy snowballs
		window.addEventListener('snowball-impact', (e: Event) => {
			const d = (e as CustomEvent).detail;
			if (d.isPlayerOwned) return; // Only enemy snowballs damage forts
			this.checkFortDamage(d.x, d.z);
		});

		// Rebuild forts between waves
		window.addEventListener('wave-complete', () => {
			this.startFortRebuild();
		});
	}

	private buildTrees(parent: Group): void {
		const treePositions = [
			{ x: -9, z: -8 },
			{ x: 9, z: -7 },
			{ x: -8, z: 7 },
			{ x: 10, z: 6 },
			{ x: -12, z: 0 },
			{ x: 12, z: -2 },
			{ x: 0, z: -11 },
			{ x: -6, z: -10 },
			{ x: 7, z: 10 },
			{ x: -11, z: -5 },
		];

		for (const pos of treePositions) {
			const tree = new Group();
			tree.position.set(pos.x, 0, pos.z);
			const scale = 0.8 + Math.random() * 0.5;
			tree.scale.setScalar(scale);

			// Trunk
			const trunkGeo = new CylinderGeometry(0.12, 0.18, 1.5, 8);
			const trunkMat = new MeshStandardMaterial({
				color: 0x4a3222,
				roughness: 0.9,
			});
			const trunk = new Mesh(trunkGeo, trunkMat);
			trunk.position.y = 0.75;
			tree.add(trunk);

			// Foliage layers (3 cones)
			const foliageMat = new MeshStandardMaterial({
				color: 0x1a4422,
				roughness: 0.8,
				emissive: new Color(0x003311),
				emissiveIntensity: 0.2,
			});
			const layerData = [
				{ y: 1.8, r: 1.2, h: 1.5 },
				{ y: 2.6, r: 0.9, h: 1.3 },
				{ y: 3.2, r: 0.6, h: 1.1 },
			];
			for (const ld of layerData) {
				const coneGeo = new ConeGeometry(ld.r, ld.h, 8);
				const cone = new Mesh(coneGeo, foliageMat.clone());
				cone.position.y = ld.y;
				tree.add(cone);
			}

			// Snow caps
			const snowMat = new MeshStandardMaterial({
				color: 0xffffff,
				roughness: 0.95,
			});
			for (const ld of layerData) {
				const capGeo = new ConeGeometry(ld.r * 0.7, 0.15, 8);
				const cap = new Mesh(capGeo, snowMat.clone());
				cap.position.y = ld.y + ld.h * 0.4;
				tree.add(cap);
			}

			parent.add(tree);
		}
	}

	private buildLamps(parent: Group): void {
		const lampPositions = [
			{ x: -3, z: -7 },
			{ x: 3, z: -7 },
			{ x: -7, z: 0 },
			{ x: 7, z: 0 },
			{ x: -3, z: 7 },
			{ x: 3, z: 7 },
		];

		for (const pos of lampPositions) {
			const lamp = new Group();
			lamp.position.set(pos.x, 0, pos.z);

			// Pole
			const poleGeo = new CylinderGeometry(0.04, 0.06, 3.0, 8);
			const poleMat = new MeshStandardMaterial({
				color: 0x222222,
				metalness: 0.8,
				roughness: 0.3,
			});
			const pole = new Mesh(poleGeo, poleMat);
			pole.position.y = 1.5;
			lamp.add(pole);

			// Lantern housing
			const housingGeo = new BoxGeometry(0.25, 0.3, 0.25);
			const housingMat = new MeshStandardMaterial({
				color: 0x111111,
				metalness: 0.9,
				roughness: 0.2,
			});
			const housing = new Mesh(housingGeo, housingMat);
			housing.position.y = 3.15;
			lamp.add(housing);

			// Lamp glow sphere
			const glowGeo = new SphereGeometry(0.1, 8, 6);
			const glowMat = new MeshBasicMaterial({
				color: WARM_YELLOW,
				transparent: true,
				opacity: 0.9,
			});
			const glow = new Mesh(glowGeo, glowMat);
			glow.position.y = 3.15;
			lamp.add(glow);

			// Point light
			const light = new PointLight(WARM_YELLOW, 0.8, 8);
			light.position.y = 3.15;
			lamp.add(light);

			// Base
			const baseGeo = new CylinderGeometry(0.15, 0.2, 0.1, 8);
			const baseMesh = new Mesh(baseGeo, poleMat.clone());
			baseMesh.position.y = 0.05;
			lamp.add(baseMesh);

			parent.add(lamp);
		}
	}

	private buildPond(parent: Group): void {
		// Frozen pond
		const pondGeo = new CircleGeometry(2.5, 32);
		const pondMat = new MeshStandardMaterial({
			color: ICE_BLUE,
			roughness: 0.1,
			metalness: 0.5,
			transparent: true,
			opacity: 0.7,
			emissive: new Color(0x224466),
			emissiveIntensity: 0.3,
		});
		const pond = new Mesh(pondGeo, pondMat);
		pond.rotation.x = -Math.PI / 2;
		pond.position.set(6, 0.01, -1);
		parent.add(pond);

		// Ice edge ring
		const ringGeo = new RingGeometry(2.3, 2.6, 32);
		const ringMat = new MeshBasicMaterial({
			color: NEON_CYAN,
			transparent: true,
			opacity: 0.3,
			side: DoubleSide,
		});
		const ring = new Mesh(ringGeo, ringMat);
		ring.rotation.x = -Math.PI / 2;
		ring.position.set(6, 0.02, -1);
		parent.add(ring);
	}

	private buildSnowPiles(parent: Group): void {
		const pilePositions = [
			{ x: -1.5, z: -1 },
			{ x: 1.5, z: -1 },
			{ x: 0, z: 1.5 },
			{ x: -2, z: 1 },
			{ x: 2, z: 1 },
		];

		for (const pos of pilePositions) {
			const pile = new Group();
			pile.position.set(pos.x, 0, pos.z);

			// Main mound
			const moundGeo = new SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
			const moundMat = new MeshStandardMaterial({
				color: 0xffffff,
				roughness: 0.95,
				emissive: new Color(NEON_CYAN),
				emissiveIntensity: 0.05,
			});
			const mound = new Mesh(moundGeo, moundMat);
			mound.position.y = 0;
			pile.add(mound);

			// Small snowballs on top
			for (let i = 0; i < 3; i++) {
				const ballGeo = new SphereGeometry(0.08, 8, 6);
				const ball = new Mesh(ballGeo, moundMat.clone());
				ball.position.set(
					(Math.random() - 0.5) * 0.3,
					0.2 + Math.random() * 0.1,
					(Math.random() - 0.5) * 0.3,
				);
				pile.add(ball);
			}

			// Subtle glow
			const gl = new PointLight(NEON_CYAN, 0.15, 2);
			gl.position.y = 0.3;
			pile.add(gl);

			parent.add(pile);
		}
	}

	private initFallingSnow(scene: Object3D): void {
		const snowMat = new MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.7,
		});

		for (let i = 0; i < 200; i++) {
			const size = 0.02 + Math.random() * 0.03;
			const geo = new SphereGeometry(size, 4, 3);
			const flake = new Mesh(geo, snowMat.clone());
			flake.position.set(
				(Math.random() - 0.5) * 40,
				Math.random() * 15,
				(Math.random() - 0.5) * 40,
			);
			scene.add(flake);
			this.snowParticles.push({
				mesh: flake,
				vel: new Vector3(
					(Math.random() - 0.5) * 0.3,
					-0.3 - Math.random() * 0.5,
					(Math.random() - 0.5) * 0.3,
				),
				baseY: flake.position.y,
			});
		}
	}

	update(delta: number): void {
		this.time += delta;

		const weather = gameState.weather;

		// ── Day/Night cycle progression ──
		if (gameState.state === GameState.PLAYING || gameState.state === GameState.WAVE_COMPLETE) {
			// Cycle speed: full cycle every ~120 seconds of gameplay
			const cycleSpeed = 0.008;
			gameState.dayNightPhase += gameState.dayNightDirection * cycleSpeed * delta;
			if (gameState.dayNightPhase >= 1.0) {
				gameState.dayNightPhase = 1.0;
				gameState.dayNightDirection = -1;
			} else if (gameState.dayNightPhase <= 0.0) {
				gameState.dayNightPhase = 0.0;
				gameState.dayNightDirection = 1;
			}
		}

		// Check if boss wave for snowstorm effect
		const isStorm =
			gameState.wave > 0 &&
			isBossWave(gameState.wave) &&
			gameState.state === GameState.PLAYING;

		// Weather multipliers
		let windMult: number, fallMult: number, swayAmt: number;
		let targetFog: number;

		if (isStorm) {
			windMult = 3.0;
			fallMult = 2.0;
			swayAmt = 0.04;
			targetFog = 0.04;
		} else {
			switch (weather) {
				case WeatherType.BLIZZARD:
					windMult = 2.5; fallMult = 1.8; swayAmt = 0.035; targetFog = 0.035;
					break;
				case WeatherType.HEAVY_SNOW:
					windMult = 1.8; fallMult = 1.4; swayAmt = 0.02; targetFog = 0.028;
					break;
				case WeatherType.LIGHT_SNOW:
					windMult = 1.2; fallMult = 1.1; swayAmt = 0.012; targetFog = 0.022;
					break;
				default:
					windMult = 1.0; fallMult = 1.0; swayAmt = 0.01; targetFog = 0.02;
					break;
			}
		}

		// Weather-based lighting transitions
		this.updateWeatherLighting(weather, isStorm, delta);

		// Animate falling snow
		for (const sp of this.snowParticles) {
			sp.mesh.position.x += sp.vel.x * delta * windMult;
			sp.mesh.position.y += sp.vel.y * delta * fallMult;
			sp.mesh.position.z += sp.vel.z * delta * windMult;

			// Horizontal sway (stronger in storm/blizzard)
			sp.mesh.position.x += Math.sin(this.time * 0.5 + sp.baseY) * swayAmt;

			// Reset at bottom
			if (sp.mesh.position.y < 0) {
				sp.mesh.position.y = 12 + Math.random() * 3;
				sp.mesh.position.x = (Math.random() - 0.5) * 40;
				sp.mesh.position.z = (Math.random() - 0.5) * 40;
			}

			// Snow opacity varies with weather
			const snowOpacity = weather === WeatherType.BLIZZARD || isStorm ? 0.9
				: weather === WeatherType.HEAVY_SNOW ? 0.8
				: 0.7;
			(sp.mesh.material as MeshBasicMaterial).opacity = snowOpacity;
		}

		// Adjust fog density for weather
		if (this.world.scene.fog) {
			const fog = this.world.scene.fog as FogExp2;
			fog.density += (targetFog - fog.density) * delta * 2;
		}

		// Animate aurora lights
		for (let i = 0; i < this.auroraLights.length; i++) {
			const light = this.auroraLights[i];
			const phase = this.time * 0.3 + i * 1.5;
			// Dimmer aurora in heavy weather
			const auroraMax = weather === WeatherType.BLIZZARD || isStorm ? 0.08
				: weather === WeatherType.HEAVY_SNOW ? 0.12
				: 0.15;
			light.intensity = auroraMax + Math.sin(phase) * auroraMax;
			light.position.y = 12 + Math.sin(phase * 0.7) * 3;
		}

		// Animate aurora curtain meshes
		this.updateAuroraCurtains(weather, isStorm);

		// Animate wind drifts
		this.updateWindDrifts(delta, windMult);

		// Animate campfires
		this.updateCampfires();

		// ── Aurora flash on wave complete ──
		if (this.auroraFlashTimer > 0) {
			this.auroraFlashTimer -= delta;
			const flashIntensity = Math.min(1, this.auroraFlashTimer / 0.3);
			for (const curtain of this.auroraCurtains) {
				(curtain.material as MeshBasicMaterial).opacity = 0.3 + flashIntensity * 0.5;
			}
			for (const light of this.auroraLights) {
				light.intensity = 0.5 + flashIntensity * 1.0;
			}
			// Flash stars brighter
			for (const star of this.starField) {
				(star.material as MeshBasicMaterial).opacity = 0.5 + flashIntensity * 0.5;
			}
		}

		// ── Boss spawn dramatic lighting ──
		if (this.bossSpawnLightTimer > 0) {
			this.bossSpawnLightTimer -= delta;
			const bossFlash = Math.sin(this.bossSpawnLightTimer * 8) * 0.5 + 0.5;
			if (this.moonLight) {
				this.moonLight.color.setHex(bossFlash > 0.5 ? 0xff4488 : 0x8899cc);
				this.moonLight.intensity = 0.6 + bossFlash * 0.8;
			}
			if (this.bossSpawnLightTimer <= 0 && this.moonLight) {
				this.moonLight.color.setHex(0x8899cc);
			}
		}

		// ── Update sky dome color for day/night ──
		if (this.skyDome) {
			const phase = gameState.dayNightPhase;
			// Interpolate: night (0x050a18) → dawn/dusk (0x152040) → day (0x1a2848)
			const r = 0.02 + phase * 0.08;
			const g = 0.04 + phase * 0.10;
			const b = 0.09 + phase * 0.14;
			(this.skyDome.material as MeshBasicMaterial).color.setRGB(r, g, b);
		}
	}

	private buildSkyDome(scene: Object3D): void {
		// Star field — small glowing spheres scattered on a large sphere
		const starMat = new MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.8,
		});
		for (let i = 0; i < 120; i++) {
			const size = 0.05 + Math.random() * 0.08;
			const geo = new SphereGeometry(size, 4, 3);
			const star = new Mesh(geo, starMat.clone());
			// Random position on a large sphere (radius 35)
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.random() * Math.PI * 0.45; // Upper hemisphere only
			const r = 35;
			star.position.set(
				r * Math.sin(phi) * Math.cos(theta),
				r * Math.cos(phi) + 5,
				r * Math.sin(phi) * Math.sin(theta),
			);
			scene.add(star);
			this.starField.push(star);
		}

		// Dark sky hemisphere (subtle gradient backdrop)
		const skyGeo = new SphereGeometry(40, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
		const skyMat = new MeshBasicMaterial({
			color: 0x050a18,
			side: DoubleSide,
			transparent: true,
			opacity: 0.95,
		});
		const sky = new Mesh(skyGeo, skyMat);
		sky.position.y = -1;
		scene.add(sky);
		this.skyDome = sky;
	}

	private buildAuroraCurtains(scene: Object3D): void {
		// Animated aurora curtain bands — tall thin plane meshes
		const auroraColors = [0x00ff88, 0x4488ff, 0x8844ff, 0x00ffcc, 0x22ff66];
		for (let i = 0; i < 5; i++) {
			const width = 8 + Math.random() * 12;
			const height = 3 + Math.random() * 4;
			const geo = new PlaneGeometry(width, height, 6, 1);
			const mat = new MeshBasicMaterial({
				color: auroraColors[i % auroraColors.length],
				transparent: true,
				opacity: 0.08,
				side: DoubleSide,
			});
			const curtain = new Mesh(geo, mat);
			const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
			const dist = 25 + Math.random() * 5;
			curtain.position.set(
				Math.cos(angle) * dist,
				14 + Math.random() * 4,
				Math.sin(angle) * dist,
			);
			// Face inward
			curtain.lookAt(0, curtain.position.y, 0);
			scene.add(curtain);
			this.auroraCurtains.push(curtain);
		}
	}

	private updateAuroraCurtains(weather: WeatherType, isStorm: boolean): void {
		const baseOpacity = (weather === WeatherType.BLIZZARD || isStorm) ? 0.03
			: weather === WeatherType.HEAVY_SNOW ? 0.05
			: 0.1;

		for (let i = 0; i < this.auroraCurtains.length; i++) {
			const curtain = this.auroraCurtains[i];
			const phase = this.time * 0.2 + i * 1.2;
			const wave = Math.sin(phase) * 0.5 + 0.5;
			(curtain.material as MeshBasicMaterial).opacity = baseOpacity * (0.3 + wave * 0.7);
			// Gentle vertical undulation
			curtain.position.y = 14 + i * 0.5 + Math.sin(phase * 0.7) * 1.5;
			// Subtle horizontal sway
			curtain.rotation.y += Math.sin(this.time * 0.1 + i) * 0.0003;
		}

		// Twinkle stars
		for (let i = 0; i < this.starField.length; i++) {
			const star = this.starField[i];
			const twinkle = Math.sin(this.time * 2 + i * 7.3) * 0.3 + 0.6;
			const weatherDim = (weather === WeatherType.BLIZZARD || isStorm) ? 0.15
				: weather === WeatherType.HEAVY_SNOW ? 0.4
				: 1.0;
			(star.material as MeshBasicMaterial).opacity = twinkle * weatherDim;
		}
	}

	private initWindDrifts(scene: Object3D): void {
		// Low-lying snow wisps that flow near the ground
		const driftMat = new MeshBasicMaterial({
			color: 0xddeeff,
			transparent: true,
			opacity: 0.2,
		});
		for (let i = 0; i < 40; i++) {
			const w = 0.3 + Math.random() * 0.5;
			const h = 0.02;
			const geo = new BoxGeometry(w, h, 0.04);
			const drift = new Mesh(geo, driftMat.clone());
			const angle = Math.random() * Math.PI * 2;
			const dist = 2 + Math.random() * 12;
			drift.position.set(
				Math.cos(angle) * dist,
				0.02 + Math.random() * 0.08,
				Math.sin(angle) * dist,
			);
			drift.rotation.y = Math.random() * Math.PI;
			scene.add(drift);
			const life = 2 + Math.random() * 4;
			this.windDrifts.push({
				mesh: drift,
				vel: new Vector3(
					0.3 + Math.random() * 0.5,
					0,
					(Math.random() - 0.5) * 0.2,
				),
				life,
				maxLife: life,
			});
		}
	}

	private updateWindDrifts(delta: number, windMult: number): void {
		for (const drift of this.windDrifts) {
			drift.life -= delta;
			drift.mesh.position.x += drift.vel.x * delta * windMult;
			drift.mesh.position.z += drift.vel.z * delta * windMult;

			// Fade based on lifetime
			const alpha = Math.min(1, drift.life / (drift.maxLife * 0.3));
			const fadeIn = Math.min(1, (drift.maxLife - drift.life) / (drift.maxLife * 0.2));
			const baseOpacity = windMult > 1.5 ? 0.35 : 0.2;
			(drift.mesh.material as MeshBasicMaterial).opacity = baseOpacity * alpha * fadeIn;

			// Reset when expired or too far
			if (drift.life <= 0 || Math.abs(drift.mesh.position.x) > 18 || Math.abs(drift.mesh.position.z) > 18) {
				const angle = Math.random() * Math.PI * 2;
				const dist = 2 + Math.random() * 8;
				drift.mesh.position.set(
					Math.cos(angle) * dist - 8,
					0.02 + Math.random() * 0.08,
					Math.sin(angle) * dist,
				);
				drift.life = 2 + Math.random() * 4;
				drift.maxLife = drift.life;
				drift.vel.set(0.3 + Math.random() * 0.5, 0, (Math.random() - 0.5) * 0.2);
			}
		}
	}

	private buildRocks(parent: Group): void {
		const rockPositions = [
			{ x: -7, z: -2, scale: 0.7 },
			{ x: 8, z: 3, scale: 0.5 },
			{ x: -3, z: 8, scale: 0.6 },
			{ x: 4, z: -9, scale: 0.8 },
			{ x: -10, z: 4, scale: 0.55 },
			{ x: 11, z: -5, scale: 0.65 },
			{ x: 0, z: -8, scale: 0.45 },
			{ x: -8, z: -6, scale: 0.5 },
		];

		const rockMat = new MeshStandardMaterial({
			color: 0x556666,
			roughness: 0.95,
			metalness: 0.05,
		});
		const snowCapMat = new MeshStandardMaterial({
			color: 0xffffff,
			roughness: 0.9,
			metalness: 0.0,
		});

		for (const pos of rockPositions) {
			const rock = new Group();
			rock.position.set(pos.x, 0, pos.z);
			rock.rotation.y = Math.random() * Math.PI * 2;

			// Main rock body (squished sphere)
			const bodyGeo = new SphereGeometry(0.5 * pos.scale, 7, 5);
			const body = new Mesh(bodyGeo, rockMat.clone());
			body.scale.set(1.2, 0.6, 1.0);
			body.position.y = 0.2 * pos.scale;
			rock.add(body);

			// Secondary bump
			const bumpGeo = new SphereGeometry(0.3 * pos.scale, 6, 4);
			const bump = new Mesh(bumpGeo, rockMat.clone());
			bump.scale.set(0.9, 0.5, 0.8);
			bump.position.set(0.15 * pos.scale, 0.25 * pos.scale, 0.1 * pos.scale);
			rock.add(bump);

			// Snow cap on top
			const capGeo = new SphereGeometry(0.35 * pos.scale, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
			const cap = new Mesh(capGeo, snowCapMat.clone());
			cap.scale.set(1.3, 0.25, 1.1);
			cap.position.y = 0.32 * pos.scale;
			rock.add(cap);

			parent.add(rock);
		}
	}

	private buildCampfires(parent: Group): void {
		// Place campfires near forts
		const firePositions = [
			{ x: -5.8, z: -3.2 },
			{ x: 5.8, z: -4.2 },
			{ x: -4.8, z: 4.8 },
			{ x: 6.8, z: 3.8 },
		];

		for (const pos of firePositions) {
			const campfire = new Group();
			campfire.position.set(pos.x, 0, pos.z);

			// Log ring (small cylinders arranged in circle)
			const logMat = new MeshStandardMaterial({
				color: 0x3a2211,
				roughness: 0.9,
			});
			for (let i = 0; i < 5; i++) {
				const angle = (i / 5) * Math.PI * 2;
				const logGeo = new CylinderGeometry(0.04, 0.05, 0.35, 5);
				const log = new Mesh(logGeo, logMat.clone());
				log.position.set(
					Math.cos(angle) * 0.15,
					0.05,
					Math.sin(angle) * 0.15,
				);
				log.rotation.z = Math.PI / 2;
				log.rotation.y = angle;
				campfire.add(log);
			}

			// Fire glow light
			const fireLight = new PointLight(0xff6622, 1.2, 5);
			fireLight.position.set(0, 0.3, 0);
			campfire.add(fireLight);

			// Flame meshes (animated cones)
			const flames: Mesh[] = [];
			const flameColors = [0xff4400, 0xff6600, 0xffaa00];
			for (let f = 0; f < 3; f++) {
				const fGeo = new ConeGeometry(0.06 + f * 0.02, 0.2 + f * 0.05, 5);
				const fMat = new MeshBasicMaterial({
					color: flameColors[f],
					transparent: true,
					opacity: 0.85 - f * 0.15,
				});
				const flame = new Mesh(fGeo, fMat);
				flame.position.set(
					(Math.random() - 0.5) * 0.08,
					0.15 + f * 0.06,
					(Math.random() - 0.5) * 0.08,
				);
				campfire.add(flame);
				flames.push(flame);
			}

			// Ember particle ring on ground
			const emberGeo = new CircleGeometry(0.25, 12);
			const emberMat = new MeshBasicMaterial({
				color: 0xff2200,
				transparent: true,
				opacity: 0.2,
			});
			const ember = new Mesh(emberGeo, emberMat);
			ember.rotation.x = -Math.PI / 2;
			ember.position.y = 0.01;
			campfire.add(ember);

			parent.add(campfire);
			this.campfires.push({
				light: fireLight,
				flames,
				baseY: 0.3,
			});
		}
	}

	private updateCampfires(): void {
		for (let i = 0; i < this.campfires.length; i++) {
			const cf = this.campfires[i];
			// Flickering light intensity
			const flicker = 0.8 + Math.sin(this.time * 8 + i * 3.7) * 0.3
				+ Math.sin(this.time * 13 + i * 1.1) * 0.15;
			cf.light.intensity = flicker;
			cf.light.position.y = cf.baseY + Math.sin(this.time * 5 + i) * 0.03;

			// Animate flame meshes
			for (let f = 0; f < cf.flames.length; f++) {
				const flame = cf.flames[f];
				const phase = this.time * 6 + i * 2.5 + f * 1.8;
				flame.scale.y = 0.8 + Math.sin(phase) * 0.3;
				flame.scale.x = 0.9 + Math.sin(phase * 1.3) * 0.15;
				flame.position.x = Math.sin(phase * 0.7) * 0.03;
				flame.position.z = Math.cos(phase * 0.9) * 0.03;
				flame.position.y = 0.15 + f * 0.06 + Math.sin(phase) * 0.02;
			}
		}
	}

	private checkFortDamage(x: number, z: number): void {
		for (const fort of forts) {
			if (fort.isDestroyed) continue;
			const dx = x - fort.position.x;
			const dz = z - fort.position.z;
			const dist = Math.sqrt(dx * dx + dz * dz);
			if (dist < FORT_DAMAGE_RADIUS) {
				fort.health--;
				// Spawn debris particles
				window.dispatchEvent(new CustomEvent('fort-hit', {
					detail: { x: fort.position.x, z: fort.position.z },
				}));
				if (fort.health <= 0) {
					fort.isDestroyed = true;
					fort.health = 0;
					window.dispatchEvent(new CustomEvent('fort-destroyed', {
						detail: { x: fort.position.x, z: fort.position.z },
					}));
				}
				break; // Only damage one fort per impact
			}
		}
	}

	private startFortRebuild(): void {
		for (const fort of forts) {
			if (fort.health < fort.maxHealth) {
				// Restore 2 HP per wave break (partial rebuild)
				const healAmount = 2;
				fort.health = Math.min(fort.maxHealth, fort.health + healAmount);
				if (fort.health > 0) {
					fort.isDestroyed = false;
				}
				fort.rebuildProgress = 0; // Start rebuild animation
			}
		}
	}

	private updateFortVisuals(delta: number): void {
		for (const fort of forts) {
			const healthPct = fort.health / fort.maxHealth;
			const targetScale = fort.isDestroyed ? 0.05 : 0.3 + healthPct * 0.7;

			for (let w = 0; w < fort.walls.length; w++) {
				const wall = fort.walls[w];
				const origScale = fort.originalScales[w];

				// Smoothly animate toward target scale
				const currentY = wall.scale.y;
				const target = targetScale * origScale.y;
				wall.scale.y += (target - currentY) * delta * 3;

				// Darken material as health drops
				const mat = wall.material;
				if (mat instanceof MeshStandardMaterial) {
					const darken = 0.4 + healthPct * 0.6;
					mat.color.setRGB(
						(SNOW_WHITE >> 16 & 0xFF) / 255 * darken,
						(SNOW_WHITE >> 8 & 0xFF) / 255 * darken,
						(SNOW_WHITE & 0xFF) / 255 * darken,
					);
					// Add red tint when heavily damaged
					if (healthPct < 0.4) {
						mat.emissive.setHex(0x441111);
						mat.emissiveIntensity = (1 - healthPct) * 0.3;
					} else {
						mat.emissive.setHex(0x112233);
						mat.emissiveIntensity = 0.1;
					}
				} else if (mat instanceof MeshBasicMaterial) {
					// Neon trim fades with damage
					mat.opacity = 0.2 + healthPct * 0.7;
				}
			}

			// Dim/brighten glow light based on fort health
			if (fort.glowLight && fort.glowLight instanceof PointLight) {
				fort.glowLight.intensity = fort.isDestroyed ? 0 : 0.3 * (0.3 + healthPct * 0.7);
			}
		}
	}

	private updateWeatherLighting(weather: WeatherType, isStorm: boolean, delta: number): void {

		// Update fort visual state (damage/rebuild animations)
		this.updateFortVisuals(delta);

		if (!this.ambientLight || !this.moonLight) return;

		// Day/night cycle influence on base lighting
		const dayPhase = gameState.dayNightPhase; // 0=night, 1=day

		let targetAmbient: number, targetMoon: number;
		if (isStorm) {
			targetAmbient = 0.15 + dayPhase * 0.1;
			targetMoon = 0.2 + dayPhase * 0.1;
		} else {
			switch (weather) {
				case WeatherType.BLIZZARD:
					targetAmbient = 0.18 + dayPhase * 0.12; targetMoon = 0.25 + dayPhase * 0.12;
					break;
				case WeatherType.HEAVY_SNOW:
					targetAmbient = 0.25 + dayPhase * 0.12; targetMoon = 0.35 + dayPhase * 0.15;
					break;
				case WeatherType.LIGHT_SNOW:
					targetAmbient = 0.3 + dayPhase * 0.15; targetMoon = 0.45 + dayPhase * 0.15;
					break;
				default:
					targetAmbient = 0.3 + dayPhase * 0.2; targetMoon = 0.5 + dayPhase * 0.2;
					break;
			}
		}

		this.ambientLight.intensity += (targetAmbient - this.ambientLight.intensity) * delta * 1.5;
		this.moonLight.intensity += (targetMoon - this.moonLight.intensity) * delta * 1.5;

		// Moon color shifts with day/night: bluish at night, warmer at dawn/dusk
		if (this.bossSpawnLightTimer <= 0) {
			const moonR = 0.53 + dayPhase * 0.2;
			const moonG = 0.6 + dayPhase * 0.15;
			const moonB = 0.8 - dayPhase * 0.1;
			this.moonLight.color.setRGB(moonR, moonG, moonB);
		}
	}
}
