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
let isReady = false;

// =============================
// CACHE IMÁGENES
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

    return img;
  } catch {
    return await loadImage("./assets/card.png");
  }
}

// =============================
let saveTimeout;
function saveSettings() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    updateGist(process.env.GIST_SETTINGS, userSettings);
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
client.once("clientReady", async () => {
  console.log(`Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));
  userSettings = safeParse(await getGist(process.env.GIST_SETTINGS));

  isReady = true;

  startLoop();
  startBackupLoop();
});

// =============================
function startLoop() {
  setInterval(async () => {

    if (!isReady) return;

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
      t.sessionXP += (2 + t.instances * 0.5) / 60;
    }

    await updatePanels();

  }, 5000);
}

// =============================
function startBackupLoop() {
  setInterval(async () => {

    if (!isReady) return;

    for (const id in liveTracker) {

      if (!trackingData[id]) {
        trackingData[id] = { xp: 0, time: 0, name: liveTracker[id].name, packs: 0, gp: 0 };
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

  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  const bg = await loadImageCached(settings.bg);
  ctx.drawImage(bg, 0, 0, 800, 450);

  ctx.fillStyle = settings.nameColor;
  ctx.font = "40px Righteous";
  ctx.fillText(s.name, 40, 80);

  return new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" });
}

// =============================
async function updatePanels() {

  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const id of Object.keys(liveTracker)) {

    const file = await renderPanel(id, channel);

    if (userPanels[id]) {
      const msg = await channel.messages.fetch(userPanels[id].messageId);
      await msg.edit({ files: [file] });
      continue;
    }

    const sent = await channel.send({ files: [file] });

    const thread = await sent.startThread({ name: "Perfil" });

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
      content: "Panel",
      components: [menu],
    });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
  }
}

// =============================
// INTERACCIONES FIX
// =============================
client.on("interactionCreate", async (i) => {

  if (i.isStringSelectMenu()) {

    const [, id] = i.customId.split("_");
    const option = i.values[0];

    editState[id] = option;

    await i.reply({
      content: option === "bg"
        ? "🖼️ Sube una imagen"
        : "🎨 Selecciona un color",
      ephemeral: true
    });

    if (option !== "bg") {
      await i.followUp({
        components: [createColorButtons(option, id)],
        ephemeral: true
      });
    }
  }

  if (i.isButton()) {

    const [, type, id, colorName] = i.customId.split("_");

    if (!userSettings[id]) userSettings[id] = {};

    userSettings[id][type === "name" ? "nameColor" : "textColor"] =
      colorMap[colorName];

    saveSettings();

    await i.reply({ content: "Color aplicado", ephemeral: true });

    await forceRender(id);
  }
});

// =============================
// SUBIDA DE IMAGEN FIX
// =============================
client.on("messageCreate", async (msg) => {

  if (msg.author.bot) return;

  const entry = Object.entries(userPanels).find(
    ([, d]) => d.threadId === msg.channel.id
  );

  if (!entry) return;

  const [id] = entry;

  if (editState[id] !== "bg") return;

  if (msg.attachments.size > 0) {

    const file = msg.attachments.first();

    userSettings[id].bg = file.url;

    saveSettings();

    await forceRender(id);

    msg.reply("Fondo actualizado");
  }
});

// =============================
async function forceRender(id) {

  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  const file = await renderPanel(id, channel);

  const msg = await channel.messages.fetch(userPanels[id].messageId);

  await msg.edit({ files: [file] });
}

// =============================
function createColorButtons(type, userId) {
  return new ActionRowBuilder().addComponents(
    Object.keys(colorMap).map(name =>
      new ButtonBuilder()
        .setCustomId(`color_${type}_${userId}_${name}`)
        .setLabel(name)
        .setStyle(ButtonStyle.Secondary)
    )
  );
}

// =============================
function safeParse(data) {
  try { return typeof data === "object" ? data : JSON.parse(data); }
  catch { return {}; }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
}

client.login(process.env.DISCORD_TOKEN);
