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
let statsChannel = null;

// =============================
// 🧬 EVOLUCIÓN PRO (USA TUS LINKS DE DISCORD CDN)
// =============================
function getPokemonData(totalXP) {
  const stages = [
    {
      name: "🥚 Huevo",
      min: 0,
      max: 400,
      color: 0xaaaaaa,
      gif: "https://media.discordapp.net/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif?ex=69d1da48&is=69d088c8&hm=648a6d824401e5249d9230ac57ce4a2a7a4d4caa319827251ac36799d674aae7&=&width=56&height=61",
    },
    {
      name: "🐣 Fase 1",
      min: 400,
      max: 800,
      color: 0x00ff99,
      gif: "https://media.discordapp.net/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif?ex=69d1da48&is=69d088c8&hm=648a6d824401e5249d9230ac57ce4a2a7a4d4caa319827251ac36799d674aae7&=&width=56&height=61",
    },
    {
      name: "🐤 Fase 2",
      min: 800,
      max: 1200,
      color: 0x0099ff,
      gif: "https://media.discordapp.net/attachments/1489832190530425014/1489832678525243554/ivysaur.gif?ex=69d1da4e&is=69d088ce&hm=aef23997bea2456dbf87d2fbe47f4aefd41717290135d88fe8ca9e34f6a23b14&=&width=105&height=83",
    },
    {
      name: "🦅 Final",
      min: 1200,
      max: Infinity,
      color: 0xffcc00,
      gif: "https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif?ex=69d1da52&is=69d088d2&hm=b9bdc9d57b7303ba9b46afaf43b64528a27cff0b0297b47347bc76aec4290063&=&width=133&height=96",
    },
  ];

  const current = stages.find(
    (s) => totalXP >= s.min && totalXP < s.max
  );

  const progress =
    current.max === Infinity
      ? 1
      : (totalXP - current.min) / (current.max - current.min);

  return { ...current, progress };
}

// =============================
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  statsChannel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();

  startLoop();
  startBackupLoop();
});

// =============================
// 🎴 PROFILE
// =============================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!profile")) return;

  let id = msg.author.id;
  if (msg.mentions.users.first()) {
    id = msg.mentions.users.first().id;
  }

  const s = liveTracker[id];
  const t = trackingData[id] || {};

  if (!s) return msg.reply("❌ Sin datos.");

  await sendCard(msg.channel, s, t);
});

// =============================
// 🃏 CREAR CARTA
// =============================
async function sendCard(channel, s, t) {
  const totalXP = (t.xp || 0) + (s.sessionXP || 0);
  const totalTime =
    (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
  const level = Math.floor(totalXP / 100);

  const evo = getPokemonData(totalXP);

  const bar =
    "▰".repeat(Math.floor(evo.progress * 10)) +
    "▱".repeat(10 - Math.floor(evo.progress * 10));

  const embed = new EmbedBuilder()
    .setColor(evo.color)
    .setTitle(`🧠 ${s.name}`)
    .setDescription(
      `✨ **${evo.name}**\n\n` +
      `📊 **Progreso**\n${bar}\n\n` +
      `🏆 **Nivel ${level}**`
    )
    .addFields(
      { name: "⚡ XP", value: `${totalXP.toFixed(0)}`, inline: true },
      { name: "⏱ Tiempo", value: `${totalTime}m`, inline: true },
      { name: "💎 GP", value: `${t.gp || 0}`, inline: true },
      { name: "🧩 Instancias", value: `${s.instances}`, inline: true },
      { name: "📦 Packs", value: `${s.packs}`, inline: true }
    )
    .setImage(evo.gif)
    .setFooter({
      text: "KyuremBot • Sistema competitivo",
    });

  await channel.send({ embeds: [embed] });
}

// =============================
// 🔁 LOOP PRINCIPAL + ENVÍO AUTO
// =============================
function startLoop() {
  // cálculo XP
  setInterval(async () => {
    onlineIds = cleanOnlineIds(
      await getGist(process.env.GIST_ONLINE)
    );

    for (const [id, user] of Object.entries(eliteUsers)) {
      const isOnline =
        onlineIds.includes(user.main_id) ||
        onlineIds.includes(user.sec_id);

      if (!isOnline) continue;

      if (!liveTracker[id]) {
        liveTracker[id] = {
          sessionXP: 0,
          sessionTime: 0,
          instances: 1,
          boostUntil: 0,
          name: user.name,
          packs: 0,
        };
      }

      const t = liveTracker[id];

      t.sessionTime += 1;

      let xp = (2 + t.instances * 0.5) / 60;

      if (Date.now() < t.boostUntil) {
        xp *= 2;
      }

      t.sessionXP += xp;
    }
  }, 1000);

  // envío visual automático
  setInterval(async () => {
    if (!statsChannel) return;

    console.log("📤 Enviando cartas...");

    try {
      const messages = await statsChannel.messages.fetch({ limit: 50 });
      await statsChannel.bulkDelete(messages, true);
    } catch {}

    for (const [id, s] of Object.entries(liveTracker)) {
      const t = trackingData[id] || {};
      await sendCard(statsChannel, s, t);
    }
  }, 15000);
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
          gp: 0,
        };
      }

      const s = liveTracker[id];

      trackingData[id].xp += s.sessionXP;
      trackingData[id].time += Math.floor(s.sessionTime / 60);

      s.sessionXP = 0;
      s.sessionTime = 0;
    }

    await updateGist(process.env.GIST_TRACKING, trackingData);
  }, 600000);
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
