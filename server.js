const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static assets from dist or root for dev
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/models', express.static(path.join(__dirname, 'public', 'models')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const players = {};
const lastMoveAt = {};
const lastShotAt = {}; // socket id -> timestamp of last fired shot
const MAX_HP = 100;

// Server-authoritative weapon stats (mirror of client weapons)
const WEAPONS = {
  assault: { damage: 24, fireRate: 92, range: 120, headshotMult: 1.8 },
  smg: { damage: 18, fireRate: 62, range: 80, headshotMult: 1.6 },
  shotgun: { damage: 14, fireRate: 640, range: 50, headshotMult: 1.5 },
  sniper: { damage: 85, fireRate: 1100, range: 250, headshotMult: 2.0 } // 85 body, 170 headshot (guaranteed 1-shot kill)
};

const DEFAULT_LOADOUT = 'assault';
const FIRE_RATE_TOLERANCE = 0.8; // Allow latency jitter
const RANGE_TOLERANCE = 1.25;    // Latency tolerance
const MAX_MOVE_SPEED = 32;       // units/s
const WORLD_LIMIT = 120;
const MIN_Y = -50;
const MAX_Y = 120;

function isVec3(v) {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isInWorld(v) {
  return isVec3(v) && Math.abs(v.x) <= WORLD_LIMIT && Math.abs(v.z) <= WORLD_LIMIT &&
    v.y >= MIN_Y && v.y <= MAX_Y;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const spawnPoints = [
  { x: 0, y: 8, z: 0 },
  { x: 18, y: 8, z: 16 },
  { x: -18, y: 8, z: -16 },
  { x: 24, y: 8, z: -8 },
  { x: -24, y: 8, z: 8 },
  { x: 8, y: 8, z: -24 },
  { x: -8, y: 8, z: 24 }
];

function pickSpawn() {
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function emitLobbyStats() {
  io.emit('lobbyStats', {
    online: Object.keys(players).length,
    players: players
  });
}

io.on('connection', (socket) => {
  console.log(`[Velocity Arena] Combatant connected: ${socket.id}`);

  players[socket.id] = {
    id: socket.id,
    name: `Operative_${socket.id.slice(0, 4)}`,
    position: pickSpawn(),
    rotation: { x: 0, y: 0, z: 0 },
    health: MAX_HP,
    kills: 0,
    deaths: 0,
    headshots: 0,
    state: 'idle',
    isDead: false,
    loadout: DEFAULT_LOADOUT
  };
  lastShotAt[socket.id] = 0;

  // Sync state with connected player
  socket.emit('currentPlayers', players);
  socket.broadcast.emit('playerJoined', players[socket.id]);
  emitLobbyStats();

  // Profile update
  socket.on('updateProfile', (data) => {
    const p = players[socket.id];
    if (!p) return;
    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      p.name = data.name.trim().slice(0, 16);
    }
    if (typeof data.loadout === 'string' && WEAPONS[data.loadout]) {
      p.loadout = data.loadout;
    }
    socket.broadcast.emit('playerUpdated', p);
    emitLobbyStats();
  });

  // Player movement
  socket.on('playerMove', (data) => {
    const p = players[socket.id];
    if (!p || p.isDead) return;

    if (!isInWorld(data.position) || !isVec3(data.rotation)) return;

    const now = Date.now();
    const prevTime = lastMoveAt[socket.id];
    if (prevTime) {
      const dt = (now - prevTime) / 1000;
      if (dt > 0.005) {
        const d = distance(p.position, data.position);
        if (d / dt > MAX_MOVE_SPEED) {
          // Reject anomalous teleportation
          socket.emit('teleport', p.position);
          return;
        }
      }
    }

    lastMoveAt[socket.id] = now;
    p.position = { x: data.position.x, y: data.position.y, z: data.position.z };
    p.rotation = { x: data.rotation.x, y: data.rotation.y, z: data.rotation.z };
    p.state = data.state || 'idle';

    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position: p.position,
      rotation: p.rotation,
      state: p.state
    });
  });

  // Weapon shot event (broadcast tracers & audio to nearby combatants)
  socket.on('weaponFired', (data) => {
    const p = players[socket.id];
    if (!p || p.isDead) return;

    const weaponKey = data.weaponId || p.loadout || 'assault';
    const weapon = WEAPONS[weaponKey] || WEAPONS.assault;

    const now = Date.now();
    const minInterval = (weapon.fireRate || 100) * FIRE_RATE_TOLERANCE;
    if (now - (lastShotAt[socket.id] || 0) < minInterval) {
      return; // Rate limit exceeded
    }
    lastShotAt[socket.id] = now;

    // Broadcast firing event to all other clients for 3D spatial audio & laser tracers
    socket.broadcast.emit('playerShot', {
      id: socket.id,
      weaponId: weaponKey,
      origin: data.origin,
      target: data.target,
      isSniper: weaponKey === 'sniper'
    });
  });

  // Authoritative damage handling
  socket.on('playerHit', (hitData) => {
    const attacker = players[socket.id];
    if (!attacker || attacker.isDead) return;

    const target = players[hitData.targetId];
    if (!target || target.isDead || target.id === socket.id) return;

    const weaponKey = attacker.loadout || 'assault';
    const weapon = WEAPONS[weaponKey] || WEAPONS.assault;

    // Validate distance
    const dist = distance(attacker.position, target.position);
    if (dist > weapon.range * RANGE_TOLERANCE) {
      return;
    }

    const isHeadshot = Boolean(hitData.isHeadshot);
    const damageMultiplier = isHeadshot ? weapon.headshotMult : 1.0;
    const damage = Math.round(weapon.damage * damageMultiplier);

    target.health -= damage;

    // Confirm hit to attacker for HUD hitmarker & headshot ding
    socket.emit('hitConfirmed', {
      damage: damage,
      isHeadshot: isHeadshot,
      targetId: target.id,
      targetHealth: Math.max(0, target.health)
    });

    if (target.health <= 0) {
      target.health = 0;
      target.isDead = true;
      target.deaths++;
      attacker.kills++;
      if (isHeadshot) attacker.headshots++;

      io.emit('playerDied', {
        victimId: target.id,
        victimName: target.name,
        killerId: attacker.id,
        killerName: attacker.name,
        weaponId: weaponKey,
        isHeadshot: isHeadshot
      });

      emitLobbyStats();
    } else {
      io.emit('playerDamaged', {
        id: target.id,
        health: target.health,
        damage: damage,
        attackerId: attacker.id
      });
    }
  });

  // Respawn request
  socket.on('requestRespawn', () => {
    const p = players[socket.id];
    if (!p) return;

    p.health = MAX_HP;
    p.isDead = false;
    p.position = pickSpawn();
    lastMoveAt[socket.id] = 0;

    io.emit('playerRespawned', {
      id: socket.id,
      position: p.position,
      health: p.health
    });
    emitLobbyStats();
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Combatant departed: ${socket.id}`);
    delete players[socket.id];
    delete lastMoveAt[socket.id];
    delete lastShotAt[socket.id];
    io.emit('playerLeft', socket.id);
    emitLobbyStats();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  VELOCITY ARENA AUTHORITATIVE ENGINE ONLINE  `);
  console.log(`  Listening on port ${PORT}                   `);
  console.log(`===============================================`);
});
