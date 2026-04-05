import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

// =============================
// 🔤 FUENTE
// =============================
const fontPath = path.join(process.cwd(), "assets/fonts/Righteous-Regular.ttf");

if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: "Righteous" });
}

// =============================
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
let userPanels = {};
let userSettings = {};

// =============================
// 🎨 COLORES HUMANOS
// =============================
const colorMap = {
  rojo: "#ff0000",
  verde: "#00ff00",
  azul: "#0099ff",
  amarillo: "#ffff00",
  morado: "#800080",
  rosa: "#ff00ff",
  cian: "#00ffff",
  blanco: "#ffffff",
};

// =============================
function getUserRole(member) {
  const roles = member.roles.cache;

  if (roles.some(r => r.name === "Champion"))
    return { name: "Champion", color: "#FFD700", isChampion: true };

  if (roles.some(r => r.name === "Elite_Four"))
    return { name: "Elite Four", color: "#800080" };

  if (roles.some(r => r.name === "Gym_Leader"))
    return { name: "Gym Leader", color: "#0099ff" };

  if (roles.some(r => r.name === "Trainer"))
    return { name: "Trainer", color: "#00ff00" };

  return { name: "Reroller", color: "#aaaaaa" };
}

// =============================
function getPokemonData(totalXP) {
  const stages = [
    { name: "Huevo", min: 0, max: 400, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif" },
    { name: "Fase 1", min: 400, max: 800, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif" },
    { name: "Fase 2", min: 800, max: 1200, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832678525243554/ivysaur.gif" },
    { name: "Final", min: 1200, max: Infinity, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832694924836944/venusaur.gif" },
  ];

  const current = stages.find(s => totalXP >= s.min && totalXP < s.max);

  return current;
}

// =============================
client.once("clientReady", async () => {
  console.log(`Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();

  startLoop();
  startBackupLoop();
});

// =============================
function startLoop() {
  setInterval(async () => {
    onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));

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

      let xpPerSecond = (2 + t.instances * 0.5) / 60;
      if (Date.now() < t.boostUntil) xpPerSecond *= 2;

      t.sessionXP += xpPerSecond;
    }

    await updatePanels();
  }, 5000);
}

// =============================
async function renderPanel(id, channel) {
  const s = liveTracker[id];
  const t = trackingData[id] || {};

  if (!userSettings[id]) {
    userSettings[id] = {
      bg: null,
      nameColor: "#ffffff",
      textColor: "#ffffff",
    };
  }

  const settings = userSettings[id];

  const totalXP = (t.xp || 0) + (s.sessionXP || 0);
  const totalTime = (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
  const level = Math.floor(totalXP / 100);

  const poke = getPokemonData(totalXP);

  const member = await channel.guild.members.fetch(id).catch(() => null);
  const role = member ? getUserRole(member) : { name: "Reroller", color: "#aaa" };

  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  try {
    const bg = await loadImage(settings.bg || "./assets/card.png");
    ctx.drawImage(bg, 0, 0, 800, 450);
  } catch {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 800, 450);
  }

  ctx.fillStyle = settings.nameColor;
  ctx.font = "50px Righteous";
  ctx.fillText(s.name, 40, 80);

  ctx.fillStyle = role.color;
  ctx.font = "22px Righteous";
  ctx.fillText(role.name, 42, 110);

  ctx.fillStyle = "#00ffcc";
  ctx.font = "38px Righteous";
  ctx.fillText(`Lv ${level}`, 620, 80);

  ctx.fillStyle = "#00ffcc";
  ctx.font = "22px Righteous";
  ctx.fillText(poke.name, 620, 110);

  ctx.fillStyle = settings.textColor;
  ctx.font = "24px Righteous";

  ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 170);
  ctx.fillText(`Tiempo: ${totalTime}m`, 40, 210);
  ctx.fillText(`Instancias: ${s.instances}`, 40, 250);
  ctx.fillText(`Packs: ${s.packs}`, 40, 290);
  ctx.fillText(`GP: ${t.gp || 0}`, 40, 330);

  return {
    file: new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" }),
    gif: poke.gif
  };
}

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id] of Object.entries(liveTracker)) {
    const { file, gif } = await renderPanel(id, channel);

    if (userPanels[id]) {
      const msg = await channel.messages.fetch(userPanels[id].messageId);
      await msg.edit({ files: [file] });
      continue;
    }

    const sent = await channel.send({ files: [file] });

    const thread = await sent.startThread({
      name: `Perfil`,
      autoArchiveDuration: 1440,
    });

    await thread.send({
      content: "🎨 Comandos:\n!color nombre rojo\n!color texto azul\nSube imagen para fondo"
    });

    const embed = new EmbedBuilder().setImage(gif);
    await thread.send({ embeds: [embed] });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
  }
}

// =============================
// 🎨 COMANDOS + FONDO
// =============================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  let targetId = msg.author.id;

  const mention = msg.mentions.users.first();
  if (mention) {
    const member = await msg.guild.members.fetch(msg.author.id);
    const role = getUserRole(member);
    if (role.isChampion) targetId = mention.id;
  }

  if (!userSettings[targetId]) userSettings[targetId] = {};

  const settings = userSettings[targetId];

  // 🎨 COLOR
  if (msg.content.startsWith("!color")) {
    const [, type, colorName] = msg.content.split(" ");
    const hex = colorMap[colorName?.toLowerCase()];

    if (!hex) return msg.reply("Color no válido");

    if (type === "nombre") settings.nameColor = hex;
    if (type === "texto") settings.textColor = hex;

    await refreshPanel(targetId);
    return msg.reply("Color aplicado ✅");
  }

  // 🖼️ FONDO (FIX REAL)
  if (msg.attachments.size > 0) {
    const file = msg.attachments.first();

    if (!file.contentType?.startsWith("image/")) {
      return msg.reply("Solo imágenes válidas");
    }

    settings.bg = file.url;

    await refreshPanel(targetId);
    return msg.reply("Fondo actualizado ✅");
  }
});

// =============================
async function refreshPanel(id) {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);
  if (!userPanels[id]) return;

  const { file } = await renderPanel(id, channel);
  const msg = await channel.messages.fetch(userPanels[id].messageId);

  await msg.edit({ files: [file] });
}

// =============================
function startBackupLoop() {
  setInterval(async () => {
    for (const id in liveTracker) {
      if (!trackingData[id]) {
        trackingData[id] = { xp: 0, time: 0, name: liveTracker[id].name, packs: 0, gp: 0 };
      }

      const s = liveTracker[id];

      trackingData[id].xp += s.sessionXP;
      trackingData[id].time += Math.floor(s.sessionTime / 60);
      trackingData[id].packs = s.packs;

      s.sessionXP = 0;
      s.sessionTime = 0;
    }

    await updateGist(process.env.GIST_TRACKING, trackingData);
  }, 600000);
}

// =============================
function safeParse(data) {
  try { return typeof data === "object" ? data : JSON.parse(data); }
  catch { return {}; }
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
