import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { io } from 'socket.io-client';

import { SoundEngine } from './src/audio/SoundEngine.js';
import { SpectatorController } from './src/spectator/SpectatorController.js';
import { SniperScope } from './src/weapons/SniperScope.js';
import { LaserTracerSystem } from './src/weapons/LaserTracerSystem.js';

// Setup BVH for exact collision raycasting
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ==========================================
// 1. WEAPON DEFINITIONS & GAME CONSTANTS
// ==========================================
const WEAPONS = {
    sniper: {
        id: 'sniper',
        name: 'Apex Rail-Sniper',
        path: '/models/assult_gun.glb', // Loaded and customized with scope/barrel
        ammo: 5,
        reserve: 25,
        damage: 85,
        fireRate: 1100, // 1.1s bolt-cycle
        recoil: 2.2,
        spread: 0.001,
        adsFov: 30, // 4x zoom
        extremeFov: 15, // 8x zoom
        scale: 0.015,
        basePos: new THREE.Vector3(0.19, -0.21, -0.42),
        adsPos: new THREE.Vector3(0.0, -0.16, -0.32),
        isSniper: true
    },
    assault: {
        id: 'assault',
        name: 'Vanguard AR',
        path: '/models/assult_gun.glb',
        ammo: 30,
        reserve: 120,
        damage: 24,
        fireRate: 92,
        recoil: 1.0,
        spread: 0.006,
        adsFov: 52,
        scale: 0.014,
        basePos: new THREE.Vector3(0.18, -0.22, -0.42),
        adsPos: new THREE.Vector3(0.01, -0.19, -0.36),
        isSniper: false
    },
    smg: {
        id: 'smg',
        name: 'Rift SMG',
        path: '/models/smg_90.glb',
        ammo: 36,
        reserve: 144,
        damage: 18,
        fireRate: 62,
        recoil: 0.65,
        spread: 0.011,
        adsFov: 56,
        scale: 0.005,
        basePos: new THREE.Vector3(0.18, -0.20, -0.40),
        adsPos: new THREE.Vector3(0.0, -0.18, -0.35),
        isSniper: false
    },
    shotgun: {
        id: 'shotgun',
        name: 'Breach-12',
        path: '/models/shortgun.glb',
        ammo: 8,
        reserve: 40,
        damage: 14,
        pellets: 8,
        fireRate: 640,
        recoil: 1.75,
        spread: 0.045,
        adsFov: 58,
        scale: 0.040,
        basePos: new THREE.Vector3(0.20, -0.24, -0.45),
        adsPos: new THREE.Vector3(0.01, -0.20, -0.36),
        isSniper: false
    }
};

let selectedWeaponId = 'sniper';
let currentWeapon = WEAPONS[selectedWeaponId];
let currentAmmo = currentWeapon.ammo;
let reserveAmmo = currentWeapon.reserve;
let isReloading = false;
let isAiming = false;
let sniperZoomLevel = 4; // 4x or 8x
let isBoltCycling = false;
let lastShotTime = 0;
let isDead = false;
let isMatchActive = false;

// ==========================================
// 2. AUDIO & WEAPON SUBSYSTEMS
// ==========================================
const soundEngine = new SoundEngine();
const sniperScope = new SniperScope();

// ==========================================
// 3. THREE.JS ENGINE SETUP
// ==========================================
const canvas = document.getElementById('game-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090e);
scene.fog = new THREE.FogExp2(0x07090e, 0.006);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraGroup = new THREE.Group();
scene.add(cameraGroup);

camera.position.set(0, 1.68, 0);
cameraGroup.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223344, 0.85);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0x00f3ff, 1.2);
dirLight.position.set(80, 180, 50);
dirLight.castShadow = true;
scene.add(dirLight);

const laserTracers = new LaserTracerSystem(scene, 32);
const spectator = new SpectatorController(camera, canvas);

// ==========================================
// 4. WEAPON 3D MESH & RIG
// ==========================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
weaponGroup.position.copy(currentWeapon.basePos);

let loadedWeaponMeshes = {};
const gltfLoader = new GLTFLoader();

function buildProceduralWeapon(type) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, metalness: 0.85, roughness: 0.25 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x050810, metalness: 0.95, roughness: 0.1 });
    const emissiveMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });

    // Main receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.5), bodyMat);
    group.add(receiver);

    if (type === 'sniper') {
        // Extended long heavy rail barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.75, 16), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.04, -0.45);
        group.add(barrel);

        // Glowing Rail Accents
        const railL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.01, 0.6), emissiveMat);
        railL.position.set(-0.028, 0.04, -0.4);
        group.add(railL);

        const railR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.01, 0.6), emissiveMat);
        railR.position.set(0.028, 0.04, -0.4);
        group.add(railR);

        // Heavy Optical Scope Cylinder
        const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.32, 16), barrelMat);
        scopeBody.rotation.x = Math.PI / 2;
        scopeBody.position.set(0, 0.11, -0.08);
        group.add(scopeBody);

        const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), emissiveMat);
        scopeLens.position.set(0, 0.11, -0.24);
        group.add(scopeLens);
    } else {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 12), barrelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, -0.3);
        group.add(barrel);
    }

    return group;
}

function equipWeapon(weaponId) {
    if (!WEAPONS[weaponId]) return;
    selectedWeaponId = weaponId;
    currentWeapon = WEAPONS[weaponId];
    currentAmmo = currentWeapon.ammo;
    reserveAmmo = currentWeapon.reserve;

    // Clear weapon group
    while (weaponGroup.children.length > 0) {
        weaponGroup.remove(weaponGroup.children[0]);
    }

    const mesh = buildProceduralWeapon(weaponId);
    weaponGroup.add(mesh);
    weaponGroup.position.copy(currentWeapon.basePos);

    // Update HUD
    const hudName = document.getElementById('hud-weapon-name');
    if (hudName) hudName.textContent = currentWeapon.name;
    updateAmmoHUD();

    if (socket.connected) {
        socket.emit('updateProfile', { loadout: selectedWeaponId });
    }
}

// ==========================================
// 5. MAP COLLISION & ARENA GENERATION
// ==========================================
let mapCollider = null;

function buildArena() {
    const arenaGroup = new THREE.Group();

    // Floor
    const floorGeo = new THREE.BoxGeometry(100, 2, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x121722, roughness: 0.7 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -1;
    floor.receiveShadow = true;
    arenaGroup.add(floor);

    // Neon Grid Platform Accent
    const gridHelper = new THREE.GridHelper(100, 50, 0x00f3ff, 0x1b2838);
    gridHelper.position.y = 0.02;
    arenaGroup.add(gridHelper);

    // Perimeter Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c2433, roughness: 0.6 });
    const createWall = (x, y, z, w, h, d) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, y, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        arenaGroup.add(wall);
    };

    createWall(0, 5, -50, 100, 10, 2);
    createWall(0, 5, 50, 100, 10, 2);
    createWall(-50, 5, 0, 2, 10, 100);
    createWall(50, 5, 0, 2, 10, 100);

    // Tactical Bunkers, Ramps & Sniper Towers
    createWall(0, 4, 0, 12, 8, 12); // Center Bunker
    createWall(25, 3, 20, 10, 6, 16);
    createWall(-25, 3, -20, 10, 6, 16);
    createWall(-25, 3, 25, 14, 6, 8);
    createWall(25, 3, -25, 14, 6, 8);

    // Sniper Vantage Towers
    createWall(-35, 7, -35, 8, 14, 8);
    createWall(35, 7, 35, 8, 14, 8);

    scene.add(arenaGroup);

    // Build Static BVH Collider for fast, exact hit/movement detection
    const geometries = [];
    arenaGroup.traverse((child) => {
        if (child.isMesh && child.geometry) {
            const cloned = child.geometry.clone();
            cloned.applyMatrix4(child.matrixWorld);
            geometries.push(cloned);
        }
    });

    if (geometries.length > 0) {
        const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
        merged.computeBoundsTree();
        mapCollider = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ visible: false }));
        scene.add(mapCollider);
    }
}

buildArena();

// ==========================================
// 6. PLAYER CONTROLS & PHYSICS
// ==========================================
const controls = new PointerLockControls(camera, document.body);
const velocity = new THREE.Vector3();
let playerOnFloor = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let isSprinting = false;

// Audio footstep interval accumulator
let footstepTimer = 0;
let leftFoot = true;

document.addEventListener('keydown', (e) => {
    if (spectator.isActive) {
        if (e.code === 'KeyR') {
            socket.emit('requestRespawn');
        }
        return;
    }

    if (e.code === 'KeyW') moveForward = true;
    if (e.code === 'KeyS') moveBackward = true;
    if (e.code === 'KeyA') moveLeft = true;
    if (e.code === 'KeyD') moveRight = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        isSprinting = true;
        if (isAiming && currentWeapon.isSniper) {
            // Toggle 8x extreme optical zoom or hold breath
            if (sniperZoomLevel === 4) {
                sniperZoomLevel = 8;
                camera.fov = currentWeapon.extremeFov;
                camera.updateProjectionMatrix();
                sniperScope.setZoom(8);
            }
            sniperScope.setHoldBreath(true);
        }
    }
    if (e.code === 'Space' && canJump && playerOnFloor) {
        velocity.y = 8.5;
        playerOnFloor = false;
        canJump = false;
    }
    if (e.code === 'KeyR' && !isReloading) {
        reloadWeapon();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') moveForward = false;
    if (e.code === 'KeyS') moveBackward = false;
    if (e.code === 'KeyA') moveLeft = false;
    if (e.code === 'KeyD') moveRight = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        isSprinting = false;
        if (currentWeapon.isSniper) {
            sniperScope.setHoldBreath(false);
        }
    }
});

// Mouse Shooting & ADS Aiming
window.addEventListener('mousedown', (e) => {
    if (!controls.isLocked || isDead || spectator.isActive) return;

    if (e.button === 0) {
        // Fire Weapon
        fireWeapon();
    } else if (e.button === 2) {
        // ADS Zoom
        setAim(true);
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        setAim(false);
    }
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

function setAim(aiming) {
    if (isAiming === aiming) return;
    isAiming = aiming;

    if (isAiming) {
        sniperZoomLevel = 4;
        camera.fov = currentWeapon.adsFov;
        camera.updateProjectionMatrix();
        weaponGroup.position.copy(currentWeapon.adsPos);

        if (currentWeapon.isSniper) {
            sniperScope.activate(4);
            document.getElementById('crosshair')?.classList.add('hidden');
            document.getElementById('sniper-prompt')?.classList.remove('hidden');
        }
    } else {
        camera.fov = 75;
        camera.updateProjectionMatrix();
        weaponGroup.position.copy(currentWeapon.basePos);

        if (currentWeapon.isSniper) {
            sniperScope.deactivate();
            document.getElementById('crosshair')?.classList.remove('hidden');
            document.getElementById('sniper-prompt')?.classList.add('hidden');
        }
    }
}

// ==========================================
// 7. WEAPON FIRING & LASER TRACERS
// ==========================================
function fireWeapon() {
    if (isReloading || isBoltCycling || currentAmmo <= 0) {
        if (currentAmmo <= 0) reloadWeapon();
        return;
    }

    const now = performance.now();
    if (now - lastShotTime < currentWeapon.fireRate) return;
    lastShotTime = now;
    currentAmmo--;
    updateAmmoHUD();

    // Sound Synthesis based on weapon class
    if (currentWeapon.id === 'sniper') {
        soundEngine.playSniperShot();
        triggerBoltCycle();
    } else if (currentWeapon.id === 'assault') {
        soundEngine.playAssaultShot();
    } else if (currentWeapon.id === 'smg') {
        soundEngine.playSmgShot();
    } else if (currentWeapon.id === 'shotgun') {
        soundEngine.playShotgunShot();
    }

    // Raycast hit detection
    const raycaster = new THREE.Raycaster();
    raycaster.firstHitOnly = true;

    // Apply sniper breath sway offset to aim vector if scoped
    const screenCenter = new THREE.Vector2(0, 0);
    if (isAiming && currentWeapon.isSniper) {
        screenCenter.x += (sniperScope.swayOffset.x / window.innerWidth) * 2;
        screenCenter.y -= (sniperScope.swayOffset.y / window.innerHeight) * 2;
    }
    raycaster.setFromCamera(screenCenter, camera);

    // Muzzle position for laser tracer
    const muzzlePos = new THREE.Vector3();
    weaponGroup.getWorldPosition(muzzlePos);
    muzzlePos.add(new THREE.Vector3(0, 0.05, -0.4).applyQuaternion(camera.quaternion));

    let hitPoint = new THREE.Vector3();
    let hitObject = null;

    // Check hit against remote players
    let closestDist = Infinity;
    let hitPlayerId = null;
    let isHeadshot = false;

    for (const [id, playerObj] of Object.entries(remotePlayers)) {
        if (!playerObj.mesh || playerObj.isDead) continue;
        const intersects = raycaster.intersectObject(playerObj.mesh, true);
        if (intersects.length > 0 && intersects[0].distance < closestDist) {
            closestDist = intersects[0].distance;
            hitPoint.copy(intersects[0].point);
            hitObject = intersects[0].object;
            hitPlayerId = id;
            // Headshot detection: hit above neck height (y > 1.45 relative to player base)
            if (intersects[0].point.y - playerObj.mesh.position.y > 1.42) {
                isHeadshot = true;
            }
        }
    }

    // Check map geometry if no player was hit closer
    if (mapCollider) {
        const mapIntersects = raycaster.intersectObject(mapCollider);
        if (mapIntersects.length > 0 && mapIntersects[0].distance < closestDist) {
            closestDist = mapIntersects[0].distance;
            hitPoint.copy(mapIntersects[0].point);
            hitPlayerId = null;
        }
    }

    if (closestDist === Infinity) {
        // Did not intersect anything; project tracer 150m out
        hitPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 150);
    }

    // Spawn high-energy glowing laser tracer
    const tracerColor = currentWeapon.id === 'sniper' ? 0x00f3ff : 0xffaa00;
    laserTracers.spawnTracer(muzzlePos, hitPoint, tracerColor, currentWeapon.id === 'sniper' ? 0.22 : 0.08);

    // Notify server of shot for remote spatial audio & remote tracers
    socket.emit('weaponFired', {
        weaponId: currentWeapon.id,
        origin: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
        target: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z }
    });

    // Authoritative hit reporting
    if (hitPlayerId) {
        socket.emit('playerHit', {
            targetId: hitPlayerId,
            isHeadshot: isHeadshot
        });
    }

    // Weapon Recoil Kick
    camera.rotation.x += (currentWeapon.recoil * 0.012);
}

function triggerBoltCycle() {
    isBoltCycling = true;
    const boltHud = document.getElementById('bolt-cycle-hud');
    if (boltHud) boltHud.classList.remove('hidden');

    setTimeout(() => {
        soundEngine.playBoltCycle();
    }, 450);

    setTimeout(() => {
        isBoltCycling = false;
        if (boltHud) boltHud.classList.add('hidden');
    }, 1100);
}

function reloadWeapon() {
    if (isReloading || reserveAmmo <= 0 || currentAmmo === currentWeapon.ammo) return;
    isReloading = true;
    setAim(false);

    setTimeout(() => {
        const needed = currentWeapon.ammo - currentAmmo;
        const toLoad = Math.min(needed, reserveAmmo);
        currentAmmo += toLoad;
        reserveAmmo -= toLoad;
        isReloading = false;
        updateAmmoHUD();
    }, 2200);
}

function updateAmmoHUD() {
    const cur = document.getElementById('ammo-current');
    const res = document.getElementById('ammo-reserve');
    if (cur) cur.textContent = currentAmmo;
    if (res) res.textContent = reserveAmmo;
}

// ==========================================
// 8. MULTIPLAYER NETWORKING (Socket.io)
// ==========================================
const serverUrl = window.location.port === '3000' ? window.location.origin : 'http://localhost:3000';
const socket = io(serverUrl, { transports: ['websocket', 'polling'] });
const remotePlayers = {};
let myId = null;

socket.on('connect', () => {
    myId = socket.id;
    console.log('[Velocity Arena] Connected to server with ID:', myId);
    socket.emit('updateProfile', {
        name: document.getElementById('player-name-input')?.value || 'Operative',
        loadout: selectedWeaponId
    });
});

socket.on('currentPlayers', (serverPlayers) => {
    for (const [id, data] of Object.entries(serverPlayers)) {
        if (id !== myId) {
            addRemotePlayer(id, data);
        }
    }
});

socket.on('playerJoined', (data) => {
    if (data.id !== myId) {
        addRemotePlayer(data.id, data);
    }
});

socket.on('playerMoved', (data) => {
    const rp = remotePlayers[data.id];
    if (rp && rp.mesh) {
        rp.targetPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
        rp.mesh.rotation.y = data.rotation.y;
    }
});

socket.on('playerShot', (data) => {
    // 3D Spatial Audio for other players' gunshots!
    const shotOrigin = data.origin ? new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z) : null;
    if (data.weaponId === 'sniper') {
        soundEngine.playSniperShot(shotOrigin);
    } else if (data.weaponId === 'shotgun') {
        soundEngine.playShotgunShot(shotOrigin);
    } else if (data.weaponId === 'smg') {
        soundEngine.playSmgShot(shotOrigin);
    } else {
        soundEngine.playAssaultShot(shotOrigin);
    }

    // Render remote laser tracer
    if (data.origin && data.target) {
        const p1 = new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z);
        const p2 = new THREE.Vector3(data.target.x, data.target.y, data.target.z);
        laserTracers.spawnTracer(p1, p2, data.isSniper ? 0x00f3ff : 0xffaa00, data.isSniper ? 0.22 : 0.08);
    }
});

socket.on('hitConfirmed', (data) => {
    // Play hitmarker & headshot bell chime
    if (data.isHeadshot) {
        soundEngine.playHeadshotDing();
    } else {
        soundEngine.playHitmarker();
    }

    const hitMarker = document.getElementById('hit-marker');
    if (hitMarker) {
        hitMarker.classList.remove('hidden');
        setTimeout(() => hitMarker.classList.add('hidden'), 120);
    }
});

socket.on('playerDamaged', (data) => {
    if (data.id === myId) {
        const hpBar = document.getElementById('health-bar');
        const hpText = document.getElementById('health-text');
        if (hpBar) hpBar.style.width = `${Math.max(0, data.health)}%`;
        if (hpText) hpText.textContent = Math.max(0, data.health);

        // Low health heartbeat synthesis check
        soundEngine.setLowHealthState(data.health < 30);
    }
});

socket.on('playerDied', (data) => {
    // Killfeed announcement
    addScoreboardKill(data.killerName, data.victimName, data.weaponId, data.isHeadshot);

    if (data.victimId === myId) {
        // Player eliminated! Transition smoothly into Dual-Mode Spectator Engine
        isDead = true;
        soundEngine.setLowHealthState(false);
        setAim(false);
        spectator.start(remotePlayers, data.killerId, cameraGroup.position);
    } else if (remotePlayers[data.victimId]) {
        remotePlayers[data.victimId].isDead = true;
        if (remotePlayers[data.victimId].mesh) {
            remotePlayers[data.victimId].mesh.visible = false;
        }
    }
});

socket.on('playerRespawned', (data) => {
    if (data.id === myId) {
        isDead = false;
        spectator.stop();
        cameraGroup.position.set(data.position.x, data.position.y, data.position.z);
        velocity.set(0, 0, 0);

        const hpBar = document.getElementById('health-bar');
        const hpText = document.getElementById('health-text');
        if (hpBar) hpBar.style.width = '100%';
        if (hpText) hpText.textContent = '100';
    } else if (remotePlayers[data.id]) {
        remotePlayers[data.id].isDead = false;
        if (remotePlayers[data.id].mesh) {
            remotePlayers[data.id].mesh.visible = true;
            remotePlayers[data.id].mesh.position.set(data.position.x, data.position.y, data.position.z);
        }
    }
});

socket.on('playerLeft', (id) => {
    if (remotePlayers[id]) {
        if (remotePlayers[id].mesh) scene.remove(remotePlayers[id].mesh);
        delete remotePlayers[id];
    }
});

socket.on('lobbyStats', (stats) => {
    renderScoreboard(stats.players);
});

function addRemotePlayer(id, data) {
    // Procedural tactical operative mesh with distinct head hitbox
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2e4d, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xff3b5c, roughness: 0.3 }); // Red glowing visor

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.3, 16), bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);

    group.position.set(data.position.x, data.position.y, data.position.z);
    scene.add(group);

    remotePlayers[id] = {
        id: id,
        name: data.name,
        mesh: group,
        targetPos: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
        health: data.health || 100,
        isDead: data.isDead || false
    };
}

function addScoreboardKill(killer, victim, weapon, headshot) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const row = document.createElement('div');
    row.className = `kill-row ${headshot ? 'headshot' : ''}`;
    row.innerHTML = `<strong>${killer}</strong> [${weapon.toUpperCase()}${headshot ? ' 🎯 HS' : ''}] <span>${victim}</span>`;
    feed.appendChild(row);
    setTimeout(() => row.remove(), 4500);
}

function renderScoreboard(players) {
    const tbody = document.getElementById('scoreboard-body');
    if (!tbody || !players) return;
    tbody.innerHTML = '';

    const list = Object.values(players).sort((a, b) => (b.kills || 0) - (a.kills || 0));
    list.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td><strong>${p.name || 'Operative'}</strong></td>
            <td>${p.kills || 0}</td>
            <td>${p.deaths || 0}</td>
            <td>${p.headshots || 0}</td>
            <td><span style="color: ${p.isDead ? '#ff2b55' : '#00ff88'}">${p.isDead ? 'ELIMINATED' : 'ACTIVE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 9. MINIMAP RADAR
// ==========================================
const minimapCanvas = document.getElementById('minimap-canvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function renderMinimap() {
    if (!minimapCtx) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 1.3;

    minimapCtx.clearRect(0, 0, w, h);

    // Arena boundary ring
    minimapCtx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    minimapCtx.lineWidth = 2;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, 68, 0, Math.PI * 2);
    minimapCtx.stroke();

    // Remote Players
    for (const rp of Object.values(remotePlayers)) {
        if (!rp.mesh || rp.isDead) continue;
        const dx = (rp.mesh.position.x - cameraGroup.position.x) * scale;
        const dz = (rp.mesh.position.z - cameraGroup.position.z) * scale;

        minimapCtx.fillStyle = '#ff2b55';
        minimapCtx.beginPath();
        minimapCtx.arc(cx + dx, cy + dz, 3.5, 0, Math.PI * 2);
        minimapCtx.fill();
    }

    // Local player (center green dot)
    minimapCtx.fillStyle = '#00ff88';
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, 4, 0, Math.PI * 2);
    minimapCtx.fill();
}

// ==========================================
// 10. GAME LOOP & ANIMATION
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);

    // Update laser tracer fadeouts
    laserTracers.update(dt);

    if (spectator.isActive) {
        spectator.update(dt, remotePlayers);
    } else if (controls.isLocked && !isDead) {
        // Player Physics & Movement
        const speed = isSprinting ? 12 : 7.5;
        const moveVector = new THREE.Vector3();

        if (moveForward) moveVector.z -= 1;
        if (moveBackward) moveVector.z += 1;
        if (moveLeft) moveVector.x -= 1;
        if (moveRight) moveVector.x += 1;
        moveVector.normalize();

        const camDirection = new THREE.Vector3();
        camera.getWorldDirection(camDirection);
        camDirection.y = 0;
        camDirection.normalize();

        const camSide = new THREE.Vector3().crossVectors(camera.up, camDirection).normalize();

        velocity.x = (camDirection.x * -moveVector.z + camSide.x * -moveVector.x) * speed;
        velocity.z = (camDirection.z * -moveVector.z + camSide.z * -moveVector.x) * speed;

        // Gravity
        velocity.y -= 22 * dt;

        cameraGroup.position.x += velocity.x * dt;
        cameraGroup.position.z += velocity.z * dt;
        cameraGroup.position.y += velocity.y * dt;

        // Ground floor collision clamp
        if (cameraGroup.position.y <= 0) {
            cameraGroup.position.y = 0;
            velocity.y = 0;
            playerOnFloor = true;
            canJump = true;
        }

        // Positional Footsteps synthesis
        if (playerOnFloor && (moveForward || moveBackward || moveLeft || moveRight)) {
            footstepTimer += dt;
            const stepInterval = isSprinting ? 0.32 : 0.48;
            if (footstepTimer >= stepInterval) {
                footstepTimer = 0;
                soundEngine.playFootstep(null, leftFoot);
                leftFoot = !leftFoot;
            }
        }

        // Emit local movement
        socket.emit('playerMove', {
            position: { x: cameraGroup.position.x, y: cameraGroup.position.y, z: cameraGroup.position.z },
            rotation: { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z },
            state: isSprinting ? 'sprinting' : (moveVector.lengthSq() > 0 ? 'running' : 'idle')
        });

        // Update Precision Sniper Scope
        if (isAiming && currentWeapon.isSniper) {
            sniperScope.update(dt);
        }
    }

    // Remote Players Position Interpolation
    for (const rp of Object.values(remotePlayers)) {
        if (rp.mesh && rp.targetPos) {
            rp.mesh.position.lerp(rp.targetPos, Math.min(1.0, dt * 14));
        }
    }

    // Update 3D Audio Listener relative to current camera
    soundEngine.updateListener(camera);

    // Render Minimap
    renderMinimap();

    // Render 3D Scene
    renderer.render(scene, camera);
}

// ==========================================
// 11. UI & EVENT INITIALIZATION
// ==========================================
function initUI() {
    const btnPlay = document.getElementById('btn-play');
    const btnWeapons = document.getElementById('btn-weapons');
    const btnSettings = document.getElementById('btn-settings');
    const closeWeapons = document.getElementById('close-weapons');
    const closeSettings = document.getElementById('close-settings');
    const weaponsPanel = document.getElementById('weapons-panel');
    const settingsPanel = document.getElementById('settings-panel');
    const mainMenu = document.getElementById('main-menu');
    const gameHud = document.getElementById('game-hud');
    const loadingScreen = document.getElementById('loading-screen');

    // Simulate clean engine init
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                mainMenu?.classList.remove('hidden');
            }, 600);
        }
    }, 800);

    btnPlay?.addEventListener('click', () => {
        soundEngine.init();
        soundEngine.resume();
        mainMenu?.classList.add('hidden');
        gameHud?.classList.remove('hidden');
        controls.lock();
        isMatchActive = true;
    });

    btnWeapons?.addEventListener('click', () => {
        weaponsPanel?.classList.remove('hidden');
    });

    closeWeapons?.addEventListener('click', () => {
        weaponsPanel?.classList.add('hidden');
    });

    btnSettings?.addEventListener('click', () => {
        settingsPanel?.classList.remove('hidden');
    });

    closeSettings?.addEventListener('click', () => {
        settingsPanel?.classList.add('hidden');
    });

    // Weapon Card Click Equipping
    document.querySelectorAll('.weapon-card').forEach(card => {
        card.addEventListener('click', () => {
            const wId = card.getAttribute('data-weapon');
            equipWeapon(wId);
            document.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
    });

    // Sound test buttons in settings
    document.getElementById('btn-test-sniper')?.addEventListener('click', () => {
        soundEngine.init();
        soundEngine.playSniperShot();
    });

    document.getElementById('btn-test-headshot')?.addEventListener('click', () => {
        soundEngine.init();
        soundEngine.playHeadshotDing();
    });

    document.getElementById('btn-test-hitmarker')?.addEventListener('click', () => {
        soundEngine.init();
        soundEngine.playHitmarker();
    });

    // Master volume slider
    document.getElementById('volume-master')?.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10) / 100;
        soundEngine.setMasterVolume(val);
        document.getElementById('volume-master-val').textContent = `${e.target.value}%`;
    });

    // Scoreboard Tab toggle
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Tab') {
            e.preventDefault();
            document.getElementById('scoreboard')?.classList.remove('hidden');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Tab') {
            document.getElementById('scoreboard')?.classList.add('hidden');
        }
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Initialize with Apex Sniper loadout
    equipWeapon('sniper');
}

initUI();
animate();
