
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


async function loadUserGPs() {
  try {
    const res = await fetch(`https://api.github.com/gists/${USERS_GP_GIST_ID}?t=${Date.now()}`, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`
      }
    });

    const data = await res.json();

    const fileKey = Object.keys(data.files || {})[0];
    if (!fileKey) return {};

    return JSON.parse(data.files[fileKey].content);

  } catch (err) {
    console.error("❌ ERROR cargando users_gp:", err);
    return {};
  }
}


let gpCache = null;
let gpLastFetch = 0;

async function loadUserGPsCached() {
  const now = Date.now();

  if (gpCache && (now - gpLastFetch < 60000)) {
    return gpCache;
  }

  gpCache = await loadUserGPs();
  gpLastFetch = now;

  return gpCache;
}
// =============================
// 🛑 VALIDACIÓN ENV
// =============================
if (!process.env.GIST_SETTINGS) {
  console.error("❌ FALTA GIST_SETTINGS en Railway");
  process.exit(1);
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


const USERS_GP_GIST_ID = "5131a73fcee46b4a5c7b7faeea16efe9"; // 🔥 users_gp.json
const GLOBAL_HEARTBEAT_CHANNEL_ID = "1492795826857054301";
// =============================
// 📌 CANALES Y GISTS POR GRUPO
// =============================
const GROUPS = {
  trainer: {
//    heartbeatChannelId: "1486243169422020648", // canal donde se registra XP, tiempo, packs
    gpChannelId: "1484015417411244082",               // canal donde se cuentan GP
   usersGistId: "1c066922bc39ac136b6f234fad6d9420",
    onlineGistId: "4edcf4d341cd4f7d5d0fb8a50f8b8c3c"     // Gist con usuarios online
  },
  gymLeader: {
 //   heartbeatChannelId: "1491238609578360833",
    gpChannelId: "1484015417411244082",
    usersGistId: "a3f5f3d8a2e6ddf2378fb3481dff49f6",
    onlineGistId: "e110c37b3e0b8de83a33a1b0a5eb64e8"
  },
  eliteFour: {
 //   heartbeatChannelId: "1483616146996465735",
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
let usersByGroup = {};
let liveTracker = {};
let userPanels = {};
let userSettings = {};
let editState = {};
let lastManualEdit = {};
let lastRun = Date.now();

let groupOnlineMap = {};  // 🔥 GLOBAL

let panelSaveTimeout;

function savePanels() {
  clearTimeout(panelSaveTimeout);
  panelSaveTimeout = setTimeout(() => {
    updateGist(process.env.GIST_PANELS, userPanels, "panels.json");
  }, 2000);
}
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

    if (imageCache.size > 50) {
  const firstKey = imageCache.keys().next().value;
  imageCache.delete(firstKey);
}

    return img;
  } catch (err) {
    console.error("Error cargando imagen:", err.message);
    return await loadImage("./assets/card.png");
  }
}
let idMap = {};
//console.log("EJEMPLO IDMAP:", Object.entries(idMap).slice(0, 10));
//console.log("ONLINE IDS:", onlineIds.slice(0, 10));
// =============================
// 💾 SAVE SETTINGS (DEBOUNCE)
// =============================
let saveTimeout;

function saveSettings() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    updateGist(process.env.GIST_SETTINGS, userSettings, "settings.json");
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
client.once("clientReady", async () => {
  console.log(`Bot listo como ${client.user.tag}`);
    console.log("🔎 Escaneando heartbeats (GLOBAL)...");

    client.globalHeartbeatMessages = new Map();

    for (const guild of client.guilds.cache.values()) {

        const globalChannel = guild.channels.cache.get(GLOBAL_HEARTBEAT_CHANNEL_ID);
        if (!globalChannel) continue;

        const messages = await globalChannel.messages.fetch({ limit: 50 });

        for (const msg of messages.values()) {

            if (msg.author.id !== client.user.id) continue;

            const content = msg.content;

            // Intentar identificar usuario desde el contenido
            // (IMPORTANTE: necesitas incluir el nombre en el mensaje)
            const match = content.match(/^```(.*?)\n/);

            if (match) {
                const username = match[1].trim();
                client.globalHeartbeatMessages.set(username, msg.id);
            }
        }
    }

    console.log("EJEMPLO IDMAP:", [...client.globalHeartbeatMessages.entries()].slice(0, 5));

  
  // =============================
  // 1️⃣ CARGAR USUARIOS
  // =============================
  eliteUsers = {};

  for (const [groupName, group] of Object.entries(GROUPS)) {

    const usersData = await getParsedGist(group.usersGistId);

    for (const [id, user] of Object.entries(usersData)) {
      eliteUsers[id] = {
        ...user,
        group: groupName
      };
    }
  }

  console.log("Usuarios totales cargados:", Object.keys(eliteUsers).length);


  // =============================
  // 2️⃣ CREAR usersByGroup
  // =============================
  usersByGroup = {};

  for (const [id, user] of Object.entries(eliteUsers)) {
    if (!usersByGroup[user.group]) {
      usersByGroup[user.group] = {};
    }

    usersByGroup[user.group][id] = user;
  }


  // =============================
  // 3️⃣ CREAR ID MAP
  // =============================
  idMap = {};

  for (const [id, user] of Object.entries(eliteUsers)) {
    if (user.main_id)
      idMap[String(user.main_id)] = id;

    if (user.sec_id)
      idMap[String(user.sec_id)] = id;
  }

  console.log("ID MAP creado:", Object.keys(idMap).length);


  // =============================
  // 4️⃣ CARGAR ONLINE IDS
  // =============================
 const onlineData = await loadOnlineData();
groupOnlineMap = onlineData.groupOnlineMap;
onlineIds = onlineData.onlineIds;


  // =============================
  // 5️⃣ CARGAR TRACKING Y SETTINGS
  // =============================
userPanels = await getParsedGist(process.env.GIST_PANELS, "panels.json");
trackingData = await getParsedGist(process.env.GIST_TRACKING, "tracking.json");
userSettings = await getParsedGist(process.env.GIST_SETTINGS, "settings.json");

  sanitizeTracking();


  // =============================
  // 6️⃣ EJECUTAR PRIMERA ACTUALIZACIÓN
  // =============================
  console.log("🚀 Ejecutando actualización inicial...");

  await runTrackingCycle();
  await scanHeartbeats();

  await updateGist(process.env.GIST_TRACKING, trackingData, "tracking.json");

  console.log("✅ Datos sincronizados al iniciar");


  // =============================
  // 7️⃣ INICIAR LOOPS
  // =============================
  startLoop();
  setInterval(scanHeartbeats, 300000);
  startBackupLoop();
});

// ============================= end cloentonce

async function runTrackingCycle() {
  try {
    console.log("⏱ Ejecutando ciclo de tracking...", new Date().toLocaleTimeString());
if (!lastRun) lastRun = Date.now();
    const now = Date.now();
const seconds = (now - lastRun) / 1000;
lastRun = now;

   
//online
const onlineData = await loadOnlineData();
groupOnlineMap = onlineData.groupOnlineMap;
onlineIds = onlineData.onlineIds;


///sep
   const onlineSet = new Set(
  onlineIds.map(uid => idMap[String(uid)])
);

for (const id in liveTracker) {

  const isStillOnline = onlineSet.has(id);

  if (!isStillOnline) {

    if (!trackingData[id]) continue;

    if (trackingData[id].currentpacks > 0) {
      trackingData[id].totalpacks += trackingData[id].currentpacks;
      trackingData[id].currentpacks = 0;

      console.log("📦 Flush packs offline:", trackingData[id].name);
    }

    delete liveTracker[id];
  }
}

// 🔥 CARGAR GP DESDE GIST
const gpData = await loadUserGPsCached();

for (const [id, data] of Object.entries(gpData)) {

  if (!trackingData[id]) {
    trackingData[id] = {
      name: data.username || "Unknown",
      xp: 0,
      time: 0,
      totalpacks: 0,
      currentpacks: 0,
      gp: 0,
      recordInstances: 0
    };
  }

  // 🔥 AQUÍ SE SINCRONIZA
  trackingData[id].gp = data.gp || 0;
}

    
    // 🔥 XP / TIEMPO
  for (const uid of onlineIds) {
    
    if (!idMap[String(uid)]) {
  console.log("⚠️ UID SIN MAP:", uid);
}

  const id = idMap[String(uid)];

if (id && eliteUsers[id]) {
  console.log("🟢 ONLINE:", eliteUsers[id].name);
}
    
  if (!id) continue;

  const user = eliteUsers[id];
  if (!user) continue;

  let userGroup = null;

  for (const [gName, ids] of Object.entries(groupOnlineMap)) {
    if (ids.includes(String(uid))) {
      userGroup = gName;
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

 // const seconds = 60;
  t.sessionTime += seconds;

  let xpPerSecond = (1 + t.instances * 0.1) / 60;

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
  const level = Math.floor(totalXP / 200);

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
  const guild = client.guilds.cache.get("1483615153743462571");
  if (!guild) return;

  const member = await guild.members.fetch(id).catch(() => null);

  if (member && member.roles.cache.has(CHAMPION_ROLE_ID)) {
    role = {
      name: "Champion",
      color: "#FFD700"
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
  const totalPacks = (t.totalpacks || 0) + (t.currentpacks || 0);
ctx.fillText(`Packs: ${totalPacks}`, 40, 290);
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


// =============================scanHeartbeats____scanHeartbeats

 async function scanHeartbeats() {
  console.log("🔎 Escaneando heartbeats (GLOBAL)...");

  const normalize = str =>
    str?.toLowerCase().replace(/[^a-z0-9]/g, "");

  try {

    // 🔥 Canal global de heartbeat
    const channel = await client.channels.fetch(GLOBAL_HEARTBEAT_CHANNEL_ID);
    if (!channel) return;

    // 🔥 Traer más mensajes
    const messages = await channel.messages.fetch({ limit: 50 });

    const latestByUser = {};

  for (const msg of messages.values()) {

  // Solo aceptar mensajes de bots
  if (!msg.author.bot) continue;

// 🔥 LIMPIAR mensaje primero
let content = msg.content.replace(/```/g, "").trim();

// 🔥 ahora sí dividir
const lines = content.split("\n");
if (!lines.length) continue;

// 🔥 nombre correcto
const rawName = lines[0].trim();
    
const cleanName = normalize(rawName);

const userEntry = Object.entries(eliteUsers)
  .find(([id, user]) =>
    normalize(user.name) === cleanName
  );
   // console.log("RAW:", rawName);
//console.log("CLEAN:", cleanName);
    
      if (!userEntry) continue;

      const [id] = userEntry;

      if (!latestByUser[id]) {
        latestByUser[id] = msg;
      }
    }

    // 🔥 Procesar usuarios encontrados
    for (const [id, msg] of Object.entries(latestByUser)) {

      if (!trackingData[id]) {
      trackingData[id] = {
  name: eliteUsers[id].name,
  xp: 0,
  time: 0,
  totalpacks: 0,
  currentpacks: 0,
  gp: 0,
  recordInstances: 0,
  lastHeartbeatMessageId: null
};
      }

    

      let content = msg.content.replace(/```/g, "").trim();

      // =====================
      // 📦 PACKS
      // =====================
      const packsMatch = content.match(/packs:\s*(\d+)/i);

      if (packsMatch) {

        const current = Number(packsMatch[1]);

if (!trackingData[id].currentpacks) {
  trackingData[id].currentpacks = current;
} else {

  if (current < trackingData[id].currentpacks) {
    // 🔥 reset → sumar al total
    trackingData[id].totalpacks += trackingData[id].currentpacks;
    trackingData[id].currentpacks = 0;
  } else {
    trackingData[id].currentpacks = current;
  }
}
      }

      // =====================
      // 🥇 INSTANCIAS
      // =====================
      const onlineMatch = content.match(/online\s*[:\-]?\s*(.+)/i);

      if (onlineMatch) {

        const rawOnline = onlineMatch[1];

    const instances = rawOnline
  .split(",")
  .map(x => x.trim().toLowerCase())
  .filter(x =>
    x !== "" &&
    x !== "main" &&
    x !== "none"
  ).length;
        if (!liveTracker[id]) {
  liveTracker[id] = {};
}

liveTracker[id].instances = instances;

        if (instances > (trackingData[id].recordInstances || 0)) {
          trackingData[id].recordInstances = instances;
        }

        console.log("🥇 INSTANCES:", eliteUsers[id].name, instances);
      }

    }

    await updateGist(process.env.GIST_TRACKING, trackingData, "tracking.json");

  } catch (err) {
    console.error("❌ Error escaneando heartbeat global:", err.message);
  }

}


// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id] of Object.entries(liveTracker)) {

    if (
  userPanels[id] &&
  !liveTracker[id].sessionXP &&
  !liveTracker[id].sessionTime
) continue;

    if (lastManualEdit[id] && Date.now() - lastManualEdit[id] < 4000) continue;

    if (!liveTracker[id].sessionXP && !liveTracker[id].sessionTime) continue;

const { file, gif } = await renderPanel(id, channel);

 if (userPanels[id]?.messageId) {
  try {
    const msg = await channel.messages.fetch(userPanels[id].messageId);

    await msg.edit({ files: [file] });

    continue; // 🔥 NO CREA NUEVO
  } catch (err) {
    console.log(`⚠️ Panel perdido (${id}), recreando...`);
    delete userPanels[id];
    savePanels();
  }
}

    const buttons = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(`config_${id}`)
    .setLabel("🎨 Personalizar")
    .setStyle(ButtonStyle.Primary),

  new ButtonBuilder()
    .setCustomId(`gif_${id}`)
    .setLabel("🖼️ Ver GIF")
    .setStyle(ButtonStyle.Secondary)
);

const sent = await channel.send({ 
  files: [file],
  components: [buttons] // 👈 AQUÍ
});

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

   

    await thread.send({ embeds: [new EmbedBuilder().setImage(gif)] });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
savePanels(); // 🔥 GUARDAR
  }
}

// =============================
// 🎮 INTERACCIONES
// =============================

client.on("interactionCreate", async (i) => {

  try {

    // =============================
    // 🔘 BOTONES
    // =============================
    if (i.isButton()) {

      const [action, userId] = i.customId.split("_");

      // 🔒 SOLO EL DUEÑO
      if (i.user.id !== userId) {
        return i.reply({
          content: "❌ No puedes usar este panel",
          ephemeral: true
        });
      }

      // 🎨 CONFIG
      if (action === "config") {
        return i.reply({
          content: "🎨 Configuración del panel:",
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`set_name_${userId}`)
                .setLabel("Color nombre")
                .setStyle(ButtonStyle.Primary),

              new ButtonBuilder()
                .setCustomId(`set_text_${userId}`)
                .setLabel("Color texto")
                .setStyle(ButtonStyle.Secondary),

              new ButtonBuilder()
                .setCustomId(`set_bg_${userId}`)
                .setLabel("Cambiar fondo")
                .setStyle(ButtonStyle.Success)
            )
          ],
          ephemeral: true
        });
      }

      // 🖼️ GIF
      if (action === "gif") {
        const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);
        const { gif } = await renderPanel(userId, channel);

        return i.reply({
          embeds: [new EmbedBuilder().setImage(gif)],
          ephemeral: true
        });
      }

      // 🎨 SET (nombre/text/bg)
      if (i.customId.startsWith("set_")) {

        const [, type, userId] = i.customId.split("_");

        return i.reply({
          content: "🎨 Elige categoría:",
          components: [createCategoryMenu(type, userId)],
          ephemeral: true
        });
      }
    }

    // =============================
    // 📂 MENU PRINCIPAL
    // =============================
    if (i.isStringSelectMenu() && i.customId.startsWith("menu_")) {

      const id = i.user.id;
      const option = i.values[0];

      if (option === "bg") {
        return i.reply({
          content: "🖼️ Sube una imagen",
          ephemeral: true
        });
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
    // 🎨 CATEGORÍA
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

    // =============================
    // 🎨 COLOR FINAL
    // =============================
    if (i.isStringSelectMenu() && i.customId.startsWith("color_")) {

      const [, type, userId] = i.customId.split("_");
      const color = i.values[0];

      if (i.user.id !== userId) {
        return i.reply({
          content: "❌ No puedes editar este panel",
          ephemeral: true
        });
      }

      const entry = Object.entries(userPanels)
        .find(([_, data]) => data.threadId === i.channel.id);

      if (!entry) {
        return i.reply({
          content: "Error: panel no encontrado.",
          ephemeral: true
        });
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

  } catch (err) {
    console.error("❌ Error en interactionCreate:", err);

    if (!i.replied && !i.deferred) {
      i.reply({
        content: "❌ Error interno",
        ephemeral: true
      });
    }
  }
});





// =============================
// 🖼️ FONDO
// =============================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  // =============================
  // 🔥 1. TRACKING GLOBAL (SIEMPRE)
  // =============================


  // 📦 WEBHOOK (packs + instancias)
 
 
  // =============================
  // 🎨 2. PERSONALIZACIÓN (SOLO THREAD)
  // =============================

  const entry = Object.entries(userPanels)
    .find(([_, d]) => d.threadId === msg.channel.id);

  if (!entry) return;

  const [id] = entry;

  if (!userSettings[id]) userSettings[id] = {};

  const content = msg.content.toLowerCase().trim();

  // =============================
  // 🎨 COLOR
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

      if (type === "name") userSettings[id].nameColor = color;
      if (type === "text") userSettings[id].textColor = color;

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
    group: eliteUsers[id]?.group
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

  // Luego cada 5 minutos
  setInterval(runTrackingCycle, 300000); // 5 minutos
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

    await updateGist(process.env.GIST_TRACKING, trackingData, "tracking.json");
  }, 600000);
}

// =============================
function safeParse(data) {
  try {
    if (!data) return {};

    if (typeof data === "object") return data;

    if (typeof data === "string") {
      const parsed = JSON.parse(data);

      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
    }

    return {};
  } catch (err) {
    console.error("❌ Error parseando JSON:", err.message);
    return {};
  }
}

async function getParsedGist(id, file) {
  const raw = await getGist(id, file);
  return safeParse(raw);
}

function sanitizeTracking() {
  if (typeof trackingData !== "object" || trackingData === null) {
    console.error("❌ trackingData corrupto:", trackingData);
    trackingData = {};
    return;
  }

  for (const k in trackingData) {
    if (typeof trackingData[k] !== "object") {
      trackingData[k] = {};
    }

    trackingData[k].xp = Number(trackingData[k].xp) || 0;
    trackingData[k].time = Number(trackingData[k].time) || 0;
    trackingData[k].gp = Number(trackingData[k].gp) || 0;
    trackingData[k].recordInstances = Number(trackingData[k].recordInstances) || 0;
   trackingData[k].totalpacks = Number(trackingData[k].totalpacks) || 0;
    trackingData[k].currentpacks = Number(trackingData[k].currentpacks) || 0;
  //  trackingData[k].lastHeartbeatMessageId = trackingData[k].lastHeartbeatMessageId || null;
  }
}

function cleanOnlineIds(raw) {
  if (!raw || typeof raw !== "string") return [];

  return raw
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(x => x.length > 0);
}
async function loadOnlineData() {
  const entries = Object.entries(GROUPS);

  const results = await Promise.all(
    entries.map(([groupName, group]) =>
      getGist(group.onlineGistId).then(raw => ({
        groupName,
        ids: cleanOnlineIds(raw)
      }))
    )
  );

  const map = {};
  let all = [];

  for (const r of results) {
    map[r.groupName] = r.ids;
    all.push(...r.ids);
  }

  return {
    groupOnlineMap: map,
    onlineIds: [...new Set(all)]
  };
}

client.login(process.env.DISCORD_TOKEN);
