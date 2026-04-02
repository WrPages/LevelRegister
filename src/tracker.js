// tracker.js

let client;
let STATS_CHANNEL_ID;
let saveToGist;
let trackingData;

let liveMessageId = null;
let secondLoop = null;
let backupLoop = null;

const liveTracker = {};

// =============================
// INIT (SOLO UNA VEZ)
// =============================
export async function initTracker(
  discordClient,
  statsChannelId,
  saveFn,
  trackingObj
) {
  // 🔥 Si ya estaba inicializado no volver a iniciar
  if (client) return;

  client = discordClient;
  STATS_CHANNEL_ID = statsChannelId;
  saveToGist = saveFn;
  trackingData = trackingObj || {};

  sanitizeTrackingData();

  await findOrCreateMessage();

  startSecondLoop();
  startBackupLoop();

  console.log("✅ Tracker inicializado correctamente");
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
async function findOrCreateMessage() {
  const channel = await client.channels.fetch(STATS_CHANNEL_ID);

  const messages = await channel.messages.fetch({ limit: 50 });

  const existing = messages.find(
    m =>
      m.author.id === client.user.id &&
      m.content?.includes("RANKING LIVE")
  );

  if (existing) {
    liveMessageId = existing.id;
    console.log("♻️ Mensaje reutilizado");
    return;
  }

  const msg = await channel.send("🏆 RANKING LIVE\nIniciando...");
  liveMessageId = msg.id;
  console.log("🆕 Mensaje creado");
}

// =============================
// ACTUALIZAR INSTANCIAS
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
  liveTracker[discordId].boostUntil = Date.now() + 3600000;
}

// =============================
// LOOP 1 SEGUNDO
// =============================
function startSecondLoop() {
  if (secondLoop) return; // 🔥 evita duplicado

  secondLoop = setInterval(() => {
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
function startBackupLoop() {
  if (backupLoop) return; // 🔥 evita duplicado

  backupLoop = setInterval(async () => {
    await saveToGist(trackingData);
    console.log("💾 Backup 10 min guardado");
  }, 600000);
}

// =============================
// ACTUALIZAR MENSAJE
// =============================
async function updateLiveMessage() {
  if (!liveMessageId) return;

  try {
    const channel = await client.channels.fetch(STATS_CHANNEL_ID);
    const message = await channel.messages.fetch(liveMessageId);

    let content = "🏆 **RANKING LIVE**\n\n";

    const sortedUsers = Object.entries(trackingData)
      .filter(([id]) => /^\d+$/.test(id))
      .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));

    for (const [userId, data] of sortedUsers) {
      const xp = Number(data.xp) || 0;
      const time = Number(data.time) || 0;

      const live = liveTracker[userId] || {};
      const instances = live.instances || 0;

      const boost =
        live.boostUntil && Date.now() < live.boostUntil ? " 🚀" : "";

      content += `<@${userId}> | XP: ${xp.toFixed(1)} | ⏱ ${time}m | 🧩 ${instances}${boost}\n`;
    }

    if (sortedUsers.length === 0) {
      content += "Sin actividad aún.";
    }

    await message.edit(content);

  } catch (err) {
    console.log("⚠️ No se pudo editar mensaje (reintentará)");
  }
}
