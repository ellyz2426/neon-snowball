/**
 * AudioSystem — procedural sound effects using Web Audio API.
 */
import { createSystem } from '@iwsdk/core';
import { gameState, GameState, WeatherType } from './game-state.js';

export class AudioSystem extends createSystem({}) {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private ambientNode: OscillatorNode | null = null;
	private ambientGain: GainNode | null = null;
	private ambientFilter: BiquadFilterNode | null = null;
	private initialized = false;

	init(): void {
		// Events
		window.addEventListener('snowball-throw', (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.spread) {
				this.playSpreadShot();
			} else if (detail?.element === 'ice') {
				this.playIceThrow();
			} else if (detail?.element === 'fire') {
				this.playFireThrow();
			} else {
				this.playThrow(detail?.isGiant);
			}
		});
		window.addEventListener('snowball-impact', (e: Event) => {
			const detail = (e as CustomEvent).detail;
			this.playImpact(detail?.isGiant);
		});
		window.addEventListener('enemy-hit', (e: Event) => {
			const detail = (e as CustomEvent).detail;
			this.playEnemyHit(detail?.killed);
		});
		window.addEventListener('enemy-throw', () => this.playEnemyThrow());
		window.addEventListener('player-hit', () => this.playPlayerHit());
		window.addEventListener('shield-block', () => this.playShieldBlock());
		window.addEventListener('powerup-collected', () => this.playPowerUp());
		window.addEventListener('wave-start', () => this.playWaveStart());
		window.addEventListener('wave-complete', () => this.playWaveComplete());
		window.addEventListener('game-over', () => this.playGameOver());
		window.addEventListener('icicle-drop', () => this.playIcicleDrop());
		window.addEventListener('ice-hit', () => this.playIceHit());
		window.addEventListener('fire-aoe', () => this.playFireAoE());
		window.addEventListener('yeti-boulder', () => this.playYetiBoulder());
		window.addEventListener('ice-patch-create', () => this.playIcePatchCreate());
		window.addEventListener('weather-change', (e: Event) => {
			this.playWeatherChange((e as CustomEvent).detail?.weather);
		});
		window.addEventListener('blizzard-blast', () => this.playBlizzardBlast());

		// Init audio on first interaction
		const initAudio = () => {
			if (this.initialized) return;
			this.initAudioContext();
			window.removeEventListener('click', initAudio);
			window.removeEventListener('touchstart', initAudio);
			window.removeEventListener('keydown', initAudio);
		};
		window.addEventListener('click', initAudio);
		window.addEventListener('touchstart', initAudio);
		window.addEventListener('keydown', initAudio);
	}

	private initAudioContext(): void {
		try {
			this.ctx = new AudioContext();
			this.masterGain = this.ctx.createGain();
			this.masterGain.gain.value = 0.3;
			this.masterGain.connect(this.ctx.destination);
			this.initialized = true;
			this.startAmbient();
		} catch {}
	}

	private startAmbient(): void {
		if (!this.ctx || !this.masterGain) return;

		// Quiet wind-like ambient
		this.ambientGain = this.ctx.createGain();
		this.ambientGain.gain.value = 0.03;
		this.ambientGain.connect(this.masterGain);

		// Use buffer noise for wind
		const bufferSize = this.ctx.sampleRate * 2;
		const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = (Math.random() * 2 - 1) * 0.5;
		}

		const noise = this.ctx.createBufferSource();
		noise.buffer = buffer;
		noise.loop = true;

		this.ambientFilter = this.ctx.createBiquadFilter();
		this.ambientFilter.type = 'lowpass';
		this.ambientFilter.frequency.value = 300;

		noise.connect(this.ambientFilter);
		this.ambientFilter.connect(this.ambientGain);
		noise.start();
	}

	private playNote(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.15): void {
		if (!this.ctx || !this.masterGain) return;
		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, t);
		gain.gain.setValueAtTime(vol, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
		osc.connect(gain);
		gain.connect(this.masterGain);
		osc.start(t);
		osc.stop(t + duration);
	}

	private playNoise(duration: number, freq: number, vol = 0.1): void {
		if (!this.ctx || !this.masterGain) return;
		const t = this.ctx.currentTime;
		const bufferSize = Math.floor(this.ctx.sampleRate * duration);
		const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = (Math.random() * 2 - 1);
		}
		const src = this.ctx.createBufferSource();
		src.buffer = buffer;
		const filter = this.ctx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = freq;
		filter.Q.value = 1;
		const gain = this.ctx.createGain();
		gain.gain.setValueAtTime(vol, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(this.masterGain!);
		src.start(t);
	}

	private playThrow(isGiant: boolean): void {
		// Whoosh sound
		this.playNoise(0.25, isGiant ? 600 : 1200, 0.12);
		this.playNote(isGiant ? 200 : 400, 0.15, 'sine', 0.08);
	}

	private playIceThrow(): void {
		// Crystalline whoosh with icy sparkle
		this.playNoise(0.25, 2000, 0.1);
		this.playNote(800, 0.15, 'sine', 0.1);
		this.playNote(1200, 0.1, 'sine', 0.06);
	}

	private playFireThrow(): void {
		// Fiery crackle whoosh
		this.playNoise(0.3, 500, 0.14);
		this.playNote(250, 0.2, 'sawtooth', 0.08);
		this.playNote(180, 0.15, 'sine', 0.06);
	}

	private playSpreadShot(): void {
		// Triple whoosh with rising pitch
		this.playNoise(0.3, 800, 0.15);
		this.playNote(300, 0.15, 'sine', 0.1);
		setTimeout(() => this.playNote(400, 0.1, 'sine', 0.08), 50);
		setTimeout(() => this.playNote(500, 0.1, 'sine', 0.08), 100);
	}

	private playImpact(isGiant: boolean): void {
		// Soft thud + crunch
		this.playNoise(0.3, isGiant ? 400 : 800, 0.15);
		this.playNote(isGiant ? 80 : 120, 0.2, 'sine', 0.1);
	}

	private playEnemyHit(killed: boolean): void {
		if (killed) {
			// Satisfying poof
			this.playNote(880, 0.1, 'sine', 0.12);
			this.playNote(1100, 0.15, 'sine', 0.1);
			this.playNoise(0.2, 2000, 0.08);
		} else {
			// Hit thunk
			this.playNote(330, 0.1, 'triangle', 0.1);
			this.playNoise(0.15, 1500, 0.06);
		}
	}

	private playEnemyThrow(): void {
		this.playNoise(0.15, 600, 0.04);
	}

	private playPlayerHit(): void {
		// Pain/damage sound
		this.playNote(200, 0.3, 'sawtooth', 0.15);
		this.playNote(150, 0.4, 'sine', 0.1);
	}

	private playShieldBlock(): void {
		// Metallic ping
		this.playNote(1200, 0.15, 'sine', 0.12);
		this.playNote(1800, 0.1, 'sine', 0.08);
	}

	private playPowerUp(): void {
		// Rising chime
		this.playNote(440, 0.1, 'sine', 0.1);
		setTimeout(() => this.playNote(660, 0.1, 'sine', 0.1), 80);
		setTimeout(() => this.playNote(880, 0.15, 'sine', 0.12), 160);
	}

	private playWaveStart(): void {
		// Alert fanfare
		this.playNote(440, 0.15, 'square', 0.08);
		setTimeout(() => this.playNote(550, 0.15, 'square', 0.08), 120);
		setTimeout(() => this.playNote(660, 0.2, 'square', 0.1), 240);
	}

	private playWaveComplete(): void {
		// Victory jingle
		this.playNote(523, 0.15, 'sine', 0.12);
		setTimeout(() => this.playNote(659, 0.15, 'sine', 0.12), 100);
		setTimeout(() => this.playNote(784, 0.15, 'sine', 0.12), 200);
		setTimeout(() => this.playNote(1047, 0.3, 'sine', 0.15), 300);
	}

	private playGameOver(): void {
		// Descending tones
		this.playNote(440, 0.3, 'sawtooth', 0.1);
		setTimeout(() => this.playNote(330, 0.3, 'sawtooth', 0.1), 250);
		setTimeout(() => this.playNote(220, 0.5, 'sawtooth', 0.12), 500);
	}

	private playIcicleDrop(): void {
		// Crystal shatter / tinkling ice sound
		this.playNote(2400, 0.08, 'sine', 0.06);
		setTimeout(() => this.playNote(1800, 0.1, 'sine', 0.05), 50);
		setTimeout(() => this.playNote(3200, 0.06, 'sine', 0.04), 100);
	}

	private playIceHit(): void {
		// Crystalline freeze sound
		this.playNote(1600, 0.15, 'sine', 0.1);
		this.playNote(2200, 0.1, 'sine', 0.08);
		this.playNoise(0.15, 3000, 0.05);
	}

	private playFireAoE(): void {
		// Explosive fire whoosh
		this.playNoise(0.4, 400, 0.18);
		this.playNote(150, 0.3, 'sawtooth', 0.1);
		setTimeout(() => this.playNote(100, 0.2, 'sine', 0.08), 100);
	}

	private playYetiBoulder(): void {
		// Deep rumbling throw
		this.playNote(80, 0.4, 'sawtooth', 0.12);
		this.playNoise(0.3, 200, 0.1);
		setTimeout(() => this.playNote(60, 0.3, 'sine', 0.08), 150);
	}

	private playIcePatchCreate(): void {
		// Ice cracking/spreading
		this.playNoise(0.2, 4000, 0.06);
		this.playNote(1400, 0.12, 'sine', 0.05);
		setTimeout(() => this.playNote(2000, 0.08, 'sine', 0.04), 80);
	}

	private playWeatherChange(_weather: string): void {
		// Atmospheric woosh transition
		this.playNoise(0.8, 250, 0.08);
		this.playNote(200, 0.5, 'sine', 0.06);
		setTimeout(() => this.playNote(300, 0.4, 'sine', 0.05), 200);
	}

	private playBlizzardBlast(): void {
		if (!this.ctx || !this.masterGain) return;
		// Epic whooshing blizzard — layered noise burst
		this.playNoise(1.0, 300, 0.25);
		this.playNoise(0.8, 600, 0.15);
		this.playNote(150, 0.6, 'sawtooth', 0.12);
		setTimeout(() => {
			this.playNoise(0.5, 400, 0.12);
			this.playNote(200, 0.4, 'sine', 0.08);
		}, 200);
		setTimeout(() => {
			this.playNote(250, 0.3, 'sine', 0.06);
			this.playNoise(0.3, 500, 0.08);
		}, 500);
	}

	update(): void {
		// Audio context resume if needed
		if (this.ctx && this.ctx.state === 'suspended') {
			this.ctx.resume();
		}

		// Weather-responsive ambient wind
		if (this.ambientGain && this.ambientFilter && this.ctx) {
			let targetGain: number;
			let targetFreq: number;
			switch (gameState.weather) {
				case WeatherType.BLIZZARD:
					targetGain = 0.12;
					targetFreq = 500;
					break;
				case WeatherType.HEAVY_SNOW:
					targetGain = 0.07;
					targetFreq = 400;
					break;
				case WeatherType.LIGHT_SNOW:
					targetGain = 0.04;
					targetFreq = 350;
					break;
				default:
					targetGain = 0.03;
					targetFreq = 300;
					break;
			}
			// Smooth transition
			const t = this.ctx.currentTime;
			this.ambientGain.gain.linearRampToValueAtTime(targetGain, t + 0.5);
			this.ambientFilter.frequency.linearRampToValueAtTime(targetFreq, t + 0.5);
		}
	}
}
