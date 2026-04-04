import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder
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
// 🧬 EVOLUCIÓN
// =============================
function getPokemonData(totalXP) {
  const stages = [
    {
      name: "🥚 Huevo",
      min: 0,
      max: 400,
      gif: "TU_GIF_1",
    },
    {
      name: "🐣 Fase 1",
      min: 400,
      max: 800,
      gif: "TU_GIF_2",
    },
    {
      name: "🐤 Fase 2",
      min: 800,
      max: 1200,
      gif: "TU_GIF_3",
    },
    {
      name: "🦅 Final",
      min: 1200,
      max: Infinity,
      gif: "TU_GIF_4",
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

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();

  startLoop();
});

// =============================
// 🎴 PROFILE
// =============================
client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("!profile")) return;

  const id = msg.author.id;

  const s = liveTracker[id];
  const t = trackingData[id] || {};

  if (!s) return msg.reply("❌ Sin datos.");

  await sendCard(msg.channel, s, t);
});

// =============================
// 🃏 CANVAS CARD
// =============================
async function sendCard(channel, s, t) {
  const totalXP = (t.xp || 0) + (s.sessionXP || 0);
  const totalTime =
    (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
  const level = Math.floor(totalXP / 100);

  const evo = getPokemonData(totalXP);

  const canvas = createCanvas(500, 700);
  const ctx = canvas.getContext("2d");

  // fondo
  const background = await loadImage("./assets/card.png");
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // nombre
  ctx.font = "30px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(s.name, 40, 60);

  // nivel
  ctx.font = "20px Arial";
  ctx.fillText(`Nivel: ${level}`, 40, 100);

  // stats
  ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 140);
  ctx.fillText(`Tiempo: ${totalTime}m`, 40, 180);
  ctx.fillText(`GP: ${t.gp || 0}`, 40, 220);

  // barra progreso
  ctx.fillStyle = "#444";
  ctx.fillRect(40, 260, 400, 20);

  ctx.fillStyle = "#00ff99";
  ctx.fillRect(40, 260, 400 * evo.progress, 20);

  // texto evolución
  ctx.fillStyle = "#fff";
  ctx.fillText(evo.name, 40, 320);

  const attachment = new AttachmentBuilder(
    canvas.toBuffer(),
    { name: "card.png" }
  );

  const embed = new EmbedBuilder()
    .setTitle(`🧠 ${s.name}`)
    .setImage(evo.gif) // GIF animado
    .setColor(0x00ff99);

  await channel.send({
    embeds: [embed],
    files: [attachment],
  });
}

// =============================
function startLoop() {
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
