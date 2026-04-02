import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

// =============================
// VALIDACIÓN ENV
// =============================
const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "GP_CHANNEL_ID",
  "HEARTBEAT_CHANNEL_ID",
  "STATS_CHANNEL_ID",
  "GIST_USERS",
  "GIST_ONLINE",
  "GIST_TRACKING"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Falta variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =============================
// DATA GLOBAL
// =============================
let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};
let liveMessageId = null;

let secondLoop = null;
let backupLoop = null;

// =============================
// READY
// =============================
client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    eliteUsers = JSON.parse(await getGist(process.env.GIST_USERS));

    onlineIds = cleanOnlineIds(
      await getGist(process.env.GIST_ONLINE)
    );

    const trackingRaw = await getGist(process.env.GIST_TRACKING);
    trackingData = trackingRaw ? JSON.parse(trackingRaw) : {};

  } catch (err) {
    console.error("❌ Error cargando Gists:", err.message);
  }

  sanitizeTracking();
  await findOrCreateMessage();

  startSecondLoop();
  startBackupLoop();

  setInterval(async () => {
    onlineIds = cleanOnlineIds(
      await getGist(process.env.GIST_ONLINE)
    );
  }, 60000);
});

// =============================
// MENSAJES
// =============================
client.on("messageCreate", async (msg) => {

  // HEARTBEAT
  if (msg.channel.id === process.env.HEARTBEAT_CHANNEL_ID) {

    const content = buildFullContent(msg);
    if (!content) return;

    const lines = content.split("\n");
    const name = lines[0]?.trim();
    if (!name) return;

    const onlineLine = lines.find(l =>
      l.toLowerCase().includes("online")
    );

    if (!onlineLine) return;

    let instances = 0;
    const value = onlineLine.split(":")[1]?.trim();

    if (value && value.toLowerCase() !== "none") {
      instances = value.split(",").length;
    }

    const matched = Object.entries(eliteUsers).find(
      ([discordId, user]) =>
        user.name?.toLowerCase() === name.toLowerCase() &&
        onlineIds.includes(user.main_id)
    );

    if (!matched) return;

    const [discordId] = matched;

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

  // GP
  if (msg.channel.id === process.env.GP_CHANNEL_ID) {

    const content = buildFullContent(msg);
    if (!content) return;

    const name = content.split("\n")[0].trim();

    const matched = Object.entries(eliteUsers).find(
      ([discordId, user]) =>
        user.name?.toLowerCase() === name.toLowerCase()
    );

    if (!matched) return;

    const [discordId] = matched;

    if (!liveTracker[discordId]) return;

    liveTracker[discordId].boostUntil =
      Date.now() + 3600000;
  }
});

// =============================
// LOOP XP
// =============================
function startSecondLoop() {
  if (secondLoop) return;

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
  if (backupLoop) return;

  backupLoop = setInterval(async () => {
    await updateGist(process.env.GIST_TRACKING, trackingData);
    console.log("💾 Backup guardado");
  }, 600000);
}

// =============================
// MENSAJE LIVE
// =============================
async function findOrCreateMessage() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const messages = await channel.messages.fetch({ limit: 50 });

  const existing = messages.find(
    m =>
      m.author.id === client.user.id &&
      m.content.includes("RANKING LIVE")
  );

  if (existing) {
    liveMessageId = existing.id;
    return;
  }

  const msg = await channel.send("🏆 RANKING LIVE\nIniciando...");
  liveMessageId = msg.id;
}

async function updateLiveMessage() {
  if (!liveMessageId) return;

  try {
    const channel = await client.channels.fetch(
      process.env.STATS_CHANNEL_ID
    );

    const message = await channel.messages.fetch(liveMessageId);

    let content = "🏆 **RANKING LIVE**\n\n";

    const sorted = Object.entries(trackingData)
      .sort((a, b) => (b[1].xp || 0) - (a[1].xp || 0));

    for (const [userId, data] of sorted) {
      const xp = Number(data.xp) || 0;
      const time = Number(data.time) || 0;

      const live = liveTracker[userId] || {};
      const instances = live.instances || 0;

      const boost =
        live.boostUntil && Date.now() < live.boostUntil
          ? " 🚀"
          : "";

      content += `<@${userId}> | XP ${xp.toFixed(
        1
      )} | ⏱ ${time}m | 🧩 ${instances}${boost}\n`;
    }

    await message.edit(content);

  } catch {}
}

// =============================
function sanitizeTracking() {
  for (const key in trackingData) {
    trackingData[key].xp = Number(trackingData[key].xp) || 0;
    trackingData[key].time = Number(trackingData[key].time) || 0;
    trackingData[key].gp = Number(trackingData[key].gp) || 0;
  }
}

function cleanOnlineIds(raw) {
  return raw
    .split("\n")
    .map(id => id.trim())
    .filter(Boolean);
}

function buildFullContent(message) {
  let content = message.content;

  if (!content && message.embeds?.length > 0) {
    const embed = message.embeds[0];

    content = [
      embed.title,
      embed.description,
      ...(embed.fields?.map(f => `${f.name}: ${f.value}`) || [])
    ]
      .filter(Boolean)
      .join("\n");
  }

  return content;
}

client.login(process.env.DISCORD_TOKEN);
