/**
 * Velocity Arena - Precision Sniper Scope HUD Canvas Overlay
 * Procedural military reticle with mil-dots, rangefinder, dual zoom readouts,
 * dynamic breathing sway, and circular outer vignette.
 */
export class SniperScope {
    constructor() {
        this.canvas = document.getElementById('sniper-scope-canvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.isActive = false;
        this.zoomLevel = 4; // 4x or 8x
        this.swayTime = 0;
        this.holdingBreath = false;
        this.breathHoldTime = 0;
        this.maxBreathTime = 3.0; // 3 seconds max steady breath

        this.swayOffset = { x: 0, y: 0 };

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    activate(zoom = 4) {
        this.isActive = true;
        this.zoomLevel = zoom;
        if (this.canvas) {
            this.canvas.classList.remove('hidden');
        }
    }

    deactivate() {
        this.isActive = false;
        this.holdingBreath = false;
        this.breathHoldTime = 0;
        if (this.canvas) {
            this.canvas.classList.add('hidden');
        }
    }

    setZoom(zoom) {
        this.zoomLevel = zoom;
    }

    setHoldBreath(holding) {
        if (holding && this.breathHoldTime < this.maxBreathTime) {
            this.holdingBreath = true;
        } else {
            this.holdingBreath = false;
        }
    }

    update(dt) {
        if (!this.isActive || !this.ctx) return;

        // Breath stamina mechanics
        if (this.holdingBreath) {
            this.breathHoldTime += dt;
            if (this.breathHoldTime >= this.maxBreathTime) {
                this.holdingBreath = false; // breath ran out
            }
        } else {
            this.breathHoldTime = Math.max(0, this.breathHoldTime - dt * 0.8);
        }

        // Sway calculation: heavily dampened if holding breath
        this.swayTime += dt;
        const swayIntensity = this.holdingBreath ? 0.08 : (this.zoomLevel === 8 ? 0.6 : 0.35);

        this.swayOffset.x = Math.sin(this.swayTime * 1.4) * 12 * swayIntensity + Math.cos(this.swayTime * 0.7) * 6 * swayIntensity;
        this.swayOffset.y = Math.cos(this.swayTime * 2.1) * 8 * swayIntensity + Math.sin(this.swayTime * 1.1) * 4 * swayIntensity;

        this.render();
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2 + this.swayOffset.x;
        const cy = h / 2 + this.swayOffset.y;
        const scopeRadius = Math.min(w, h) * 0.44;

        ctx.clearRect(0, 0, w, h);

        // 1. Dark Vignette / Scope Border Mask
        ctx.save();
        ctx.fillStyle = 'rgba(5, 7, 12, 0.96)';
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.arc(cx, cy, scopeRadius, 0, Math.PI * 2, true);
        ctx.fill();
        ctx.restore();

        // 2. Optical Glass Radial Tint & Lens Ring
        const grad = ctx.createRadialGradient(cx, cy, scopeRadius * 0.1, cx, cy, scopeRadius);
        grad.addColorStop(0, 'rgba(0, 180, 255, 0.02)');
        grad.addColorStop(0.85, 'rgba(0, 120, 200, 0.08)');
        grad.addColorStop(1, 'rgba(0, 40, 80, 0.45)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, scopeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Scope Ring Bevel
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, scopeRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, scopeRadius - 8, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Military Reticle Crosshairs
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;

        // Horizontal crosshair with center gap
        ctx.beginPath();
        ctx.moveTo(cx - scopeRadius + 15, cy);
        ctx.lineTo(cx - 30, cy);
        ctx.moveTo(cx + 30, cy);
        ctx.lineTo(cx + scopeRadius - 15, cy);

        // Vertical crosshair with center gap
        ctx.moveTo(cx, cy - scopeRadius + 15);
        ctx.lineTo(cx, cy - 30);
        ctx.moveTo(cx, cy + 30);
        ctx.lineTo(cx + scopeRadius - 15, cy);
        ctx.stroke();

        // Center Red Glowing Dot
        ctx.fillStyle = '#ff2b55';
        ctx.shadowColor = '#ff003c';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // 4. Mil-Dots and Elevation Drop Marks
        ctx.fillStyle = '#00f0ff';
        for (let i = -4; i <= 4; i++) {
            if (i === 0) continue;
            const dotSpacing = 35;
            // Horizontal mil-dots
            ctx.beginPath();
            ctx.arc(cx + i * dotSpacing, cy, 2, 0, Math.PI * 2);
            ctx.fill();

            // Vertical mil-lines
            const hashWidth = Math.abs(i) % 2 === 0 ? 14 : 8;
            ctx.fillRect(cx - hashWidth / 2, cy + i * dotSpacing, hashWidth, 1.5);
        }

        // 5. Tactical Digital Scope HUD Readout
        ctx.font = '600 13px Orbitron, Rajdhani, sans-serif';
        ctx.fillStyle = '#00f0ff';
        ctx.textAlign = 'left';
        ctx.fillText(`MAGNIFICATION: ${this.zoomLevel}X`, cx - scopeRadius + 40, cy - scopeRadius + 50);
        ctx.fillText(`RANGE: 184M`, cx - scopeRadius + 40, cy - scopeRadius + 70);

        ctx.textAlign = 'right';
        ctx.fillText(`CALIBER: 12.7x99mm HE`, cx + scopeRadius - 40, cy - scopeRadius + 50);

        // Breath Indicator
        const breathPercent = Math.max(0, 1 - (this.breathHoldTime / this.maxBreathTime));
        ctx.fillText(`STABILIZATION: ${Math.round(breathPercent * 100)}%`, cx + scopeRadius - 40, cy - scopeRadius + 70);

        // Breath bar
        const barW = 120;
        const barH = 5;
        const bx = cx + scopeRadius - 40 - barW;
        const by = cy - scopeRadius + 80;
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.strokeRect(bx, by, barW, barH);
        ctx.fillStyle = breathPercent > 0.3 ? '#00f0ff' : '#ff3344';
        ctx.fillRect(bx, by, barW * breathPercent, barH);
    }
}
