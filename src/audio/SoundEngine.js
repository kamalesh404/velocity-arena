/**
 * Velocity Arena - Procedural 3D Spatial Audio Engine (Zero-Asset Synthesis)
 * Generates all sound effects dynamically via native Web Audio API nodes.
 */

export class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.isMuted = false;
        this.masterVolume = 0.8;
        this.sfxVolume = 1.0;
        this.isInitialized = false;

        // Low-health heartbeat pulse state
        this.heartbeatOsc = null;
        this.heartbeatGain = null;
        this.heartbeatInterval = null;
        this.isHeartbeatActive = false;
    }

    init() {
        if (this.isInitialized) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn('Web Audio API not supported in this browser.');
            return;
        }

        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);

        this.masterGain.connect(this.ctx.destination);
        this.isInitialized = true;
    }

    resume() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setMasterVolume(val) {
        this.masterVolume = Math.max(0, Math.min(1, val));
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
        }
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxGain && this.ctx) {
            this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
        }
        return this.isMuted;
    }

    /**
     * Update audio listener position and orientation from camera
     */
    updateListener(camera) {
        if (!this.ctx || !camera) return;
        const listener = this.ctx.listener;
        const now = this.ctx.currentTime;

        const pos = camera.position;
        if (listener.positionX) {
            listener.positionX.setTargetAtTime(pos.x, now, 0.02);
            listener.positionY.setTargetAtTime(pos.y, now, 0.02);
            listener.positionZ.setTargetAtTime(pos.z, now, 0.02);
        } else {
            listener.setPosition(pos.x, pos.y, pos.z);
        }

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

        if (listener.forwardX) {
            listener.forwardX.setTargetAtTime(forward.x, now, 0.02);
            listener.forwardY.setTargetAtTime(forward.y, now, 0.02);
            listener.forwardZ.setTargetAtTime(forward.z, now, 0.02);
            listener.upX.setTargetAtTime(up.x, now, 0.02);
            listener.upY.setTargetAtTime(up.y, now, 0.02);
            listener.upZ.setTargetAtTime(up.z, now, 0.02);
        } else {
            listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
        }
    }

    createPanner(pos) {
        if (!this.ctx) return null;
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 2.5;
        panner.maxDistance = 120;
        panner.rolloffFactor = 1.2;
        panner.coneInnerAngle = 360;

        if (pos) {
            if (panner.positionX) {
                panner.positionX.setValueAtTime(pos.x, this.ctx.currentTime);
                panner.positionY.setValueAtTime(pos.y, this.ctx.currentTime);
                panner.positionZ.setValueAtTime(pos.z, this.ctx.currentTime);
            } else {
                panner.setPosition(pos.x, pos.y, pos.z);
            }
        }
        panner.connect(this.sfxGain);
        return panner;
    }

    /**
     * White noise buffer generator for shot transients and footsteps
     */
    createNoiseBuffer(duration = 0.5) {
        if (!this.ctx) return null;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // ========================================================
    // WEAPON SOUNDS
    // ========================================================

    /**
     * Precision Sniper Rifle Shot:
     * Dual oscillator punch (180Hz -> 40Hz) + high-resonance bandpass white noise burst + sub-bass body decay (650ms).
     */
    playSniperShot(pos = null) {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const outputNode = pos ? this.createPanner(pos) : this.sfxGain;

        // 1. Transient sub punch
        const osc1 = this.ctx.createOscillator();
        const oscGain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.exponentialRampToValueAtTime(32, now + 0.35);

        oscGain1.gain.setValueAtTime(1.0, now);
        oscGain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(oscGain1);
        oscGain1.connect(outputNode);
        osc1.start(now);
        osc1.stop(now + 0.45);

        // 2. High-resonance crack & laser burst (Bandpass White Noise)
        const noiseBuffer = this.createNoiseBuffer(0.65);
        if (noiseBuffer) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = noiseBuffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2400, now);
            filter.frequency.exponentialRampToValueAtTime(450, now + 0.5);
            filter.Q.value = 4.5;

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.9, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(outputNode);

            noise.start(now);
            noise.stop(now + 0.6);
        }

        // 3. Railgun electrical hum & tail decay
        const railOsc = this.ctx.createOscillator();
        const railGain = this.ctx.createGain();
        railOsc.type = 'sawtooth';
        railOsc.frequency.setValueAtTime(880, now);
        railOsc.frequency.exponentialRampToValueAtTime(110, now + 0.55);

        railGain.gain.setValueAtTime(0.4, now);
        railGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

        railOsc.connect(railGain);
        railGain.connect(outputNode);
        railOsc.start(now);
        railOsc.stop(now + 0.65);
    }

    /**
     * Assault Rifle Shot
     */
    playAssaultShot(pos = null) {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const outputNode = pos ? this.createPanner(pos) : this.sfxGain;

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

        oscGain.gain.setValueAtTime(0.45, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        osc.connect(oscGain);
        oscGain.connect(outputNode);
        osc.start(now);
        osc.stop(now + 0.12);

        // Snap crack
        const noiseBuf = this.createNoiseBuffer(0.08);
        if (noiseBuf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = noiseBuf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1400;
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.3, now);
            nGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(outputNode);
            noise.start(now);
            noise.stop(now + 0.08);
        }
    }

    /**
     * SMG Shot
     */
    playSmgShot(pos = null) {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const outputNode = pos ? this.createPanner(pos) : this.sfxGain;

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);

        oscGain.gain.setValueAtTime(0.35, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.connect(oscGain);
        oscGain.connect(outputNode);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    /**
     * Shotgun Blast
     */
    playShotgunShot(pos = null) {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const outputNode = pos ? this.createPanner(pos) : this.sfxGain;

        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + 0.3);

        oscGain.gain.setValueAtTime(0.7, now);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(oscGain);
        oscGain.connect(outputNode);
        osc.start(now);
        osc.stop(now + 0.3);

        // Heavy blast noise
        const noiseBuf = this.createNoiseBuffer(0.35);
        if (noiseBuf) {
            const noise = this.ctx.createBufferSource();
            noise.buffer = noiseBuf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1800, now);
            filter.frequency.exponentialRampToValueAtTime(200, now + 0.35);

            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.6, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(outputNode);
            noise.start(now);
            noise.stop(now + 0.35);
        }
    }

    // ========================================================
    // TACTICAL UI & FEEDBACK AUDIO
    // ========================================================

    /**
     * Crisp Hitmarker Tick (1800Hz -> 900Hz chirp, 30ms)
     */
    playHitmarker() {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.035);

        gain.gain.setValueAtTime(0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.035);
    }

    /**
     * High-Q Dual-Harmonic Metallic Headshot Bell Chime (3200Hz & 4800Hz)
     */
    playHeadshotDing() {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Primary bell harmonic
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(3200, now);
        osc1.frequency.linearRampToValueAtTime(3180, now + 0.4);

        gain1.gain.setValueAtTime(0.85, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(now);
        osc1.stop(now + 0.42);

        // Secondary metallic shimmer harmonic
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(4800, now);
        osc2.frequency.linearRampToValueAtTime(4750, now + 0.35);

        gain2.gain.setValueAtTime(0.55, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now);
        osc2.stop(now + 0.35);
    }

    /**
     * Sniper Bolt-Cycle Sound (mechanical cocking sound)
     */
    playBoltCycle() {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // Click 1: Bolt unlock
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(1400, now);
        osc1.frequency.exponentialRampToValueAtTime(400, now + 0.06);

        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(now);
        osc1.stop(now + 0.06);

        // Click 2: Bolt chamber pull (delayed 180ms)
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(800, now + 0.18);
        osc2.frequency.exponentialRampToValueAtTime(1600, now + 0.25);

        gain2.gain.setValueAtTime(0.0, now);
        gain2.gain.setValueAtTime(0.35, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.25);
    }

    /**
     * Positional Footsteps
     */
    playFootstep(pos = null, isLeftFoot = true) {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const outputNode = pos ? this.createPanner(pos) : this.sfxGain;

        const noiseBuf = this.createNoiseBuffer(0.06);
        if (!noiseBuf) return;

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuf;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = isLeftFoot ? 260 : 310;
        filter.Q.value = 2.0;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(outputNode);

        noise.start(now);
        noise.stop(now + 0.06);
    }

    /**
     * Bullet Whiz-By Doppler Audio
     */
    playBulletWhiz(pos = null) {
        this.resume();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const outputNode = pos ? this.createPanner(pos) : this.sfxGain;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2600, now);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.12);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(outputNode);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    /**
     * Low-Health Binaural Heartbeat Pulse (triggers when HP < 30)
     */
    setLowHealthState(active) {
        if (this.isHeartbeatActive === active) return;
        this.isHeartbeatActive = active;

        if (active) {
            this.startHeartbeat();
        } else {
            this.stopHeartbeat();
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        const triggerBeat = () => {
            if (!this.ctx || !this.isHeartbeatActive) return;
            const now = this.ctx.currentTime;

            // Lub (low punch)
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(55, now);
            osc1.frequency.exponentialRampToValueAtTime(35, now + 0.15);
            gain1.gain.setValueAtTime(0.6, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(this.masterGain);
            osc1.start(now);
            osc1.stop(now + 0.15);

            // Dub (delayed soft pulse)
            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(50, now + 0.2);
            osc2.frequency.exponentialRampToValueAtTime(30, now + 0.38);
            gain2.gain.setValueAtTime(0, now);
            gain2.gain.setValueAtTime(0.45, now + 0.2);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
            osc2.connect(gain2);
            gain2.connect(this.masterGain);
            osc2.start(now + 0.2);
            osc2.stop(now + 0.38);
        };

        triggerBeat();
        this.heartbeatInterval = setInterval(triggerBeat, 850);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}
