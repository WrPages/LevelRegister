



import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
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
// 🧬 EVOLUCIÓN + GIF
// =============================
function getPokemonData(totalXP) {

  const stages = [
    {
      name: "🥚 Huevo",
      min: 0,
      max: 400,
      gif: "https://raw.githubusercontent.com/WrPages/PokeGif/refs/heads/main/charmander.gif"
    },
    {
      name: "🐣 Fase 1",
      min: 400,
      max: 800,
      gif: "https://raw.githubusercontent.com/WrPages/PokeGif/refs/heads/main/bulbasaur.gif"
      
    },
    {
      name: "🐤 Fase 2",
      min: 800,
      max: 1200,
      gif: "https://raw.githubusercontent.com/WrPages/PokeGif/refs/heads/main/ivysaur.gif"
    },
    {
      name: "🦅 Fase Final",
      min: 1200,
      max: Infinity,
      gif: "https://raw.githubusercontent.com/WrPages/PokeGif/refs/heads/main/venusaur.gif"
    }
  ];

  const current = stages.find(s => totalXP >= s.min && totalXP < s.max);

  const progress = current.max === Infinity
    ? 1
    : (totalXP - current.min) / (current.max - current.min);

  return {
    stage: current.name,
    gif: current.gif,
    progress
  };
}

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
// 🧠 COMANDOS + GP
// =============================
client.on("messageCreate", async (msg) => {

  // =============================
  // 🧠 PERFIL
  // =============================
  if (msg.content.startsWith("!profile")) {

    let targetId = msg.author.id;

    if (msg.mentions.users.first()) {
      targetId = msg.mentions.users.first().id;
    }

    const s = liveTracker[targetId];
    const t = trackingData[targetId] || {};

    if (!s) return msg.reply("❌ Usuario sin datos.");

    const totalXP = (t.xp || 0) + (s.sessionXP || 0);
    const totalTime = (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
    const level = Math.floor(totalXP / 100);

    const { stage, gif, progress } = getPokemonData(totalXP);

    const progressBar = "🟩".repeat(Math.floor(progress * 10)) +
                        "⬛".repeat(10 - Math.floor(progress * 10));

    const embed = new EmbedBuilder()
      .setTitle(`🧠 ${s.name}`)
      .setDescription(`
🎖 **Nivel:** ${level}
📈 **XP:** ${totalXP.toFixed(2)}

⏱ **Tiempo:** ${totalTime}m
🧩 **Instancias:** ${s.instances}
📦 **Packs:** ${s.packs}
💎 **GP:** ${t.gp}

🧬 **Evolución:** ${stage}
${progressBar}
`)
      .setImage(gif + "?v=" + Date.now()) // 🔥 GIF ANIMADO
      .setColor(0x00AE86);

    return msg.channel.send({ embeds: [embed] });
  }

  // =============================
  // 🔥 DETECTOR GP
  // =============================
  if (msg.channel.id !== process.env.GP_CHANNEL_ID) return;

  let content = msg.content;

  if (!content && msg.embeds.length > 0) {
    const e = msg.embeds[0];
    content = `${e.title || ""}\n${e.description || ""}`;
  }

  if (!content || !content.includes("God Pack found")) return;

  const firstLine = content.split("\n")[0];
  const normalize = s => s?.toLowerCase().trim();

  let discordId = null;

  const mentionMatch = firstLine.match(/<@!?(\d+)>/);
  if (mentionMatch && eliteUsers[mentionMatch[1]]) {
    discordId = mentionMatch[1];
  }

  if (!discordId) {
    const rawName = firstLine.replace("@", "").split(" ")[0];

    const matched = Object.entries(eliteUsers).find(
      ([_, user]) =>
        normalize(user.name) === normalize(rawName)
    );

    if (matched) discordId = matched[0];
  }

  if (!discordId) return;

  if (!trackingData[discordId]) {
    trackingData[discordId] = {
      xp: 0,
      time: 0,
      name: "Unknown",
      packs: 0,
      gp: 0
    };
  }

  if (!liveTracker[discordId]) {
    liveTracker[discordId] = {
      sessionXP: 0,
      sessionTime: 0,
      instances: 1,
      boostUntil: 0,
      name: trackingData[discordId].name,
      packs: 0
    };
  }

  trackingData[discordId].xp += 1000;
  trackingData[discordId].gp += 1;
  liveTracker[discordId].boostUntil = Date.now() + 3600000;

  await updateGist(process.env.GIST_TRACKING, trackingData);
});

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
          boostUntil: 0,
          name: user.name,
          packs: 0
        };
      }

      const t = liveTracker[discordId];

      t.sessionTime += 1;

      let xpPerSecond = (2 + t.instances * 0.5) / 60;

      if (Date.now() < t.boostUntil) {
        xpPerSecond *= 2;
      }

      t.sessionXP += xpPerSecond;
    }

    updateMessage();

  }, 1000);
}

// =============================
function startBackupLoop() {
  setInterval(async () => {

    for (const id in liveTracker) {

      if (!trackingData[id]) {
        trackingData[id] = {
          xp: 0,
          time: 0,
          name: liveTracker[id].name,
          packs: 0,
          gp: 0
        };
      }

      const s = liveTracker[id];

      trackingData[id].xp += s.sessionXP;
      trackingData[id].time += Math.floor(s.sessionTime / 60);
      trackingData[id].name = s.name;
      trackingData[id].packs = s.packs;

      s.sessionXP = 0;
      s.sessionTime = 0;
    }

    await updateGist(process.env.GIST_TRACKING, trackingData);

  }, 600000);
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
      boostUntil: 0,
      name: data.name,
      packs: data.packs
    };
  }
}

// =============================
function parseHeartbeat(content) {
  const lines = content.split("\n");

  const name = lines[0]?.trim();
  const onlineLine = lines.find(l => l.startsWith("Online:"));
  const packsLine = lines.find(l => l.includes("Packs:"));

  let instances = 0;
  let packs = 0;

  if (onlineLine) {
    const value = onlineLine.split(":")[1]?.trim();
    if (value && value.toLowerCase() !== "none") {
      instances = value.split(",").length;
    }
  }

  if (packsLine) {
    const match = packsLine.match(/Packs:\s*(\d+)/);
    if (match) packs = Number(match[1]);
  }

  return { name, instances, packs };
}

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

  for (const [id, s] of Object.entries(liveTracker)) {

    const t = trackingData[id] || { xp: 0, gp: 0 };
    const totalXP = t.xp + s.sessionXP;
    const level = Math.floor(totalXP / 100);

    content += `👤 ${s.name}
🎖 Nivel ${level}
XP ${totalXP.toFixed(2)}
💎 GP: ${t.gp}

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
    trackingData[k].packs = Number(trackingData[k].packs) || 0;
    trackingData[k].gp = Number(trackingData[k].gp) || 0;
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
}

client.login(process.env.DISCORD_TOKEN);
