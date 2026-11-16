import * as THREE from 'three';

/**
 * Velocity Arena - Zero-Allocation Object Pooled Laser Tracer System
 * Renders glowing high-energy laser tracer beams with fade-out dynamics.
 */
export class LaserTracerSystem {
    constructor(scene, maxPoolSize = 24) {
        this.scene = scene;
        this.maxPoolSize = maxPoolSize;
        this.pool = [];
        this.activeTracers = [];

        this.initPool();
    }

    initPool() {
        for (let i = 0; i < this.maxPoolSize; i++) {
            // High-intensity laser tracer line with glowing additive blending
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(6); // 2 points * 3 components
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const material = new THREE.LineBasicMaterial({
                color: 0x00f3ff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                linewidth: 2
            });

            const line = new THREE.Line(geometry, material);
            line.visible = false;
            line.frustumCulled = false;
            this.scene.add(line);

            this.pool.push({
                mesh: line,
                geometry: geometry,
                material: material,
                life: 0,
                maxLife: 0.18, // 180ms
                active: false
            });
        }
    }

    spawnTracer(startPos, endPos, color = 0x00f3ff, duration = 0.18) {
        let tracer = null;
        for (let i = 0; i < this.pool.length; i++) {
            if (!this.pool[i].active) {
                tracer = this.pool[i];
                break;
            }
        }

        if (!tracer) {
            // Recycle oldest active tracer
            tracer = this.activeTracers.shift();
        }

        if (!tracer) return;

        tracer.active = true;
        tracer.life = duration;
        tracer.maxLife = duration;
        tracer.material.color.setHex(color);
        tracer.material.opacity = 1.0;
        tracer.mesh.visible = true;

        const positions = tracer.geometry.attributes.position.array;
        positions[0] = startPos.x;
        positions[1] = startPos.y;
        positions[2] = startPos.z;
        positions[3] = endPos.x;
        positions[4] = endPos.y;
        positions[5] = endPos.z;
        tracer.geometry.attributes.position.needsUpdate = true;

        this.activeTracers.push(tracer);
    }

    update(dt) {
        for (let i = this.activeTracers.length - 1; i >= 0; i--) {
            const tracer = this.activeTracers[i];
            tracer.life -= dt;

            if (tracer.life <= 0) {
                tracer.active = false;
                tracer.mesh.visible = false;
                tracer.material.opacity = 0;
                this.activeTracers.splice(i, 1);
            } else {
                // Smooth exponential fade-out
                const alpha = Math.max(0, tracer.life / tracer.maxLife);
                tracer.material.opacity = alpha;
            }
        }
    }
}
