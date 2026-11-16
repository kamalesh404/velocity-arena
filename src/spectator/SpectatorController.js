import * as THREE from 'three';

/**
 * Velocity Arena - Dual-Mode Spectator Engine
 * Supports Mode 1: Follow POV Cam (cycling living players)
 * and Mode 2: Free-Flight Drone Flycam (6DoF noclip)
 */
export class SpectatorController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;

        this.isActive = false;
        this.mode = 'follow'; // 'follow' | 'freecam'
        
        // Target tracking for Follow mode
        this.playersRef = {};
        this.currentTargetId = null;
        this.targetIndex = 0;
        this.followOffset = new THREE.Vector3(0, 1.8, 3.2);
        this.currentCamPos = new THREE.Vector3();
        this.currentLookAt = new THREE.Vector3();

        // FreeCam state
        this.freecamPos = new THREE.Vector3(0, 10, 20);
        this.freecamPitch = -0.2;
        this.freecamYaw = 0;
        this.freecamSpeed = 18; // units per second
        this.turboMultiplier = 2.5;

        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            up: false,
            down: false,
            turbo: false
        };

        // UI references
        this.spectatorOverlay = document.getElementById('spectator-overlay');
        this.spectatorTargetName = document.getElementById('spectator-target-name');
        this.spectatorTargetHp = document.getElementById('spectator-target-hp');
        this.spectatorModeBadge = document.getElementById('spectator-mode-badge');
        this.spectatorAliveCount = document.getElementById('spectator-alive-count');

        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (!this.isActive) return;

            // Toggle between Follow and FreeCam
            if (e.code === 'KeyF') {
                this.toggleMode();
                return;
            }

            // FreeCam movement keys
            if (this.mode === 'freecam') {
                if (e.code === 'KeyW') this.keys.forward = true;
                if (e.code === 'KeyS') this.keys.backward = true;
                if (e.code === 'KeyA') this.keys.left = true;
                if (e.code === 'KeyD') this.keys.right = true;
                if (e.code === 'Space' || e.code === 'KeyE') this.keys.up = true;
                if (e.code === 'KeyC' || e.code === 'KeyQ') this.keys.down = true;
                if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.turbo = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (!this.isActive) return;
            if (e.code === 'KeyW') this.keys.forward = false;
            if (e.code === 'KeyS') this.keys.backward = false;
            if (e.code === 'KeyA') this.keys.left = false;
            if (e.code === 'KeyD') this.keys.right = false;
            if (e.code === 'Space' || e.code === 'KeyE') this.keys.up = false;
            if (e.code === 'KeyC' || e.code === 'KeyQ') this.keys.down = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.turbo = false;
        });

        window.addEventListener('mousedown', (e) => {
            if (!this.isActive) return;
            // Left click = Next player; Right click = Prev player (in Follow mode)
            if (this.mode === 'follow') {
                if (e.button === 0) {
                    this.cycleTarget(1);
                } else if (e.button === 2) {
                    e.preventDefault();
                    this.cycleTarget(-1);
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isActive || this.mode !== 'freecam') return;
            if (document.pointerLockElement !== this.domElement && document.pointerLockElement !== document.body) return;

            const sensitivity = 0.0022;
            this.freecamYaw -= e.movementX * sensitivity;
            this.freecamPitch -= e.movementY * sensitivity;
            // Clamp pitch to prevent flipping
            this.freecamPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.freecamPitch));
        });
    }

    start(players, killerId = null, myInitialPos = null) {
        this.isActive = true;
        this.playersRef = players;
        this.mode = 'follow';

        if (myInitialPos) {
            this.freecamPos.copy(myInitialPos).add(new THREE.Vector3(0, 2, 0));
        }

        // Set initial follow target: either killer, or first living player
        const livingPlayers = this.getLivingPlayers();
        if (killerId && this.playersRef[killerId] && !this.playersRef[killerId].isDead) {
            this.currentTargetId = killerId;
            this.targetIndex = livingPlayers.findIndex(p => p.id === killerId);
        } else if (livingPlayers.length > 0) {
            this.currentTargetId = livingPlayers[0].id;
            this.targetIndex = 0;
        } else {
            this.mode = 'freecam'; // fallback to freecam if no living player
        }

        this.updateHUD();
        if (this.spectatorOverlay) {
            this.spectatorOverlay.classList.remove('hidden');
        }
    }

    stop() {
        this.isActive = false;
        if (this.spectatorOverlay) {
            this.spectatorOverlay.classList.add('hidden');
        }
    }

    toggleMode() {
        if (this.mode === 'follow') {
            this.mode = 'freecam';
            // Start freecam at current camera position
            this.freecamPos.copy(this.camera.position);
            const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
            this.freecamYaw = euler.y;
            this.freecamPitch = euler.x;
        } else {
            this.mode = 'follow';
            this.cycleTarget(0); // re-evaluate target
        }
        this.updateHUD();
    }

    getLivingPlayers() {
        return Object.values(this.playersRef).filter(p => !p.isDead);
    }

    cycleTarget(direction = 1) {
        const living = this.getLivingPlayers();
        if (living.length === 0) {
            this.currentTargetId = null;
            this.updateHUD();
            return;
        }

        this.targetIndex = (this.targetIndex + direction + living.length) % living.length;
        this.currentTargetId = living[this.targetIndex].id;
        this.updateHUD();
    }

    update(dt, players) {
        if (!this.isActive) return;
        this.playersRef = players;

        const living = this.getLivingPlayers();
        if (this.spectatorAliveCount) {
            this.spectatorAliveCount.textContent = `${living.length} Alive`;
        }

        if (this.mode === 'follow') {
            this.updateFollowCam(dt, living);
        } else {
            this.updateFreeCam(dt);
        }
    }

    updateFollowCam(dt, living) {
        // Validate target is still alive and exists
        let target = this.playersRef[this.currentTargetId];
        if (!target || target.isDead) {
            if (living.length > 0) {
                this.cycleTarget(1);
                target = this.playersRef[this.currentTargetId];
            } else {
                this.mode = 'freecam';
                this.updateHUD();
                return;
            }
        }

        if (!target || !target.position) return;

        // Smooth camera follow
        const targetPos = new THREE.Vector3(target.position.x, target.position.y + 1.6, target.position.z);
        const rotY = target.rotation ? target.rotation.y : 0;

        // Offset behind player based on player yaw
        const offset = new THREE.Vector3(
            Math.sin(rotY) * this.followOffset.z,
            this.followOffset.y,
            Math.cos(rotY) * this.followOffset.z
        );

        const desiredCamPos = new THREE.Vector3().copy(targetPos).add(offset);
        
        // Smooth lerp
        const lerpFactor = Math.min(1.0, dt * 10);
        this.camera.position.lerp(desiredCamPos, lerpFactor);
        this.camera.lookAt(targetPos);

        // Update target HUD display
        if (this.spectatorTargetName) {
            this.spectatorTargetName.textContent = target.name || 'Soldier';
        }
        if (this.spectatorTargetHp) {
            this.spectatorTargetHp.textContent = `HP: ${Math.max(0, target.health || 0)}`;
        }
    }

    updateFreeCam(dt) {
        // Compute movement vector
        const forward = new THREE.Vector3(-Math.sin(this.freecamYaw), 0, -Math.cos(this.freecamYaw));
        const right = new THREE.Vector3(Math.cos(this.freecamYaw), 0, -Math.sin(this.freecamYaw));
        const up = new THREE.Vector3(0, 1, 0);

        const moveDir = new THREE.Vector3();
        if (this.keys.forward) moveDir.add(forward);
        if (this.keys.backward) moveDir.sub(forward);
        if (this.keys.right) moveDir.add(right);
        if (this.keys.left) moveDir.sub(right);
        if (this.keys.up) moveDir.add(up);
        if (this.keys.down) moveDir.sub(up);

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            const speed = this.freecamSpeed * (this.keys.turbo ? this.turboMultiplier : 1.0);
            this.freecamPos.addScaledVector(moveDir, speed * dt);
        }

        this.camera.position.copy(this.freecamPos);

        // Set camera rotation
        const euler = new THREE.Euler(this.freecamPitch, this.freecamYaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);
    }

    updateHUD() {
        if (this.spectatorModeBadge) {
            this.spectatorModeBadge.textContent = this.mode === 'follow' ? 'FOLLOW POV CAM' : 'FREE-FLIGHT DRONE CAM';
            this.spectatorModeBadge.className = this.mode === 'follow' ? 'mode-badge-follow' : 'mode-badge-freecam';
        }

        const targetCard = document.getElementById('spectator-target-card');
        if (targetCard) {
            targetCard.style.display = this.mode === 'follow' ? 'flex' : 'none';
        }
    }
}
