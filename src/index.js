import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

// =============================
// 🛑 VALIDACIÓN ENV
// =============================
if (!process.env.GIST_SETTINGS) {
  throw new Error("❌ FALTA GIST_SETTINGS en Railway");
}

// =============================
// 🧠 FONT
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
let editState = {};
let lastManualEdit = {};

// =============================
// ⚡ CACHE DE IMÁGENES
// =============================
const imageCache = new Map();

async function loadImageCached(src) {
  try {
    if (!src) return await loadImage("./assets/card.png");

    if (imageCache.has(src)) return imageCache.get(src);

    let img;

    if (src.startsWith("http")) {
      const res = await fetch(src);
      const buffer = await res.arrayBuffer();
      img = await loadImage(Buffer.from(buffer));
    } else {
      img = await loadImage(src);
    }

    imageCache.set(src, img);

    if (imageCache.size > 50) imageCache.clear();

    return img;
  } catch (err) {
    console.error("Error cargando imagen:", err.message);
    return await loadImage("./assets/card.png");
  }
}

// =============================
// 💾 SAVE SETTINGS (DEBOUNCE)
// =============================
let saveTimeout;

function saveSettings() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    updateGist(process.env.GIST_SETTINGS,"Profiledata.json", userSettings);
  }, 2000);
}

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
    return { name: "Champion", color: "#FFD700" };

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
  return stages.find(s => totalXP >= s.min && totalXP < s.max);
}

// =============================
client.once("clientReady", async () => {
  console.log(`Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  userSettings = safeParse(await getGist(process.env.GIST_SETTINGS));

  sanitizeTracking();

  startLoop();
  startBackupLoop();
  
});

// =============================

async function runTrackingCycle() {

  console.log("⏱ Ejecutando ciclo de tracking...", new Date().toLocaleTimeString());

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

    const seconds = 60; // 5 minutos
    t.sessionTime += seconds;

    let xpPerSecond = (2 + t.instances * 0.5) / 60;
    if (Date.now() < t.boostUntil) xpPerSecond *= 2;

    t.sessionXP += xpPerSecond * seconds;
  }

  await updatePanels();
}

function startLoop() {

  // 🔥 Ejecuta inmediatamente al iniciar
  runTrackingCycle();

  // 🔁 Luego cada 5 minutos
  setInterval(runTrackingCycle, 60000);
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

  let bg;

if (settings.bg?.type === "base64") {
  const buffer = Buffer.from(settings.bg.data, "base64");
  bg = await loadImage(buffer);
} else {
  bg = await loadImageCached("./assets/card.png");
}
  ctx.drawImage(bg, 0, 0, 800, 450);

  ctx.fillStyle = settings.nameColor;
  ctx.font = "50px Righteous";
  ctx.fillText(s.name, 40, 80);

  ctx.fillStyle = role.color;
  ctx.font = "22px Righteous";
  ctx.fillText(role.name, 42, 110);

  ctx.fillStyle = "#00ffcc";
  ctx.font = "38px Righteous";
  ctx.fillText(`Lv ${level}`, 620, 80);

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
function createColorButtons(type) {

  const buttons = Object.keys(colorMap).map(name =>
    new ButtonBuilder()
      .setCustomId(`c_${type}_${name}`)
      .setEmoji(colorEmojis[name])
      .setStyle(ButtonStyle.Secondary)
  );

  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        buttons.slice(i, i + 5)
      )
    );
  }

  return rows;
}

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id] of Object.entries(liveTracker)) {

    if (lastManualEdit[id] && Date.now() - lastManualEdit[id] < 4000) continue;

    if (!liveTracker[id].sessionXP && !liveTracker[id].sessionTime) continue;

const { file, gif } = await renderPanel(id, channel);

    if (userPanels[id]) {
      const msg = await channel.messages.fetch(userPanels[id].messageId);
      await msg.edit({ files: [file] });
      continue;
    }

    const sent = await channel.send({ files: [file] });

    const thread = await sent.startThread({
      name: "Perfil",
      autoArchiveDuration: 1440,
    });

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`menu_${id}`)
        .addOptions([
          { label: "Cambiar fondo", value: "bg" },
          { label: "Color nombre", value: "name" },
          { label: "Color texto", value: "text" },
        ])
    );

    await thread.send({
      content: "🎮 Panel de personalización",
      components: [menu],
    });

    await thread.send({ embeds: [new EmbedBuilder().setImage(gif)] });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
  }
}

// =============================
// 🎮 INTERACCIONES
// =============================
client.on("interactionCreate", async (i) => {

  if (i.isStringSelectMenu()) {
const [, type, colorName] = i.customId.split("_");
const id = i.user.id;
    const option = i.values[0];

    editState[id] = option;

    if (option === "bg") {
      return i.reply({ content: "🖼️ Sube una imagen", ephemeral: true });
    }

    if (option === "name" || option === "text") {
      return i.reply({
        content: "🎨 Selecciona un color:",
        components: [createColorButtons(option)],
        ephemeral: true
      });
    }
  }

if (i.isButton()) {

  await i.deferReply({ ephemeral: true });

  const [, type, colorName] = i.customId.split("_");

  const entry = Object.entries(userPanels)
    .find(([_, data]) => data.threadId === i.channel.id);

  if (!entry) {
    return i.editReply({ content: "Panel no encontrado." });
  }

  const [id] = entry;

  if (!userSettings[id]) userSettings[id] = {};

  userSettings[id][type === "name" ? "nameColor" : "textColor"] =
    colorMap[colorName];

  saveSettings();

  await forceRender(id);

  return i.editReply({ content: "Color aplicado ✅" });
}
});
// =============================
// 🖼️ FONDO
// =============================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const entry = Object.entries(userPanels).find(
    ([id, d]) => d.threadId === msg.channel.id
  );

  if (!entry) return;

  const [id] = entry;

  if (editState[id] !== "bg") return;

  if (msg.attachments.size > 0) {
    const file = msg.attachments.first();

    if (file.url.match(/\.(png|jpg|jpeg|webp)/i)) {
      if (file.url.match(/\.(png|jpg|jpeg|webp)/i)) {

  // 🔥 Descargar imagen desde Discord
  const res = await fetch(file.url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  // 💾 Guardar en formato persistente
  userSettings[id].bg = {
    type: "base64",
    data: base64
  };

  saveSettings();

  await forceRender(id);

  return msg.reply("Fondo actualizado y guardado permanentemente ✅");
}

      saveSettings();

      await forceRender(id);

      return msg.reply("Fondo actualizado ✅");
    }
  }
});

// =============================
async function forceRender(id) {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  lastManualEdit[id] = Date.now();

  if (!liveTracker[id]) {
    liveTracker[id] = {
      sessionXP: 0,
      sessionTime: 0,
      instances: 1,
      boostUntil: 0,
      name: trackingData[id]?.name || "User",
      packs: 0,
    };
  }

  const { file } = await renderPanel(id, channel);
  const msg = await channel.messages.fetch(userPanels[id].messageId);

 // await msg.edit({
  //  content: `updated_${Date.now()}`,
 //  files: [file]
 // });
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

    await updateGist(process.env.GIST_TRACKING, "tracking.json",trackingData);
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
