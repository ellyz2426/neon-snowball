/**
 * Shared game state — module-level singleton.
 * Every system imports and reads/writes this object.
 */
import {
	Vector3,
	Color,
	Object3D,
	Group,
	Mesh,
	SphereGeometry,
} from '@iwsdk/core';

// ── Game states ─────────────────────────────────────────────────
export enum GameState {
	MENU = 'MENU',
	TUTORIAL = 'TUTORIAL',
	PLAYING = 'PLAYING',
	WAVE_COMPLETE = 'WAVE_COMPLETE',
	PAUSED = 'PAUSED',
	GAME_OVER = 'GAME_OVER',
}

// ── Difficulty ──────────────────────────────────────────────────
export enum Difficulty {
	EASY = 'EASY',
	NORMAL = 'NORMAL',
	HARD = 'HARD',
}

// ── Enemy types ─────────────────────────────────────────────────
export enum EnemyType {
	BASIC = 'BASIC',
	SPEEDY = 'SPEEDY',
	TANK = 'TANK',
	BOMBER = 'BOMBER',
	BOSS = 'BOSS',
}

// ── Power-up types ──────────────────────────────────────────────
export enum PowerUpType {
	GIANT = 'GIANT',
	RAPID = 'RAPID',
	SHIELD = 'SHIELD',
	FREEZE = 'FREEZE',
}

// ── Snowball data ───────────────────────────────────────────────
export interface SnowballData {
	mesh: Mesh;
	velocity: Vector3;
	damage: number;
	lifetime: number;
	isPlayerOwned: boolean;
	isGiant: boolean;
}

// ── Enemy data ──────────────────────────────────────────────────
export interface EnemyData {
	group: Group;
	type: EnemyType;
	health: number;
	maxHealth: number;
	throwCooldown: number;
	throwTimer: number;
	speed: number;
	targetPos: Vector3;
	isDying: boolean;
	deathTimer: number;
	hitFlashTimer: number;
	throwCount: number;
	isCharging: boolean;
	chargeTimer: number;
}

// ── Power-up data ───────────────────────────────────────────────
export interface PowerUpData {
	mesh: Mesh;
	type: PowerUpType;
	lifetime: number;
	bobPhase: number;
}

// ── Active power-up ─────────────────────────────────────────────
export interface ActivePowerUp {
	type: PowerUpType;
	remaining: number;
}

// ── Particle data ───────────────────────────────────────────────
export interface ParticleData {
	mesh: Mesh;
	velocity: Vector3;
	lifetime: number;
	maxLifetime: number;
}

// ── Damage zone data ────────────────────────────────────────────
export interface DamageZoneData {
	mesh: Mesh;
	lifetime: number;
	playerInZoneTime: number;
}

// ── Game config per difficulty ───────────────────────────────────
export interface DifficultyConfig {
	playerMaxHealth: number;
	enemyDamageMult: number;
	enemySpeedMult: number;
	enemyThrowRateMult: number;
	scoreMultiplier: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
	[Difficulty.EASY]: {
		playerMaxHealth: 150,
		enemyDamageMult: 0.7,
		enemySpeedMult: 0.7,
		enemyThrowRateMult: 0.6,
		scoreMultiplier: 0.8,
	},
	[Difficulty.NORMAL]: {
		playerMaxHealth: 100,
		enemyDamageMult: 1.0,
		enemySpeedMult: 1.0,
		enemyThrowRateMult: 1.0,
		scoreMultiplier: 1.0,
	},
	[Difficulty.HARD]: {
		playerMaxHealth: 75,
		enemyDamageMult: 1.4,
		enemySpeedMult: 1.3,
		enemyThrowRateMult: 1.5,
		scoreMultiplier: 1.5,
	},
};

// ── Enemy type configs ──────────────────────────────────────────
export interface EnemyTypeConfig {
	health: number;
	speed: number;
	throwCooldown: number;
	damage: number;
	points: number;
	scale: number;
	bodyColor: number;
	hatColor: number;
}

export const ENEMY_CONFIGS: Record<EnemyType, EnemyTypeConfig> = {
	[EnemyType.BASIC]: {
		health: 1,
		speed: 1.2,
		throwCooldown: 3.0,
		damage: 10,
		points: 100,
		scale: 1.0,
		bodyColor: 0xf0f0f0,
		hatColor: 0x333333,
	},
	[EnemyType.SPEEDY]: {
		health: 1,
		speed: 2.5,
		throwCooldown: 2.0,
		damage: 8,
		points: 150,
		scale: 0.8,
		bodyColor: 0xd0e8ff,
		hatColor: 0x4488ff,
	},
	[EnemyType.TANK]: {
		health: 3,
		speed: 0.7,
		throwCooldown: 4.0,
		damage: 15,
		points: 250,
		scale: 1.4,
		bodyColor: 0xe8e0d0,
		hatColor: 0x884422,
	},
	[EnemyType.BOMBER]: {
		health: 2,
		speed: 1.0,
		throwCooldown: 5.0,
		damage: 25,
		points: 300,
		scale: 1.1,
		bodyColor: 0xffe0e0,
		hatColor: 0xff3333,
	},
	[EnemyType.BOSS]: {
		health: 10,
		speed: 0.5,
		throwCooldown: 2.0,
		damage: 20,
		points: 1000,
		scale: 2.0,
		bodyColor: 0xd0d0ff,
		hatColor: 0x6600cc,
	},
};

// ── Arena dimensions ────────────────────────────────────────────
export const ARENA_RADIUS = 15;
export const ARENA_HALF = ARENA_RADIUS;
export const SPAWN_DISTANCE = 12;

// ── Colors ──────────────────────────────────────────────────────
export const NEON_CYAN = 0x00ffff;
export const NEON_BLUE = 0x4488ff;
export const NEON_PURPLE = 0x8844ff;
export const NEON_PINK = 0xff44aa;
export const NEON_GREEN = 0x44ff88;
export const WARM_YELLOW = 0xffdd88;
export const SNOW_WHITE = 0xeef4ff;
export const ICE_BLUE = 0x88ccff;

// ── Shared mutable state ────────────────────────────────────────
export const gameState = {
	state: GameState.MENU,
	difficulty: Difficulty.NORMAL,
	score: 0,
	highScore: 0,
	combo: 0,
	maxCombo: 0,
	comboTimer: 0,
	health: 100,
	maxHealth: 100,
	wave: 0,
	enemiesRemaining: 0,
	enemiesKilled: 0,
	totalEnemiesKilled: 0,
	waveEnemiesTotal: 0,
	waveStartTime: 0,
	throwCooldown: 0,
	rapidFireActive: false,
	shieldActive: false,
	freezeActive: false,
	giantSnowballActive: false,
	lastThrowTime: 0,
	totalThrows: 0,
	totalHits: 0,
	playStartTime: 0,
};

// ── Shared object pools ─────────────────────────────────────────
export const snowballs: SnowballData[] = [];
export const enemies: EnemyData[] = [];
export const powerUps: PowerUpData[] = [];
export const activePowerUps: ActivePowerUp[] = [];
export const particles: ParticleData[] = [];
export const damageZones: DamageZoneData[] = [];

// ── System references ───────────────────────────────────────────
export const systemRefs: {
	scene: Object3D | null;
	arenaGroup: Group | null;
	snowballGroup: Group | null;
	enemyGroup: Group | null;
	particleGroup: Group | null;
	powerUpGroup: Group | null;
	damageZoneGroup: Group | null;
} = {
	scene: null,
	arenaGroup: null,
	snowballGroup: null,
	enemyGroup: null,
	particleGroup: null,
	powerUpGroup: null,
	damageZoneGroup: null,
};

// ── Helpers ─────────────────────────────────────────────────────
export function resetGameState(): void {
	const config = DIFFICULTY_CONFIGS[gameState.difficulty];
	gameState.score = 0;
	gameState.combo = 0;
	gameState.maxCombo = 0;
	gameState.comboTimer = 0;
	gameState.health = config.playerMaxHealth;
	gameState.maxHealth = config.playerMaxHealth;
	gameState.wave = 0;
	gameState.enemiesRemaining = 0;
	gameState.enemiesKilled = 0;
	gameState.totalEnemiesKilled = 0;
	gameState.waveEnemiesTotal = 0;
	gameState.throwCooldown = 0;
	gameState.rapidFireActive = false;
	gameState.shieldActive = false;
	gameState.freezeActive = false;
	gameState.giantSnowballActive = false;
	gameState.totalThrows = 0;
	gameState.totalHits = 0;
	gameState.playStartTime = Date.now();
}

export function getWaveEnemyCount(wave: number): number {
	return Math.min(3 + Math.floor(wave * 1.5), 20);
}

export function isBossWave(wave: number): boolean {
	return wave > 0 && wave % 5 === 0;
}

// Pre-built geometries (reuse)
export const snowballGeo = new SphereGeometry(0.12, 12, 8);
export const giantSnowballGeo = new SphereGeometry(0.3, 14, 10);
export const particleGeo = new SphereGeometry(0.03, 6, 4);
