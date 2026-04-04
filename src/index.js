import {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =============================
let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};
let liveMessageId = null;

// =============================
// 🧬 EVOLUCIÓN + GIF (FIX REAL)
// =============================
function getPokemonData(totalXP) {
  const stages = [
    {
      name: "🥚 Huevo",
      min: 0,
      max: 400,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/charmander.gif",
    },
    {
      name: "🐣 Fase 1",
      min: 400,
      max: 800,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/bulbasaur.gif",
    },
    {
      name: "🐤 Fase 2",
      min: 800,
      max: 1200,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/ivysaur.gif",
    },
    {
      name: "🦅 Final",
      min: 1200,
      max: Infinity,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/venusaur.gif",
    },
  ];

  const current = stages.find(
    (s) => totalXP >= s.min && totalXP < s.max
  );

  const progress =
    current.max === Infinity
      ? 1
      : (totalXP - current.min) / (current.max - current.min);

  return {
    stage: current.name,
    gif: current.gif,
    progress,
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
});

// =============================
// 🎴 PROFILE (FIX TOTAL)
// =============================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!profile")) return;

  let targetId = msg.author.id;

  if (msg.mentions.users.first()) {
    targetId = msg.mentions.users.first().id;
  }

  const s = liveTracker[targetId];
  const t = trackingData[targetId] || {};

  if (!s) return msg.reply("❌ Usuario sin datos.");

  const totalXP = (t.xp || 0) + (s.sessionXP || 0);
  const totalTime =
    (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
  const level = Math.floor(totalXP / 100);

  const { stage, gif, progress } = getPokemonData(totalXP);

  const bar =
    "🟩".repeat(Math.floor(progress * 10)) +
    "⬛".repeat(10 - Math.floor(progress * 10));

  const embed = new EmbedBuilder()
    .setColor(0x00ff99)
    .setTitle(`🧠 ${s.name}`)
    .setDescription(`🧬 **${stage}**\n${bar}`)
    .addFields(
      { name: "🎖 Nivel", value: `${level}`, inline: true },
      { name: "📈 XP", value: `${totalXP.toFixed(0)}`, inline: true },
      { name: "⏱ Tiempo", value: `${totalTime}m`, inline: true },
      { name: "🧩 Instancias", value: `${s.instances}`, inline: true },
      { name: "📦 Packs", value: `${s.packs}`, inline: true },
      { name: "💎 GP", value: `${t.gp || 0}`, inline: true }
    )
    .setImage(gif); // 🔥 AQUÍ FUNCIONA EL GIF

  return msg.channel.send({
    embeds: [embed],
  });
});

// =============================
function startLoop() {
  setInterval(async () => {
    onlineIds = cleanOnlineIds(
      await getGist(process.env.GIST_ONLINE)
    );

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
          packs: 0,
        };
      }

      const t = liveTracker[discordId];

      t.sessionTime += 1;

      let xpPerSecond =
        (2 + t.instances * 0.5) / 60;

      if (Date.now() < t.boostUntil) {
        xpPerSecond *= 2;
      }

      t.sessionXP += xpPerSecond;
    }

    updateMessage();
  }, 3000);
}

// =============================
async function updateMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.messages.fetch(liveMessageId);

  const embeds = [];

  for (const [id, s] of Object.entries(liveTracker)) {
    const t = trackingData[id] || {};

    const totalXP = (t.xp || 0) + s.sessionXP;
    const totalTime =
      (t.time || 0) +
      Math.floor((s.sessionTime || 0) / 60);

    const level = Math.floor(totalXP / 100);

    const { gif } = getPokemonData(totalXP);

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle(`🧠 ${s.name}`)
      .setDescription(`🎖 Nivel ${level}`)
      .addFields(
        { name: "XP", value: `${totalXP.toFixed(0)}`, inline: true },
        { name: "Tiempo", value: `${totalTime}m`, inline: true },
        { name: "GP", value: `${t.gp || 0}`, inline: true }
      )
      .setImage(gif); // 🔥 GIF TAMBIÉN AQUÍ

    embeds.push(embed);

    if (embeds.length >= 10) break;
  }

  await msg.edit({
    content: "🏆 TRACKING EN VIVO",
    embeds,
  });
}

// =============================
async function createMessage() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.send("🔥 Iniciando tracking...");
  liveMessageId = msg.id;
}

// =============================
function safeParse(data) {
  try {
    return typeof data === "object"
      ? data
      : JSON.parse(data);
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

client.login(process.env.DISCORD_TOKEN);
