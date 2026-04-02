// tracker.js

let client;
let STATS_CHANNEL_ID;
let saveToGist;
let trackingData;

let liveMessage = null;
let loopsStarted = false;

const liveTracker = {};

// =============================
// INIT
// =============================
export function initTracker(discordClient, statsChannelId, saveFn, trackingObj) {
  client = discordClient;
  STATS_CHANNEL_ID = statsChannelId;
  saveToGist = saveFn;
  trackingData = trackingObj || {};

  sanitizeTrackingData();

  if (!loopsStarted) {
    loopsStarted = true;
    startSecondLoop();
    startTenMinuteBackup();
  }
}

// =============================
// LIMPIAR DATA
// =============================
function sanitizeTrackingData() {
  for (const key in trackingData) {
    if (!/^\d+$/.test(key)) {
      delete trackingData[key];
      continue;
    }

    trackingData[key].xp = Number(trackingData[key].xp) || 0;
    trackingData[key].time = Number(trackingData[key].time) || 0;
    trackingData[key].gp = Number(trackingData[key].gp) || 0;
  }
}

// =============================
// BUSCAR O CREAR MENSAJE
// =============================
export async function createLiveMessage() {
  const channel = await client.channels.fetch(STATS_CHANNEL_ID);

  const messages = await channel.messages.fetch({ limit: 20 });

  const existing = messages.find(
    m => m.author.id === client.user.id
  );

  if (existing) {
    liveMessage = existing;
    return;
  }

  liveMessage = await channel.send("🏆 Iniciando tracker...");
}

// =============================
// UPDATE INSTANCIAS
// =============================
export function updateUserInstances(discordId, instances) {
  if (!discordId) return;

  if (!liveTracker[discordId]) {
    liveTracker[discordId] = {
      seconds: 0,
      instances: 0,
      boostUntil: 0
    };
  }

  liveTracker[discordId].instances = instances || 0;

  if (!trackingData[discordId]) {
    trackingData[discordId] = {
      xp: 0,
      time: 0,
      gp: 0
    };
  }
}

// =============================
// BOOST
// =============================
export function activateBoost(discordId) {
  if (!liveTracker[discordId]) return;
  liveTracker[discordId].boostUntil = Date.now() + (60 * 60 * 1000);
}

// =============================
// LOOP 1 SEGUNDO
// =============================
function startSecondLoop() {
  setInterval(() => {
    for (const userId in liveTracker) {
      const user = liveTracker[userId];

      if (!trackingData[userId]) continue;

      if (user.instances > 0) {
        user.seconds++;

        if (user.seconds >= 60) {
          user.seconds = 0;

          trackingData[userId].time += 1;

          let xpGain = 2 + (user.instances * 0.5);

          if (Date.now() < user.boostUntil) {
            xpGain *= 2;
          }

          trackingData[userId].xp += xpGain;
        }
      }
    }

    updateLiveMessage();
  }, 1000);
}

// =============================
// BACKUP 10 MIN
// =============================
function startTenMinuteBackup() {
  setInterval(async () => {
    await saveToGist(trackingData);
    console.log("💾 Backup 10 min");
  }, 10 * 60 * 1000);
}

// =============================
// ACTUALIZAR MENSAJE
// =============================
async function updateLiveMessage() {
  if (!liveMessage) return;

  let content = "🏆 **RANKING LIVE**\n\n";

  const sortedUsers = Object.entries(trackingData)
    .filter(([userId]) => /^\d+$/.test(userId))
    .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));

  for (const [userId, data] of sortedUsers) {
    const xp = Number(data.xp) || 0;
    const time = Number(data.time) || 0;

    const live = liveTracker[userId] || {};
    const instances = live.instances || 0;

    const boostActive =
      live.boostUntil && Date.now() < live.boostUntil ? " 🚀" : "";

    content += `<@${userId}> | XP: ${xp.toFixed(1)} | ⏱ ${time}m | 🧩 ${instances}${boostActive}\n`;
  }

  if (sortedUsers.length === 0) {
    content += "Sin actividad aún.";
  }

  await liveMessage.edit(content);
}
