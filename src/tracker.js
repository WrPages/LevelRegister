// tracker.js

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
  startThirtyMinuteLoop();
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
      minutes: 0,
      xpBuffer: 0,
      instances: 0,
      boostUntil: 0
    };
  }

  liveTracker[discordId].instances = instances;
}

// =============================
// ACTIVAR BOOST GP
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
          user.minutes++;

          let xpGain = 1 + (user.instances * 0.2);

          if (Date.now() < user.boostUntil) {
            xpGain *= 2;
          }

          user.xpBuffer += xpGain;
        }
      }
    }

    updateLiveMessage();
  }, 1000);
}

// =============================
// LOOP CADA 30 MIN
// =============================
function startThirtyMinuteLoop() {
  setInterval(async () => {
    for (const userId in liveTracker) {
      const user = liveTracker[userId];

      if (!trackingData[userId]) {
        trackingData[userId] = {
          xp: 0,
          time: 0,
          gp: 0
        };
      }

      if (user.minutes > 0) {
        trackingData[userId].xp += user.xpBuffer;
        trackingData[userId].time += user.minutes;

        user.minutes = 0;
        user.xpBuffer = 0;
      }
    }

    await saveToGist(trackingData);
    console.log("💾 Guardado en GIST");

  }, 30 * 60 * 1000);
}

// =============================
// ACTUALIZAR MENSAJE DISCORD
// =============================
async function updateLiveMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(STATS_CHANNEL_ID);
  const message = await channel.messages.fetch(liveMessageId);

  let content = "🔥 **LIVE TRACKER**\n\n";

  for (const userId in liveTracker) {
    const u = liveTracker[userId];

    const boostActive = Date.now() < u.boostUntil ? "🚀" : "";

    content += `<@${userId}> | ⏱ ${u.minutes}m ${u.seconds}s | ⚡ XP: ${u.xpBuffer.toFixed(2)} | 🧩 Inst: ${u.instances} ${boostActive}\n`;
  }

  await message.edit(content);
}
