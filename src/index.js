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
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();
  await findOrCreateMessage();

  startLoop();
});

// =============================
// DEBUG GLOBAL (CLAVE)
// =============================
client.on("messageCreate", async (msg) => {

  console.log("📩 MENSAJE DETECTADO");
  console.log("Canal:", msg.channel.id);
  console.log("Autor:", msg.author?.tag);
  console.log("Contenido RAW:", msg.content);
  console.log("Embeds:", msg.embeds?.length);

  // 🔥 IMPORTANTE: permite mensajes de bots/webhooks
  if (msg.channel.id != process.env.HEARTBEAT_CHANNEL_ID) return;

  console.log("✅ ES HEARTBEAT");

  const content = buildFullContent(msg);

  console.log("📦 CONTENIDO PROCESADO:");
  console.log(content);

  if (!content) return;

  const lines = content.split("\n");
  const name = lines[0]?.trim();

  console.log("👤 Nombre detectado:", name);

  const onlineLine = lines.find(l =>
    l.toLowerCase().includes("online")
  );

  console.log("📡 Línea online:", onlineLine);

  if (!onlineLine) return;

  let instances = 0;
  const value = onlineLine.split(":")[1]?.trim();

  if (value && value.toLowerCase() !== "none") {
    instances = value.split(",").length;
  }

  console.log("🧩 Instancias:", instances);

  const normalize = (s) => s?.toLowerCase().trim();

  const matched = Object.entries(eliteUsers).find(
    ([_, user]) => normalize(user.name) === normalize(name)
  );

  console.log("🎯 MATCH:", matched);

  if (!matched) return;

  const [discordId] = matched;

  if (!liveTracker[discordId]) {
    liveTracker[discordId] = {
      sessionXP: 0,
      sessionTime: 0,
      instances: 0,
      lastSeen: Date.now()
    };
  }

  liveTracker[discordId].instances = instances;
  liveTracker[discordId].lastSeen = Date.now();

  if (!trackingData[discordId]) {
    trackingData[discordId] = { xp: 0, time: 0, gp: 0 };
  }
});

// =============================
// LOOP SIMPLE
// =============================
function startLoop() {
  setInterval(() => {

    for (const id in liveTracker) {
      const user = liveTracker[id];

      if (Date.now() - user.lastSeen > 30000) {
        user.instances = 0;
        continue;
      }

      if (user.instances > 0) {
        user.sessionTime += 1;
        user.sessionXP += 0.05;
      }
    }

    updateLiveMessage();

  }, 1000);
}

// =============================
async function updateLiveMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.messages.fetch(liveMessageId);

  let content = "🔥 TRACKING EN VIVO\n\n";

  for (const id in liveTracker) {
    const u = liveTracker[id];

    content += `<@${id}> | ⏱ ${u.sessionTime}s | XP ${u.sessionXP.toFixed(2)}\n`;
  }

  await msg.edit(content);
}

// =============================
async function findOrCreateMessage() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.send("Iniciando...");
  liveMessageId = msg.id;
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
    trackingData[k].gp = Number(trackingData[k].gp) || 0;
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
}

function buildFullContent(message) {
  let content = message.content;

  if (!content && message.embeds?.length > 0) {
    const e = message.embeds[0];
    content = [
      e.title,
      e.description,
      ...(e.fields?.map(f => `${f.name}: ${f.value}`) || [])
    ]
      .filter(Boolean)
      .join("\n");
  }

  return content;
}

client.login(process.env.DISCORD_TOKEN);
