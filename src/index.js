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



const commandMap = {
  nombre: "name",
  name: "name",
  texto: "text",
  text: "text",
};
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
    GatewayIntentBits.GuildMembers // 🔥 NECESARIO
  ],
});
const CHAMPION_ROLE_ID = "1486206362332434634";
// =============================
// 📌 CANALES Y GISTS POR GRUPO
// =============================
const GROUPS = {
  trainer: {
    heartbeatChannelId: "1486243169422020648", // canal donde se registra XP, tiempo, packs
    gpChannelId: "1487362022864588902",               // canal donde se cuentan GP
   usersGistId: "1c066922bc39ac136b6f234fad6d9420",
    onlineGistId: "4edcf4d341cd4f7d5d0fb8a50f8b8c3c"     // Gist con usuarios online
  },
  gymLeader: {
    heartbeatChannelId: "1491238609578360833",
    gpChannelId: "1491238471556403281",
    usersGistId: "a3f5f3d8a2e6ddf2378fb3481dff49f6",
    onlineGistId: "e110c37b3e0b8de83a33a1b0a5eb64e8"
  },
  eliteFour: {
    heartbeatChannelId: "1483616146996465735",
    gpChannelId: "1484015417411244082",
   // gpChannelId: "1486277594629275770",
  usersGistId: "bb18eda2ea748723d8fe0131dd740b70",
    onlineGistId: "d9db3a72fed74c496fd6cc830f9ca6e9"
  }
};
// =============================
let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};
let userPanels = {};
let userSettings = {};
let editState = {};
let lastManualEdit = {};

let groupOnlineMap = {};  // 🔥 GLOBAL

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
    updateGist(process.env.GIST_SETTINGS, userSettings);
  }, 2000);
}

// =============================
const colorCategories = {
  red: [
    { label: "🔴 Red", value: "#ff4d4d" },
    { label: "🔥 Crimson", value: "#dc143c" },
    { label: "🍅 Tomato", value: "#ff6347" },
    { label: "🩸 Dark Red", value: "#8b0000" },
    { label: "❤️ Firebrick", value: "#b22222" },
    { label: "🌹 Indian Red", value: "#cd5c5c" },
    { label: "🍓 Light Coral", value: "#f08080" },
  ],

  blue: [
    { label: "🔵 Blue", value: "#4da6ff" },
    { label: "🌊 Dodger Blue", value: "#1e90ff" },
    { label: "💎 Royal Blue", value: "#4169e1" },
    { label: "🌌 Midnight Blue", value: "#191970" },
    { label: "🌀 Steel Blue", value: "#4682b4" },
    { label: "❄️ Light Blue", value: "#add8e6" },
    { label: "🌫️ Sky Blue", value: "#87ceeb" },
  ],

  green: [
    { label: "🟢 Green", value: "#4dff88" },
    { label: "🌿 Lime", value: "#32cd32" },
    { label: "🌲 Forest", value: "#228b22" },
    { label: "🍃 Spring", value: "#00ff7f" },
    { label: "🥑 Olive", value: "#808000" },
    { label: "🌱 Sea Green", value: "#2e8b57" },
    { label: "🌴 Dark Green", value: "#006400" },
  ],

  yellow: [
    { label: "🟡 Yellow", value: "#ffff66" },
    { label: "🌟 Gold", value: "#ffd700" },
    { label: "🍋 Lemon", value: "#fff44f" },
    { label: "🌻 Khaki", value: "#f0e68c" },
    { label: "🧈 Light Yellow", value: "#ffffe0" },
  ],

  purple: [
    { label: "🟣 Purple", value: "#b84dff" },
    { label: "💜 Violet", value: "#ee82ee" },
    { label: "🔮 Indigo", value: "#4b0082" },
    { label: "🌌 Dark Violet", value: "#9400d3" },
    { label: "🍇 Plum", value: "#dda0dd" },
  ],

  pink: [
    { label: "🌸 Pink", value: "#ff66cc" },
    { label: "💖 Hot Pink", value: "#ff69b4" },
    { label: "🎀 Deep Pink", value: "#ff1493" },
    { label: "🌺 Pale Violet", value: "#db7093" },
  ],

  neutral: [
    { label: "⚪ White", value: "#ffffff" },
    { label: "⬜ Light Gray", value: "#d3d3d3" },
    { label: "🌑 Gray", value: "#808080" },
    { label: "⬛ Dark Gray", value: "#404040" },
    { label: "🖤 Black", value: "#000000" },
  ],

  special: [
    { label: "💎 Cyan", value: "#00ffff" },
    { label: "🧊 Aqua", value: "#7fdbff" },
    { label: "🍊 Orange", value: "#ff944d" },
    { label: "🔥 Dark Orange", value: "#ff8c00" },
    { label: "🌈 Rainbow", value: "#ff00ff" },
  ],

  neon: [
    { label: "⚡ Neon Blue", value: "#00ffff" },
    { label: "💚 Neon Green", value: "#39ff14" },
    { label: "💖 Neon Pink", value: "#ff10f0" },
    { label: "🟡 Neon Yellow", value: "#ffff33" },
    { label: "🟣 Neon Purple", value: "#bc13fe" },
  ]
};
function isValidColor(color) {
  const canvas = createCanvas(10, 10);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.fillStyle = color;

  return ctx.fillStyle !== "#000" || color === "#000";
}
// =============================
function getUserRoleByGroup(group) {

  if (group === "eliteFour")
    return { name: "Elite Four", color: "#800080" };

  if (group === "gymLeader")
    return { name: "Gym Leader", color: "#0099ff" };

  if (group === "trainer")
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
client.once("Ready", async () => {
  console.log(`Bot listo como ${client.user.tag}`);

  eliteUsers = {};

for (const [groupName, group] of Object.entries(GROUPS)) {

  const usersData = safeParse(await getGist(group.usersGistId));

  // Agregamos el grupo automáticamente a cada usuario
  for (const [id, user] of Object.entries(usersData)) {
    eliteUsers[id] = {
      ...user,
      group: groupName
    };
  }
}

console.log("Usuarios totales cargados:", Object.keys(eliteUsers).length);
  
groupOnlineMap = {};
let combinedOnlineIds = [];

for (const [groupName, group] of Object.entries(GROUPS)) {
  const raw = await getGist(group.onlineGistId);
  const ids = cleanOnlineIds(raw);

  groupOnlineMap[groupName] = ids;
  combinedOnlineIds.push(...ids);
}

onlineIds = [...new Set(combinedOnlineIds)];
  
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  userSettings = safeParse(await getGist(process.env.GIST_SETTINGS));

sanitizeTracking();

// 🔥 FORZAR ACTUALIZACIÓN AL INICIAR
console.log("🚀 Ejecutando actualización inicial...");

await runTrackingCycle();

// 🔥 Guardar inmediatamente en Gist
await updateGist(process.env.GIST_TRACKING, trackingData);

console.log("✅ Datos sincronizados al iniciar");

// Luego iniciar loops normales
startLoop();
startBackupLoop();
  
});

// =============================

async function runTrackingCycle() {

   try {
  console.log("⏱ Ejecutando ciclo de tracking...", new Date().toLocaleTimeString());

  


  // =============================
  // 📦 LEER HEARTBEAT POR GRUPO
  // =============================


for (const [groupName, group] of Object.entries(GROUPS)) {

  const channel = await client.channels.fetch(group.heartbeatChannelId);
  const messages = await channel.messages.fetch({ limit: 50 });

  const onlineGroupIds = groupOnlineMap[groupName] || [];

  for (const [userId, user] of Object.entries(eliteUsers)) {

    // asegurar tracking
    if (!trackingData[userId]) {
      trackingData[userId] = {
        xp: 0,
        time: 0,
        packs: 0,
        gp: 0,
        recordInstances: 0,
        lastPacks: 0,
        name: user.name
      };
    }

   const idsToCheck = [user.main_id, user.sec_id]
  .filter(Boolean)
  .map(id => String(id));

    const isOnlineInThisGroup = idsToCheck.some(id =>
      onlineGroupIds.includes(id)
    );

    if (!isOnlineInThisGroup) continue;

 const userMessage = messages.find(m => {
  if (!m.webhookId) return false;

  const firstLine = m.content.split("\n")[0]?.trim();

  // normalizar
  const normalizedMsgName = firstLine.replace("@", "").toLowerCase().trim();
  const normalizedUserName = user.name.toLowerCase().trim();

  return normalizedMsgName === normalizedUserName;
});

    if (!userMessage) continue;

    const content = userMessage.content;

    // =============================
    // INSTANCIAS (record)
    // =============================
    const onlineMatch = content.match(/Online:\s*(.+)/i);

    if (onlineMatch) {
      const instances = onlineMatch[1]
        .split(",")
        .map(x => x.trim())
        .filter(x =>
          x.toLowerCase() !== "main" &&
          x.toLowerCase() !== "none"
        ).length;

      if (instances > trackingData[userId].recordInstances) {
        trackingData[userId].recordInstances = instances;
      }
    }

    // =============================
    // PACKS (por diferencia)
    // =============================
    const packsMatch = content.match(/Packs:\s*(\d+)/i);

    if (packsMatch) {

      const currentPacks = parseInt(packsMatch[1]);

      if (currentPacks > trackingData[userId].lastPacks) {
        const diff = currentPacks - trackingData[userId].lastPacks;
        trackingData[userId].packs += diff;
      }

      trackingData[userId].lastPacks = currentPacks;
    }
  }
}

    
  

  // =============================
  // 🔥 2️⃣ PROCESAR XP Y TIEMPO (tu sistema actual)
  // =============================
  for (const [id, user] of Object.entries(eliteUsers)) {

    const userIds = [user.main_id, user.sec_id].filter(Boolean);
    const isOnline = userIds.some(uid => onlineIds.includes(String(uid)));

    if (!isOnline) continue;

    let userGroup = null;

    for (const [groupName, ids] of Object.entries(groupOnlineMap)) {
      if (userIds.some(uid => ids.includes(String(uid)))) {
        userGroup = groupName;
        break;
      }
    }

    if (!userGroup) continue;

    if (!liveTracker[id]) {
      liveTracker[id] = {
        sessionXP: 0,
        sessionTime: 0,
        instances: 1,
        boostUntil: 0,
        name: user.name,
        packs: 0,
        gp: 0,
        group: userGroup
      };
    } else {
      liveTracker[id].group = userGroup;
    }

    const t = liveTracker[id];

    const seconds = 60;
    t.sessionTime += seconds;

    let xpPerSecond = (2 + t.instances * 0.5) / 60;

    if (Date.now() < t.boostUntil)
      xpPerSecond *= 2;

    t.sessionXP += xpPerSecond * seconds;
  }



  await updatePanels();
      } catch (error) {
    console.error("❌ Error en runTrackingCycle:", error);
  }
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

let role;

if (s?.group) {
  role = getUserRoleByGroup(s.group);
} else {
  role = {
    name: t.role || "Reroller",
    color: "#aaaaaa"
  };
}

// 👑 DETECCIÓN CHAMPION
try {
  const guild = client.guilds.cache.first();
  const member = await guild.members.fetch(id);

  if (member.roles.cache.has(CHAMPION_ROLE_ID)) {
    role = {
      name: "Champion",
      color: "#FFD700" // dorado 👑
    };
  }

} catch (err) {
  console.log("No se pudo verificar Champion:", err.message);
}

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
  ctx.fillText(`Instancias: ${t.recordInstances || 0}`, 40, 250);
  ctx.fillText(`Packs: ${t.packs || 0}`, 40, 290);
  ctx.fillText(`GP: ${t.gp || 0}`, 40, 330);

  return {
    file: new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" }),
    gif: poke.gif
  };
}
function createCategoryMenu(type, userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`cat_${type}_${userId}`)
      .setPlaceholder("Elige categoría")
      .addOptions([
        { label: "🔴 Rojos", value: "red" },
        { label: "🔵 Azules", value: "blue" },
        { label: "🟢 Verdes", value: "green" },
        { label: "🟡 Amarillos", value: "yellow" },
        { label: "🟣 Morados", value: "purple" },
        { label: "🌸 Rosas", value: "pink" },
        { label: "⚫ Neutros", value: "neutral" },
        { label: "🌈 Especiales", value: "special" },
        { label: "⚡ Neon", value: "neon" },
      ])
  );
}

function createColorMenu(type, userId, category) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`color_${type}_${userId}`)
      .setPlaceholder("Selecciona un color")
      .addOptions(colorCategories[category])
  );
}


// =============================

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id] of Object.entries(liveTracker)) {

    if (lastManualEdit[id] && Date.now() - lastManualEdit[id] < 4000) continue;

    if (!liveTracker[id].sessionXP && !liveTracker[id].sessionTime) continue;

const { file, gif } = await renderPanel(id, channel);

    if (userPanels[id]) {
  try {
    const msg = await channel.messages.fetch(userPanels[id].messageId);

    await msg.edit({ files: [file] });

    continue;
  } catch (err) {
    console.log(`⚠️ Mensaje perdido para ${id}, recreando panel...`);

    delete userPanels[id]; // 🔥 IMPORTANTE
  }
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
      content: "🎮 Personaliza tu panel",
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

  // =============================
  // 🎮 MENU PRINCIPAL
  // =============================
  if (i.isStringSelectMenu() && i.customId.startsWith("menu_")) {

    const id = i.user.id;
    const option = i.values[0];

    if (option === "bg") {
      return i.reply({ content: "🖼️ Sube una imagen", ephemeral: true });
    }

   if (option === "name" || option === "text") {
  return i.reply({
    content: "🎨 Elige una categoría:",
    components: [createCategoryMenu(option, id)],
    ephemeral: true
  });
}
  }

  // =============================
  // 🎨 SELECCIÓN DE COLOR
  // =============================
if (i.isStringSelectMenu() && i.customId.startsWith("cat_")) {

  const [, type, userId] = i.customId.split("_");

  if (i.user.id !== userId) {
    return i.reply({
      content: "❌ No puedes editar este panel",
      ephemeral: true
    });
  }

  const category = i.values[0];

  return i.update({
    content: "🎨 Ahora elige un color:",
    components: [createColorMenu(type, userId, category)]
  });
}


 if (i.isStringSelectMenu() && i.customId.startsWith("color_")) {

  const [, type, userId] = i.customId.split("_");
  const color = i.values[0];

  // 🔒 Seguridad: solo el dueño puede usarlo
  if (i.user.id !== userId) {
    return i.reply({
      content: "❌ No puedes editar este panel",
      ephemeral: true
    });
  }

  const entry = Object.entries(userPanels)
    .find(([_, data]) => data.threadId === i.channel.id);

  if (!entry) {
    return i.reply({ content: "Error: panel no encontrado.", ephemeral: true });
  }

  const [id] = entry;

  if (!userSettings[id]) userSettings[id] = {};

  if (type === "name") userSettings[id].nameColor = color;
  if (type === "text") userSettings[id].textColor = color;

  saveSettings();

  await i.update({
    content: `✅ Color aplicado`,
    components: []
  });

  await forceRender(id);
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

  if (!userSettings[id]) userSettings[id] = {};

  const content = msg.content.toLowerCase().trim();



// =============================
// 💎 DETECCIÓN GOD PACK
// =============================
for (const group of Object.values(GROUPS)) {

  if (msg.channel.id === group.gpChannelId) {

    const lines = msg.content.split("\n");
    const firstLine = lines[0];

    const match = firstLine.match(/@(.+?)\s+Kudos!/i);

    if (!match) return;

    const username = match[1].trim();

    const userEntry = Object.entries(trackingData)
      .find(([id, data]) => data.name === username);

    if (userEntry) {

      const [id] = userEntry;

      if (!trackingData[id].gp)
        trackingData[id].gp = 0;

      trackingData[id].gp += 1;

      console.log(`💎 GP sumado a ${username}`);
    }
  }
}

  
// =============================
// 📦 DETECCIÓN WEBHOOK TRACKING
// =============================
if (msg.webhookId) {

  const content = msg.content;

  const onlineMatch = content.match(/Online:\s*(.+)/i);
  const packsMatch = content.match(/Packs:\s*(\d+)/i);

if (packsMatch) {

  const username = content.split("\n")[0]?.trim();
  const currentPacks = Number(packsMatch[1]);

  const userEntry = Object.entries(trackingData)
    .find(([id, data]) => data.name === username);

  if (userEntry) {

    const [id] = userEntry;
    
if (trackingData[id].lastPacks === undefined) {
    trackingData[id].lastPacks = currentPacks;
}

    const diff = currentPacks - trackingData[id].lastPacks;

    if (diff > 0) {
      trackingData[id].packs += diff;
    }

    trackingData[id].lastPacks = currentPacks;
  }
}


  
  if (onlineMatch) {

    const username = content.split("\n")[0]?.trim(); // Zannt
    const onlineLine = onlineMatch[1];

    const instances = onlineLine
      .split(",")
      .map(x => x.trim())
      .filter(x => x !== "Main" && x.toLowerCase() !== "none")
      .length;

    const userEntry = Object.entries(trackingData)
      .find(([id, data]) => data.name === username);

    if (userEntry) {
      const [id] = userEntry;

      if (!trackingData[id].recordInstances)
        trackingData[id].recordInstances = 0;

      if (instances > trackingData[id].recordInstances) {
        trackingData[id].recordInstances = instances;
      }


      
    }
  }
}
  // =============================
  // 🎨 COLOR (ES + EN)
  // =============================
  const parts = content.split(" ");

  if (parts.length >= 2) {

    let type = parts[0];
    const value = parts[1];

    type = commandMap[type];

    if (type) {

      let color = value;

      if (!isValidColor(color)) {
        return msg.reply(`❌ Color inválido / Invalid color

Ejemplos:
red, blue, gold
#ff0000
rgb(255,0,0)`);
      }

      if (type === "name") {
        userSettings[id].nameColor = color;
      }

      if (type === "text") {
        userSettings[id].textColor = color;
      }

      saveSettings();
      await forceRender(id);

      return msg.reply(`✅ Color aplicado: ${color}`);
    }
  }

  // =============================
  // 🖼️ FONDO
  // =============================
  if (msg.attachments.size > 0) {
    const file = msg.attachments.first();

    if (file.url.match(/\.(png|jpg|jpeg|webp)/i)) {

      const res = await fetch(file.url);
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      userSettings[id].bg = {
        type: "base64",
        data: base64
      };

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
    name: trackingData[id]?.name || "Unknown",
    packs: 0,
    gp: 0,
    group: trackingData[id]?.role
  };
}

  const { file } = await renderPanel(id, channel);
  const msg = await channel.messages.fetch(userPanels[id].messageId);

  await msg.edit({
  //  content: `updated_${Date.now()}`,
  files: [file]
  });
}


function startLoop() {

  // Ejecuta inmediatamente
  runTrackingCycle();

  // Luego cada 1 minuto
  setInterval(runTrackingCycle, 60000);
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
//trackingData[id].packs = s.packs;
trackingData[id].gp = s.gp;
trackingData[id].role = getUserRoleByGroup(s.group).name;

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
    trackingData[k].recordInstances = Number(trackingData[k].recordInstances) || 0;
trackingData[k].packs = Number(trackingData[k].packs) || 0;
        trackingData[k].lastPacks = Number(trackingData[k].lastPacks) || 0;

//trackingData[k].gp = Number(trackingData[k].gp) || 0;
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];

  return raw
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(x => x.length > 0);
}

client.login(process.env.DISCORD_TOKEN);
