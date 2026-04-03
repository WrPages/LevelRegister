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

// =============================
client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();

  await bootstrapFromHistory();
  await createMessage();

  startLoop();
  startBackupLoop();

  setInterval(async () => {
    onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  }, 60000);
});

// =============================
// 🔥 PARSEO COMPLETO HEARTBEAT
// =============================
function parseHeartbeat(content) {
  const lines = content.split("\n");

  const name = lines[0]?.trim();

  const onlineLine = lines.find(l => l.startsWith("Online:"));
  const packsLine = lines.find(l => l.includes("Packs:"));

  let instances = 0;
  let ppm = 0;
  let packs = 0;

  if (onlineLine) {
    const value = onlineLine.split(":")[1]?.trim();
    if (value && value.toLowerCase() !== "none") {
      instances = value.split(",").length;
    }
  }

  if (packsLine) {
    const match = packsLine.match(/Packs:\s*(\d+).*Avg:\s*([\d.]+)/);
    if (match) {
      packs = Number(match[1]);
      ppm = Number(match[2]);
    }
  }

  return { name, instances, ppm, packs };
}

// =============================
async function bootstrapFromHistory() {
  const channel = await client.channels.fetch(
    process.env.HEARTBEAT_CHANNEL_ID
  );

  const messages = await channel.messages.fetch({ limit: 50 });

  for (const msg of messages.values()) {

    let content = msg.content;

    if (!content && msg.embeds.length > 0) {
      const e = msg.embeds[0];
      content = `${e.title || ""}\n${e.description || ""}`;
    }

    if (!content) continue;

    const data = parseHeartbeat(content);
    if (!data.name) continue;

    const normalize = s => s?.toLowerCase().trim();

    const matched = Object.entries(eliteUsers).find(
      ([_, user]) => normalize(user.name) === normalize(data.name)
    );

    if (!matched) continue;

    const [discordId, user] = matched;

    const isOnline =
      onlineIds.includes(user.main_id) ||
      onlineIds.includes(user.sec_id);

    if (!isOnline) continue;

    liveTracker[discordId] = {
      sessionXP: 0,
      sessionTime: 0,
      instances: data.instances,
      name: data.name,
      ppm: data.ppm,
      packs: data.packs
    };
  }
}

// =============================
// LOOP
// =============================
function startLoop() {
  setInterval(() => {

    for (const [discordId, user] of Object.entries(eliteUsers)) {

      const isOnline =
        onlineIds.includes(user.main_id) ||
        onlineIds.includes(user.sec_id);

      if (!isOnline) continue;

      if (!liveTracker[discordId]) {
        liveTracker[discordId] = {
          sessionXP: 0,
          sessionTime: 0,
          instances: 1,
          name: user.name,
          ppm: 0,
          packs: 0
        };
      }

      const tracker = liveTracker[discordId];

      tracker.sessionTime += 1;

      const xpPerSecond =
        (2 + tracker.instances * 0.5) / 60;

      tracker.sessionXP += xpPerSecond;
    }

    updateMessage();

  }, 1000);
}

// =============================
// 💾 BACKUP
// =============================
function startBackupLoop() {
  setInterval(async () => {

    for (const id in liveTracker) {

      if (!trackingData[id]) {
        trackingData[id] = {
          xp: 0,
          time: 0,
          name: liveTracker[id].name,
          ppm: 0,
          packs: 0
        };
      }

      const session = liveTracker[id];

      trackingData[id].xp += session.sessionXP;
      trackingData[id].time += Math.floor(session.sessionTime / 60);

      trackingData[id].name = session.name;
      trackingData[id].ppm = session.ppm;
      trackingData[id].packs = session.packs;

      session.sessionXP = 0;
      session.sessionTime = 0;
    }

    await updateGist(process.env.GIST_TRACKING, trackingData);

    console.log("💾 Gist actualizado");

  }, 600000);
}

// =============================
// MENSAJE
// =============================
async function createMessage() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.send("🔥 Iniciando tracking...");
  liveMessageId = msg.id;
}

async function updateMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.messages.fetch(liveMessageId);

  let content = "🏆 TRACKING EN VIVO\n\n";

  for (const [id, session] of Object.entries(liveTracker)) {

    const total = trackingData[id] || {
      xp: 0,
      time: 0
    };

    const totalXP = total.xp + session.sessionXP;
    const totalTime = total.time + Math.floor(session.sessionTime / 60);

    const level = Math.floor(totalXP / 100);

    content += `👤 ${session.name}
🎖 Nivel ${level}
XP ${totalXP.toFixed(2)}
⏱ ${totalTime}m
🧩 ${session.instances}
📦 Packs: ${session.packs}
⚡ ${session.ppm} packs/min

`;
  }

  await msg.edit(content);
}

// =============================
function safeParse(data) {
  try {
    return typeof data === "object" ? data : JSON.parse(data);
  } catch {
    return {};
  }
}

function sanitizeTracking() {
  for (const k in trackingData) {
    trackingData[k].xp = Number(trackingData[k].xp) || 0;
    trackingData[k].time = Number(trackingData[k].time) || 0;
    trackingData[k].ppm = Number(trackingData[k].ppm) || 0;
    trackingData[k].packs = Number(trackingData[k].packs) || 0;
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
}

client.login(process.env.DISCORD_TOKEN);
