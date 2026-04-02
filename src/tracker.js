let client;
let STATS_CHANNEL_ID;
let saveToGist;
let trackingData;

let liveMessageId = null;

const liveTracker = {};

// =============================
// INIT
// =============================
export function initTracker(discordClient, statsChannelId, saveFn, trackingObj) {
  client = discordClient;
  STATS_CHANNEL_ID = statsChannelId;
  saveToGist = saveFn;
  trackingData = trackingObj;

  startSecondLoop();
  startTenMinuteBackup();
}

// =============================
// CREAR MENSAJE LIVE
// =============================
export async function createLiveMessage() {
  const channel = await client.channels.fetch(STATS_CHANNEL_ID);
  const msg = await channel.send("🔥 Inicializando tracker...");
  liveMessageId = msg.id;
}

// =============================
// ACTUALIZAR INSTANCIAS
// =============================
export function updateUserInstances(discordId, instances) {
  if (!liveTracker[discordId]) {
    liveTracker[discordId] = {
      seconds: 0,
      instances: 0,
      boostUntil: 0
    };
  }

  liveTracker[discordId].instances = instances;

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
// LOOP CADA 1 SEGUNDO
// =============================
function startSecondLoop() {
  setInterval(() => {
    for (const userId in liveTracker) {
      const user = liveTracker[userId];

      if (user.instances > 0) {
        user.seconds++;

        if (user.seconds >= 60) {
          user.seconds = 0;

          // 🔥 SUMA DIRECTO AL TRACKING REAL
          trackingData[userId].time += 1;

          let xpGain = 2 + (user.instances * 0.5); // más competitivo

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
// RESPALDO CADA 10 MIN
// =============================
function startTenMinuteBackup() {
  setInterval(async () => {
    await saveToGist(trackingData);
    console.log("💾 Backup automático (10 min)");
  }, 10 * 60 * 1000);
}

// =============================
// ACTUALIZAR MENSAJE DISCORD
// =============================
async function updateLiveMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(STATS_CHANNEL_ID);
  const message = await channel.messages.fetch(liveMessageId);

  let content = "🔥 **LIVE TRACKER**\n\n";

  const sortedUsers = Object.entries(trackingData)
    .sort((a, b) => b[1].xp - a[1].xp);

  for (const [userId, data] of sortedUsers) {
    const live = liveTracker[userId] || {};
    const boostActive =
      live.boostUntil && Date.now() < live.boostUntil ? "🚀" : "";

    content += `<@${userId}> | 🏆 XP TOTAL: ${data.xp.toFixed(1)} | ⏱ Tiempo: ${data.time}m ${boostActive}\n`;
  }

  await message.edit(content);
}
