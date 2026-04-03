import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =============================
let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};
let liveMessageId = null;

let secondLoop = null;
let backupLoop = null;

// =============================
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
    onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
    trackingData = safeParse(await getGist(process.env.GIST_TRACKING));
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
client.on("messageCreate", async (msg) => {

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

    const normalize = (str) =>
      str?.toLowerCase().trim();

    const matched = Object.entries(eliteUsers).find(
      ([discordId, user]) =>
        normalize(user.name) === normalize(name)
    );

    if (!matched) return;

    const [discordId, user] = matched;

    const isOnline =
      onlineIds.includes(user.main_id) ||
      onlineIds.includes(user.sec_id);

    if (!isOnline) return;

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
  // GP BOOST
  // =============================
  if (msg.channel.id === process.env.GP_CHANNEL_ID) {

    const content = buildFullContent(msg);
    if (!content) return;

    const name = content.split("\n")[0].trim();

    const normalize = (str) =>
      str?.toLowerCase().trim();

    const matched = Object.entries(eliteUsers).find(
      ([discordId, user]) =>
        normalize(user.name) === normalize(name)
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
// BACKUP
// =============================
function startBackupLoop() {
  if (backupLoop) return;

  backupLoop = setInterval(async () => {
    await updateGist(process.env.GIST_TRACKING, trackingData);
    console.log("💾 Backup guardado");
  }, 600000);
}

// =============================
// MENSAJE LIVE (AQUÍ ESTÁ EL FIX REAL)
// =============================
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
      const xpBase = Number(data.xp) || 0;
      const time = Number(data.time) || 0;

      const live = liveTracker[userId] || {};
      const instances = live.instances || 0;
      const seconds = live.seconds || 0;

      let xpPreview = 0;

      if (instances > 0) {
        let xpPerMinute = 2 + (instances * 0.5);

        if (Date.now() < live.boostUntil) {
          xpPerMinute *= 2;
        }

        xpPreview = (xpPerMinute / 60) * seconds;
      }

      const totalXP = xpBase + xpPreview;

      const boost =
        live.boostUntil && Date.now() < live.boostUntil
          ? " 🚀"
          : "";

      content += `<@${userId}> | XP ${totalXP.toFixed(2)} | ⏱ ${time}m | 🧩 ${instances}${boost}\n`;
    }

    await message.edit(content);

  } catch (err) {
    console.error("❌ Error actualizando mensaje:", err.message);
  }
}

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

// =============================
function safeParse(data) {
  if (!data) return {};
  if (typeof data === "object") return data;

  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function sanitizeTracking() {
  if (typeof trackingData !== "object") trackingData = {};

  for (const key in trackingData) {
    if (typeof trackingData[key] !== "object") {
      trackingData[key] = { xp: 0, time: 0, gp: 0 };
    }

    trackingData[key].xp = Number(trackingData[key].xp) || 0;
    trackingData[key].time = Number(trackingData[key].time) || 0;
    trackingData[key].gp = Number(trackingData[key].gp) || 0;
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
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
