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
      const res = await fetch(src, {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });

      if (!res.ok) throw new Error("Error descargando imagen");

      const buffer = Buffer.from(await res.arrayBuffer());

      img = await loadImage(buffer);
    } else {
      img = await loadImage(src);
    }

    imageCache.set(src, img);

    return img;

  } catch (err) {
    console.log("⚠️ Error imagen:", src);

    return await loadImage("./assets/card.png");
  }
}

// =============================
// SAVE SETTINGS
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

  isReady = true;

  startLoop();
  startBackupLoop();
  // 🔥 FORZAR RE-RENDER CON SETTINGS DEL GIST
setTimeout(async () => {

  console.log("🔄 Re-render post deploy");

  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const id of Object.keys(userSettings)) {

    if (!userPanels[id]) continue;

    try {
      const { file } = await renderPanel(id, channel);

      const msg = await channel.messages.fetch(userPanels[id].messageId);

      await msg.edit({
        content: `reload_${Date.now()}`,
        files: [file]
      });

    } catch (err) {
      console.log("Error re-render:", err.message);
    }
  }

}, 5000);
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

      let xpPerSecond = (2 + t.instances * 0.5) / 60;
      if (Date.now() < t.boostUntil) xpPerSecond *= 2;

      t.sessionXP += xpPerSecond;
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
      trackingData[id].packs = s.packs;

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

  const totalXP = (t.xp || 0) + (s.sessionXP || 0);
  const totalTime = (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
  const level = Math.floor(totalXP / 100);

  const poke = getPokemonData(totalXP);

  const member = await channel.guild.members.fetch(id).catch(() => null);
  const role = member ? getUserRole(member) : { name: "Reroller", color: "#aaa" };

  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  const bg = await loadImageCached(settings.bg || "./assets/card.png");
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
async function updatePanels() {

  if (!isReady) return;

  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id] of Object.entries(liveTracker)) {

    if (lastManualEdit[id] && Date.now() - lastManualEdit[id] < 4000) continue;

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
        .setPlaceholder("🎨 Editar perfil")
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

    const embed = new EmbedBuilder().setImage(gif);
    await thread.send({ embeds: [embed] });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
  }
}

// =============================
client.on("interactionCreate", async (i) => {

  if (i.isStringSelectMenu()) {
    const [, id] = i.customId.split("_");
    const option = i.values[0];

    editState[id] = option;

    await i.reply({
      content: option === "bg"
        ? "🖼️ Sube una imagen"
        : "🎨 Selecciona un color:",
      ephemeral: true
    });

    if (option === "name" || option === "text") {
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

    await i.reply({ content: "Color aplicado ✅", ephemeral: true });

    await forceRender(id);
  }
});

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
      userSettings[id].bg = file.url;

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

  await msg.edit({
    content: `updated_${Date.now()}`,
    files: [file]
  });
}

// =============================
function createColorButtons(type, userId) {
  return new ActionRowBuilder().addComponents(
    Object.entries(colorMap).map(([name]) =>
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
