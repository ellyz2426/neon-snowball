/**
 * UISystem — manages all UIKitMLAsset panels.
 */
import {
	createSystem,
	UIKitMLAsset,
	VisibilityState,
} from '@iwsdk/core';
import {
	gameState,
	GameState,
	Difficulty,
	activePowerUps,
	PowerUpType,
	WeatherType,
} from './game-state.js';
import { GameSystem } from './game-system.js';

// Module-level reference so other systems can trigger UI updates
let uiSystemInstance: UISystem | null = null;

export function getUISystem(): UISystem | null {
	return uiSystemInstance;
}

export class UISystem extends createSystem({}) {
	// Panels
	private menuPanel: UIKitMLAsset | null = null;
	private hudPanel: UIKitMLAsset | null = null;
	private pausePanel: UIKitMLAsset | null = null;
	private resultsPanel: UIKitMLAsset | null = null;
	private settingsPanel: UIKitMLAsset | null = null;
	private tutorialPanel: UIKitMLAsset | null = null;

	// Game system reference
	private gameSystem: GameSystem | null = null;

	private lastState: GameState = GameState.MENU;
	private updateTimer = 0;
	private waveAnnounceTimer = 0;
	private uiCleanup: (() => void)[] = [];

	init(): void {
		uiSystemInstance = this;

		// Get panels
		this.menuPanel = this.world.getSceneObject<UIKitMLAsset>('menu-panel') ?? null;
		this.hudPanel = this.world.getSceneObject<UIKitMLAsset>('hud-panel') ?? null;
		this.pausePanel = this.world.getSceneObject<UIKitMLAsset>('pause-panel') ?? null;
		this.resultsPanel = this.world.getSceneObject<UIKitMLAsset>('results-panel') ?? null;
		this.settingsPanel = this.world.getSceneObject<UIKitMLAsset>('settings-panel') ?? null;
		this.tutorialPanel = this.world.getSceneObject<UIKitMLAsset>('tutorial-panel') ?? null;

		// Get game system
		this.gameSystem = this.world.getSystem(GameSystem) as GameSystem | null;

		// Wire menu buttons
		this.wireMenuPanel();
		this.wirePausePanel();
		this.wireResultsPanel();
		this.wireSettingsPanel();
		this.wireTutorialPanel();

		// XR button
		this.wireXRButton();

		// Show menu initially
		this.showPanel('menu');

		// Listen for events
		window.addEventListener('game-over', () => {
			this.gameSystem?.saveHighScore();
			this.showPanel('results');
			this.updateResultsPanel(true);
		});

		window.addEventListener('wave-complete', () => {
			this.showPanel('results');
			this.updateResultsPanel(false);
		});

		window.addEventListener('wave-start', () => {
			this.showPanel('hud');
			// Show wave announcement
			this.waveAnnounceTimer = 2.0;
			const announceEl = this.hudPanel?.getElementById('wave-announce');
			if (announceEl) {
				announceEl.setProperties({
					text: `WAVE ${gameState.wave}`,
					display: 'flex',
				});
			}
		});

		// Keyboard pause
		window.addEventListener('keydown', (e: Event) => {
			const ke = e as KeyboardEvent;
			if (ke.key === 'Escape' || ke.key === 'p' || ke.key === 'P') {
				this.togglePause();
			}
		});
	}

	update(delta: number): void {
		this.updateTimer += delta;

		// Wave announcement timer
		if (this.waveAnnounceTimer > 0) {
			this.waveAnnounceTimer -= delta;
			if (this.waveAnnounceTimer <= 0) {
				const announceEl = this.hudPanel?.getElementById('wave-announce');
				if (announceEl) {
					announceEl.setProperties({ display: 'none' });
				}
			}
		}

		// Update HUD every 100ms
		if (this.updateTimer >= 0.1 && gameState.state === GameState.PLAYING) {
			this.updateTimer = 0;
			this.updateHUD();
		}
	}

	private showPanel(panel: 'menu' | 'hud' | 'pause' | 'results' | 'settings' | 'tutorial'): void {
		if (this.menuPanel) this.menuPanel.visible = panel === 'menu';
		if (this.hudPanel) this.hudPanel.visible = panel === 'hud';
		if (this.pausePanel) this.pausePanel.visible = panel === 'pause';
		if (this.resultsPanel) this.resultsPanel.visible = panel === 'results';
		if (this.settingsPanel) this.settingsPanel.visible = panel === 'settings';
		if (this.tutorialPanel) this.tutorialPanel.visible = panel === 'tutorial';
	}

	private wireMenuPanel(): void {
		if (!this.menuPanel) return;

		const playBtn = this.menuPanel.getElementById('btn-play');
		const settingsBtn = this.menuPanel.getElementById('btn-settings');
		const tutorialBtn = this.menuPanel.getElementById('btn-tutorial');

		playBtn?.addEventListener('click', () => {
			this.gameSystem?.startNewGame();
			this.showPanel('hud');
		});

		settingsBtn?.addEventListener('click', () => {
			this.showPanel('settings');
		});

		tutorialBtn?.addEventListener('click', () => {
			this.showPanel('tutorial');
		});

		// Update high score on menu
		const hsEl = this.menuPanel.getElementById('high-score');
		if (hsEl) {
			hsEl.setProperties({ text: `HIGH SCORE: ${gameState.highScore}` });
		}
	}

	private wirePausePanel(): void {
		if (!this.pausePanel) return;

		const resumeBtn = this.pausePanel.getElementById('btn-resume');
		const restartBtn = this.pausePanel.getElementById('btn-restart');
		const quitBtn = this.pausePanel.getElementById('btn-quit');

		resumeBtn?.addEventListener('click', () => {
			gameState.state = GameState.PLAYING;
			this.showPanel('hud');
		});

		restartBtn?.addEventListener('click', () => {
			this.gameSystem?.restart();
			this.showPanel('hud');
		});

		quitBtn?.addEventListener('click', () => {
			this.gameSystem?.saveHighScore();
			this.gameSystem?.clearAll();
			gameState.state = GameState.MENU;
			this.showPanel('menu');
			this.updateMenuHighScore();
		});
	}

	private wireResultsPanel(): void {
		if (!this.resultsPanel) return;

		const continueBtn = this.resultsPanel.getElementById('btn-continue');
		const restartBtn = this.resultsPanel.getElementById('btn-restart');
		const menuBtn = this.resultsPanel.getElementById('btn-menu');

		continueBtn?.addEventListener('click', () => {
			if (gameState.state === GameState.GAME_OVER) {
				// Restart
				this.gameSystem?.restart();
			} else {
				// Continue to next wave
				gameState.state = GameState.PLAYING;
				this.gameSystem?.startNextWave();
			}
			this.showPanel('hud');
		});

		restartBtn?.addEventListener('click', () => {
			this.gameSystem?.restart();
			this.showPanel('hud');
		});

		menuBtn?.addEventListener('click', () => {
			this.gameSystem?.saveHighScore();
			this.gameSystem?.clearAll();
			gameState.state = GameState.MENU;
			this.showPanel('menu');
			this.updateMenuHighScore();
		});
	}

	private wireSettingsPanel(): void {
		if (!this.settingsPanel) return;

		const easyBtn = this.settingsPanel.getElementById('btn-easy');
		const normalBtn = this.settingsPanel.getElementById('btn-normal');
		const hardBtn = this.settingsPanel.getElementById('btn-hard');
		const backBtn = this.settingsPanel.getElementById('btn-back');

		easyBtn?.addEventListener('click', () => {
			gameState.difficulty = Difficulty.EASY;
			this.updateDifficultyDisplay();
		});

		normalBtn?.addEventListener('click', () => {
			gameState.difficulty = Difficulty.NORMAL;
			this.updateDifficultyDisplay();
		});

		hardBtn?.addEventListener('click', () => {
			gameState.difficulty = Difficulty.HARD;
			this.updateDifficultyDisplay();
		});

		backBtn?.addEventListener('click', () => {
			this.showPanel('menu');
		});
	}

	private wireTutorialPanel(): void {
		if (!this.tutorialPanel) return;

		const backBtn = this.tutorialPanel.getElementById('btn-back');
		backBtn?.addEventListener('click', () => {
			this.showPanel('menu');
		});
	}

	private wireXRButton(): void {
		if (!this.menuPanel || !this.world.xrEnabled) return;

		const xrBtn = this.menuPanel.getElementById('btn-xr');
		if (xrBtn) {
			xrBtn.addEventListener('click', () => this.world.launchXR());
		}

		// Hide/show based on VR state
		this.uiCleanup.push(
			this.world.visibilityState.subscribe((state) => {
				const is2D = state === VisibilityState.NonImmersive;
				if (xrBtn) {
					xrBtn.setProperties({ display: is2D ? 'flex' : 'none' });
				}
			}),
		);
	}

	private togglePause(): void {
		if (gameState.state === GameState.PLAYING) {
			gameState.state = GameState.PAUSED;
			this.showPanel('pause');
		} else if (gameState.state === GameState.PAUSED) {
			gameState.state = GameState.PLAYING;
			this.showPanel('hud');
		}
	}

	private updateHUD(): void {
		if (!this.hudPanel) return;

		const scoreEl = this.hudPanel.getElementById('score');
		const healthEl = this.hudPanel.getElementById('health');
		const healthBarEl = this.hudPanel.getElementById('health-bar');
		const waveEl = this.hudPanel.getElementById('wave');
		const comboEl = this.hudPanel.getElementById('combo');
		const enemiesEl = this.hudPanel.getElementById('enemies');
		const powerupEl = this.hudPanel.getElementById('powerup');

		if (scoreEl) scoreEl.setProperties({ text: `${gameState.score}` });
		if (waveEl) waveEl.setProperties({ text: `WAVE ${gameState.wave}` });
		if (enemiesEl) enemiesEl.setProperties({ text: `${gameState.enemiesRemaining} LEFT` });

		// Health
		const healthPct = Math.max(0, gameState.health / gameState.maxHealth);
		if (healthEl) {
			healthEl.setProperties({ text: `${Math.ceil(gameState.health)}` });
		}
		if (healthBarEl) {
			const barWidth = Math.floor(healthPct * 200);
			const barColor =
				healthPct > 0.5
					? 'rgba(68,255,136,0.8)'
					: healthPct > 0.25
						? 'rgba(255,221,68,0.8)'
						: 'rgba(255,68,68,0.8)';
			healthBarEl.setProperties({ width: barWidth, backgroundColor: barColor });
		}

		// Combo
		if (comboEl) {
			if (gameState.combo > 1) {
				comboEl.setProperties({
					text: `${gameState.combo}x COMBO`,
					display: 'flex',
				});
			} else {
				comboEl.setProperties({ display: 'none' });
			}
		}

		// Active power-up
		if (powerupEl) {
			if (activePowerUps.length > 0) {
				const ap = activePowerUps[0];
				const names: Record<PowerUpType, string> = {
					[PowerUpType.GIANT]: '🔴 GIANT',
					[PowerUpType.RAPID]: '⚡ RAPID',
					[PowerUpType.SHIELD]: '🛡️ SHIELD',
					[PowerUpType.FREEZE]: '❄️ FREEZE',
				};
				powerupEl.setProperties({
					text: `${names[ap.type]} ${ap.remaining.toFixed(1)}s`,
					display: 'flex',
				});
			} else {
				powerupEl.setProperties({ display: 'none' });
			}
		}

		// Charge bar
		const chargeSectionEl = this.hudPanel.getElementById('charge-section');
		const chargeBarEl = this.hudPanel.getElementById('charge-bar');
		if (chargeSectionEl && chargeBarEl) {
			if (gameState.isCharging) {
				const barWidth = Math.floor(gameState.chargeLevel * 200);
				const barColor = gameState.chargeLevel > 0.8
					? 'rgba(255,68,0,0.9)'
					: gameState.chargeLevel > 0.5
						? 'rgba(68,136,255,0.9)'
						: 'rgba(0,255,255,0.8)';
				chargeSectionEl.setProperties({ display: 'flex' });
				chargeBarEl.setProperties({ width: barWidth, backgroundColor: barColor });
			} else {
				chargeSectionEl.setProperties({ display: 'none' });
			}
		}

		// Weather indicator
		const weatherEl = this.hudPanel.getElementById('weather');
		if (weatherEl) {
			const weatherLabels: Record<WeatherType, string> = {
				[WeatherType.CLEAR]: '☀️ CLEAR',
				[WeatherType.LIGHT_SNOW]: '🌨️ LIGHT SNOW',
				[WeatherType.HEAVY_SNOW]: '❄️ HEAVY SNOW',
				[WeatherType.BLIZZARD]: '🌪️ BLIZZARD',
			};
			weatherEl.setProperties({
				text: weatherLabels[gameState.weather] || '☀️ CLEAR',
			});
		}
	}

	private updateResultsPanel(isGameOver: boolean): void {
		if (!this.resultsPanel) return;

		const titleEl = this.resultsPanel.getElementById('title');
		const scoreEl = this.resultsPanel.getElementById('score');
		const waveEl = this.resultsPanel.getElementById('wave');
		const comboEl = this.resultsPanel.getElementById('max-combo');
		const killsEl = this.resultsPanel.getElementById('kills');
		const continueBtn = this.resultsPanel.getElementById('btn-continue');

		if (titleEl) {
			titleEl.setProperties({
				text: isGameOver ? 'GAME OVER' : 'WAVE COMPLETE!',
			});
		}
		if (scoreEl) {
			scoreEl.setProperties({ text: `SCORE: ${gameState.score}` });
		}
		if (waveEl) {
			waveEl.setProperties({
				text: isGameOver
					? `REACHED WAVE ${gameState.wave}`
					: `WAVE ${gameState.wave} CLEARED`,
			});
		}
		if (comboEl) {
			comboEl.setProperties({ text: `MAX COMBO: ${gameState.maxCombo}x` });
		}
		if (killsEl) {
			killsEl.setProperties({
				text: `ENEMIES DEFEATED: ${gameState.totalEnemiesKilled}`,
			});
		}

		// Statistics
		const throwsEl = this.resultsPanel.getElementById('throws');
		const accuracyEl = this.resultsPanel.getElementById('accuracy');
		const timeEl = this.resultsPanel.getElementById('play-time');

		if (throwsEl) {
			throwsEl.setProperties({ text: `THROWS: ${gameState.totalThrows}` });
		}
		if (accuracyEl) {
			const accuracy =
				gameState.totalThrows > 0
					? Math.floor((gameState.totalHits / gameState.totalThrows) * 100)
					: 0;
			accuracyEl.setProperties({ text: `ACCURACY: ${accuracy}%` });
		}
		if (timeEl) {
			const elapsed = Math.floor((Date.now() - gameState.playStartTime) / 1000);
			const mins = Math.floor(elapsed / 60);
			const secs = elapsed % 60;
			timeEl.setProperties({
				text: `TIME: ${mins}:${secs.toString().padStart(2, '0')}`,
			});
		}

		if (continueBtn) {
			const el = this.resultsPanel.getElementById('btn-continue-text');
			if (el) {
				el.setProperties({
					text: isGameOver ? 'PLAY AGAIN' : 'NEXT WAVE',
				});
			}
		}
	}

	private updateDifficultyDisplay(): void {
		if (!this.settingsPanel) return;
		const current = this.settingsPanel.getElementById('current-difficulty');
		if (current) {
			current.setProperties({ text: `CURRENT: ${gameState.difficulty}` });
		}
	}

	private updateMenuHighScore(): void {
		if (!this.menuPanel) return;
		const hsEl = this.menuPanel.getElementById('high-score');
		if (hsEl) {
			hsEl.setProperties({ text: `HIGH SCORE: ${gameState.highScore}` });
		}
	}
}
