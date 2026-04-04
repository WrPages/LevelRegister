import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder
} from "discord.js";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
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

// =============================
// 🧬 EVOLUCIÓN + GIF
// =============================
function getPokemonData(totalXP) {
  const stages = [
    {
      name: "Huevo",
      min: 0,
      max: 400,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/charmander.gif",
    },
    {
      name: "Fase 1",
      min: 400,
      max: 800,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/bulbasaur.gif",
    },
    {
      name: "Fase 2",
      min: 800,
      max: 1200,
      gif: "https://media.githubusercontent.com/media/WrPages/PokeGif/main/ivysaur.gif",
    },
    {
      name: "Final",
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
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();
  startLoop();
  startBackupLoop();
});

// =============================
// 🎴 PROFILE → CANVAS + HILO
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

  const { gif, progress } = getPokemonData(totalXP);

  // =============================
  // 🎴 CANVAS
  // =============================
  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext("2d");

  const background = await loadImage("./assets/card.png");
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // Nombre
  ctx.font = "bold 40px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(s.name, 40, 70);

  // Nivel
  ctx.font = "28px Arial";
  ctx.fillStyle = "#00ffcc";
  ctx.fillText(`Lv ${level}`, 750, 70);

  // Stats
  ctx.font = "24px Arial";

  ctx.fillStyle = "#00ffcc";
  ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 150);

  ctx.fillStyle = "#ffaa00";
  ctx.fillText(`Tiempo: ${totalTime}m`, 40, 190);

  ctx.fillStyle = "#ff66ff";
  ctx.fillText(`GP: ${t.gp || 0}`, 40, 230);

  // Barra progreso
  ctx.fillStyle = "#222";
  ctx.fillRect(300, 200, 500, 20);

  ctx.fillStyle = "#00ff99";
  ctx.fillRect(300, 200, 500 * progress, 20);

  const attachment = new AttachmentBuilder(
    canvas.toBuffer(),
    { name: "card.png" }
  );

  // =============================
  // 📤 ENVIAR CANVAS
  // =============================
  const sent = await msg.channel.send({
    files: [attachment]
  });

  // =============================
  // 🧵 CREAR HILO
  // =============================
  const thread = await sent.startThread({
    name: `GIF - ${s.name}`,
    autoArchiveDuration: 1440,
  });

  // =============================
  // 🎥 EMBED SOLO GIF
  // =============================
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setImage(gif);

  await thread.send({
    embeds: [embed]
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
  }, 3000);
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
