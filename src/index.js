
import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
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
  throw new Error("❌ FALTA GIST_SETTINGS en Railway");
}
if (!process.env.GIST_PROFILES) {
  throw new Error("❌ FALTA GIST_PROFILES en Railway");
}
if (!process.env.PROFILE_FORUM_CHANNEL_ID) {
  throw new Error("❌ FALTA PROFILE_FORUM_CHANNEL_ID en Railway");
}

if (!process.env.RANKING_CHANNEL_ID) {
  throw new Error("❌ FALTA RANKING_CHANNEL_ID en Railway");
}
const pokemonDataset = JSON.parse(
  fs.readFileSync("./pokemon_dataset.json", "utf8")
);
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
let rankingMessageId = null;
let userSettings = {};
let userProfiles = {};
let profileEditState = {};
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
console.log("EJEMPLO IDMAP:", Object.entries(idMap).slice(0, 10));
console.log("ONLINE IDS:", onlineIds.slice(0, 10));
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
let profileSaveTimeout;

function saveProfiles() {
  clearTimeout(profileSaveTimeout);
  profileSaveTimeout = setTimeout(() => {
    updateGist(process.env.GIST_PROFILES, userProfiles, "profiles.json");
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
function getProfilePostUrl(post) {
  return `https://discord.com/channels/${post.guildId}/${post.id}`;
}

function buildProfileButton(post) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Ver perfil completo")
      .setStyle(ButtonStyle.Link)
      .setURL(getProfilePostUrl(post))
  );
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

// =============================pokepokepoke

// =============================fin poke finfin
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
userProfiles = await getParsedGist(process.env.GIST_PROFILES, "profiles.json");

rankingMessageId = userSettings.rankingMessageId || null;

  sanitizeTracking();


  // =============================
  // 6️⃣ EJECUTAR PRIMERA ACTUALIZACIÓN
  // =============================
  console.log("🚀 Ejecutando actualización inicial...");

await runTrackingCycle();
await scanHeartbeats();
await updateRanking();

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
for (const id in liveTracker) {

  let stillOnline = false;

  for (const uid of onlineIds) {
    if (idMap[String(uid)] === id) {
      stillOnline = true;
      break;
    }
  }

  if (!stillOnline) {

    if (!trackingData[id]) continue;

    if (trackingData[id].currentpacks > 0) {
      trackingData[id].totalpacks += trackingData[id].currentpacks;
      trackingData[id].currentpacks = 0;
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
    // 🔥 XP independiente para Pokémon


 

// ...

}

    await updatePanels();
    await updateRanking();

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
  
 const userLevel = Math.floor(totalXP / 20);

// 🔥 Nivel del Pokémon separado
//if (!trackingData[id].pokemonXP) {
//  trackingData[id].pokemonXP = 0;
//}

//const pokemonLevel = Math.floor(trackingData[id].pokemonXP / 20);
///  ctx.fillStyle = "#ffffff";
//ctx.font = "28px sans-serif";
//ctx.fillText(`Nivel: ${level}`, 50, 80);
// 🔥 Cargar estado real desde pokemonSystem (gist)


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

  let displayName = "Unknown";

try {
  const guild = client.guilds.cache.get("1483615153743462571");
  const member = await guild.members.fetch(id).catch(() => null);

  if (member) {
    displayName = member.displayName; // nombre actual del server
  }
} catch {}

if (!displayName || displayName === "Unknown") {
  displayName =
    s?.name ||
    trackingData[id]?.name ||
    eliteUsers[id]?.name ||
    "Unknown";
}
  

if (settings.bg?.type === "base64") {
  const buffer = Buffer.from(settings.bg.data, "base64");
  bg = await loadImage(buffer);
} else {
  bg = await loadImageCached("./assets/card.png");
}
  ctx.drawImage(bg, 0, 0, 800, 450);

  ctx.fillStyle = settings.nameColor;
  ctx.font = "50px Righteous";

ctx.fillText(displayName, 40, 80);

  ctx.fillStyle = role.color;
  ctx.font = "22px Righteous";
  ctx.fillText(role.name, 42, 110);

ctx.fillStyle = "#00ffcc";
ctx.font = "38px Righteous";
ctx.fillText(`Lv ${userLevel}`, 620, 80); // SOLO nivel usuario


//  ctx.font = "24px sans-serif";
//ctx.fillText(`Nivel: ${level}`, 50, 90);

  ctx.fillStyle = settings.textColor;
  ctx.font = "24px Righteous";

  ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 170);
  ctx.fillText(`Tiempo: ${totalTime}m`, 40, 210);
  ctx.fillText(`Instancias: ${t.recordInstances || 0}`, 40, 250);
  const totalPacks = (t.totalpacks || 0) + (t.currentpacks || 0);
ctx.fillText(`Packs: ${totalPacks}`, 40, 290);
  ctx.fillText(`GP: ${t.gp || 0}`, 40, 330);

return {
  file: new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" })
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
  str
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^\w]/g, "");

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
    normalize(user.name) === cleanName ||
    normalize(user.name).includes(cleanName)
  );
    console.log("RAW:", rawName);
console.log("CLEAN:", cleanName);
    
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
  lastHeartbeatPacks: 0, 
  gp: 0,
  recordInstances: 0,
  lastHeartbeatMessageId: null
};
      }

    

      let content = msg.content.replace(/```/g, "").trim();

      // =====================
      // 📦 PACKS
      // =====================
      // =====================
// 📦 PACKS
// =====================
const packsMatch = content.match(/packs:\s*(\d+)/i);

if (packsMatch) {

  const current = Number(packsMatch[1]);

  if (trackingData[id].lastHeartbeatPacks === undefined) {
    trackingData[id].lastHeartbeatPacks = current;
  }

  if (current < trackingData[id].lastHeartbeatPacks) {
    trackingData[id].totalpacks += trackingData[id].currentpacks;
    trackingData[id].currentpacks = current;
  } else {
    trackingData[id].currentpacks = current;
  }

  trackingData[id].lastHeartbeatPacks = current;
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
function ensureUserProfile(id) {
  if (!userProfiles[id]) {
    userProfiles[id] = {
      favoritePokemon: [],
      favoriteCard: null,
      favoriteDeck: null,
      mostValuableCard: null,
      rarestCard: null,
      bestGP: null,
      maxRank: null,
      profileBg: null,
      customLabels: {},
      status: "",
      quote: ""
    };
  }

  if (!userProfiles[id].customLabels) userProfiles[id].customLabels = {};
  return userProfiles[id];
}

function normalizePokemonName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
const GIF_BASE_URL = "https://raw.githubusercontent.com/WrPages/gif_database/main/";

function encodeGifUrl(url) {
  return url
    .split("/")
    .map((part, index) => index < 3 ? part : encodeURIComponent(part))
    .join("/");
}


function findPokemonInDataset(name) {
  const cleanName = normalizePokemonName(name);

  if (!pokemonDataset) return null;

  for (const line of pokemonDataset.evolution_lines || []) {
    const stageIndex = line.stages.findIndex(
      p => normalizePokemonName(p) === cleanName
    );

    if (stageIndex !== -1) {
      return {
        name: normalizePokemonName(line.stages[stageIndex]),
        generation: line.generation,
        legendary: false
      };
    }
  }

  for (const legendary of pokemonDataset.legendary || []) {
    if (normalizePokemonName(legendary) === cleanName) {
      return {
        name: normalizePokemonName(legendary),
        generation: null,
        legendary: true
      };
    }
  }

  return null;
}

function getPokemonGifUrlFromDataset(name) {

  const isShiny = name.startsWith("s_");
  const cleanName = name.replace(/^s_/, "");

  const data = pokemonDataset[cleanName];
  if (!data) return null;

  // 👇 usa shiny si existe
  if (isShiny && data.shiny) return data.shiny;

  return data.gif || data.image || null;
}




function imageObjectToAttachment(imageObj, name) {
  if (!imageObj?.data) return null;

  const buffer = Buffer.from(imageObj.data, "base64");

  return new AttachmentBuilder(buffer, { name });
}

function buildProfileMainEmbed(id) {
  const profile = ensureUserProfile(id);
  const t = trackingData[id] || {};
  const s = liveTracker[id] || {};

  const totalXP = (t.xp || 0) + (s.sessionXP || 0);
  const level = Math.floor(totalXP / 20);

  return new EmbedBuilder()
    .setTitle(`📘 Perfil de ${t.name || s.name || "Usuario"}`)
    .setColor("#00ffcc")
    .setDescription(profile.quote || "Perfil de reroll TCG Pocket")
    .addFields(
      { name: "⭐ Nivel", value: `${level}`, inline: true },
      { name: "✨ XP", value: `${Math.floor(totalXP)}`, inline: true },
      { name: "🏆 GP actual", value: `${t.gp || 0}`, inline: true },
      { name: "🥇 Mejor GP", value: profile.bestGP ? "Imagen subida ✅" : "No definido", inline: true },
{ name: "🏅 Rango máximo", value: profile.maxRank ? "Imagen subida ✅" : "No definido", inline: true },
      { name: "🔥 Estado", value: profile.status || "No definido", inline: true }
    );
}

function buildPokemonFavoriteEmbeds(id) {
  const profile = ensureUserProfile(id);
  const pokemons = profile.favoritePokemon || [];

  if (pokemons.length === 0) return [];

  const embed = new EmbedBuilder()
    .setColor(0x00ffff)
    .setTitle("Pokemones favoritos");

  // 👇 metemos los 3 gifs en una sola imagen vertical
  const images = pokemons.slice(0, 3).map(p => {
    const name = p.toLowerCase();
    return getPokemonGif(name);
  });

  // solo usa la primera como imagen principal (limitación de Discord)
  embed.setImage(images[0]);

  // los otros como campos invisibles con imagen
  if (images[1]) embed.addFields({ name: "\u200B", value: images[1] });
  if (images[2]) embed.addFields({ name: "\u200B", value: images[2] });

  return [embed];
}
async function buildProfileCollage(id) {
  const profile = ensureUserProfile(id);

  const canvas = createCanvas(900, 1600);
  const ctx = canvas.getContext("2d");

  // Fondo personalizado o fondo default
  if (profile.profileBg?.data) {
    try {
      const bg = await loadImage(Buffer.from(profile.profileBg.data, "base64"));

      const ratio = Math.max(900 / bg.width, 1600 / bg.height);
      const w = bg.width * ratio;
      const h = bg.height * ratio;

      ctx.drawImage(bg, (900 - w) / 2, (1600 - h) / 2, w, h);
    } catch {
      const gradient = ctx.createLinearGradient(0, 0, 900, 1600);
      gradient.addColorStop(0, "#111827");
      gradient.addColorStop(1, "#020617");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 900, 1600);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 900, 1600);
    gradient.addColorStop(0, "#111827");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 900, 1600);
  }

  // Capa oscura para que el texto se lea sobre cualquier fondo
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 0, 900, 1600);

  const label = (key, fallback) => profile.customLabels?.[key] || fallback;



const slots = [
  {
    key: "favoriteCard",
    label: label("favoriteCard", "Carta favorita"),
    x: 55,
    y: 70,
    w: 220,
    h: 300
  },
  {
    key: "mostValuableCard",
    label: label("mostValuableCard", "Carta más valiosa"),
    x: 340,
    y: 70,
    w: 220,
    h: 300
  },
  {
    key: "rarestCard",
    label: label("rarestCard", "Carta más deseada"),
    x: 625,
    y: 70,
    w: 220,
    h: 300
  },

  {
    key: "favoriteDeck",
    label: label("favoriteDeck", "Mazo favorito"),
    x: 110,
    y: 460,
    w: 680,
    h: 520
  },

  {
    key: "maxRank",
    label: label("maxRank", "Rango máximo alcanzado"),
    x: 55,
    y: 1090,
    w: 360,
    h: 300
  },
  {
    key: "bestGP",
    label: label("bestGP", "Mejor GP"),
    x: 465,
    y: 1090,
    w: 380,
    h: 340
  }
];

  function drawPlaceholder(x, y, w, h) {
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 24);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sin imagen", x + w / 2, y + h / 2 + 8);
  }

  async function drawSlot(slot) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(slot.label, slot.x + slot.w / 2, slot.y);

    const imgX = slot.x;
    const imgY = slot.y + 28;
    const imgW = slot.w;
    const imgH = slot.h;

    const imgObj = profile[slot.key];

    if (!imgObj?.data) {
      drawPlaceholder(imgX, imgY, imgW, imgH);
      return;
    }

    try {
      const img = await loadImage(Buffer.from(imgObj.data, "base64"));

      // Muestra la imagen completa, sin cortarla
      const ratio = Math.min(imgW / img.width, imgH / img.height);

      const w = img.width * ratio;
      const h = img.height * ratio;

      const dx = imgX + (imgW - w) / 2;
      const dy = imgY + (imgH - h) / 2;

ctx.globalAlpha = 0.85;
ctx.drawImage(img, dx, dy, w, h);
ctx.globalAlpha = 1;
    } catch (err) {
      console.error(`Error dibujando ${slot.key}:`, err.message);
      drawPlaceholder(imgX, imgY, imgW, imgH);
    }
  }

  for (const slot of slots) {
    await drawSlot(slot);
  }

  const fileName = `perfil-collage-${id}-${Date.now()}.png`;

  return {
    file: new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: fileName
    }),
    fileName
  };
}

async function updateUserProfilePost(id) {
  const panel = userPanels[id];
  if (!panel?.postId) return;

  const post = await client.channels.fetch(panel.postId).catch(() => null);
  if (!post) return;

  const collage = await buildProfileCollage(id);

  let profileMsg = null;

  if (panel.profileMessageId) {
    profileMsg = await post.messages.fetch(panel.profileMessageId).catch(() => null);
  }

  const pokemonEmbeds = buildPokemonFavoriteEmbeds(id);

  const payload = {
    content: "",

    // 👇 AQUÍ VA LA IMAGEN COMO ARCHIVO (NO embed)
    files: [collage.file],

    // 👇 SOLO los Pokémon como embed
    embeds: pokemonEmbeds.slice(0, 10),

    attachments: []
  };

  if (profileMsg) {
    await profileMsg.edit(payload);
  } else {
    profileMsg = await post.send(payload);
    userPanels[id].profileMessageId = profileMsg.id;
    savePanels();
  }
}


//let updatingPanels = false;
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

    if (!liveTracker[id]) continue;

const { file } = await renderPanel(id, channel);

  
    // =============================
// 🔁 PANEL YA EXISTE
// =============================
if (userPanels[id]?.messageId) {

  let msg = null;

  try {
    msg = await channel.messages.fetch({
      message: userPanels[id].messageId,
      force: true
    });
  } catch {}

  if (!msg) {
    console.log(`⚠️ Mensaje no encontrado (${id}), recreando...`);
    delete userPanels[id];
    savePanels();
  } else {

    // 🔁 Editar panel
const post = await client.channels.fetch(userPanels[id].postId).catch(() => null);

await msg.edit({
  files: [file],
  components: post ? [buildProfileButton(post)] : []
});

if (!post) {
  console.log(`⚠️ Post no encontrado (${id}), recreando perfil...`);
}

if (post) {
  savePanels();
}
    }

    continue; // 🔥 IMPORTANTE
  
}

// =============================
// 🆕 CREAR PANEL NUEVO
// =============================
const forum = await client.channels.fetch(process.env.PROFILE_FORUM_CHANNEL_ID);

if (!forum || forum.type !== ChannelType.GuildForum) {
  throw new Error("❌ PROFILE_FORUM_CHANNEL_ID no es un canal foro válido.");
}

const post = await forum.threads.create({
  name: `Perfil de ${liveTracker[id]?.name || trackingData[id]?.name || id}`,
  autoArchiveDuration: 1440,
  message: {
    content: "🎮 Perfil completo del usuario"
  }
});

const sent = await channel.send({
  files: [file],
  components: [buildProfileButton(post)]
});

const menu = new ActionRowBuilder().addComponents(
  new StringSelectMenuBuilder()
    .setCustomId(`menu_${id}`)
    .setPlaceholder("Personalizar perfil")
    .addOptions([
      { label: "Cambiar fondo del panel", value: "bg" },
      { label: "Color nombre", value: "name" },
      { label: "Color texto", value: "text" },
      { label: "Agregar Pokémon favorito", value: "pokemon" },
      { label: "Subir carta favorita", value: "favoriteCard" },
      { label: "Subir mazo favorito", value: "favoriteDeck" },
      { label: "Subir carta más valiosa", value: "mostValuableCard" },
      { label: "Subir carta más rara", value: "rarestCard" },
      { label: "Subir imagen de mejor GP", value: "bestGP" },
      { label: "Subir imagen de rango máximo", value: "maxRank" },
      { label: "Estado", value: "status" },
      { label: "Frase del perfil", value: "quote" },
      { label: "Cambiar fondo del perfil", value: "profileBg" },
{ label: "Subir imagen extra 1", value: "extraImage1" },
{ label: "Subir imagen extra 2", value: "extraImage2" },
{ label: "Cambiar textos del perfil", value: "profileLabels" },
    ])
);

await post.send({
  content: "🎮 Personaliza tu panel",
  components: [menu],
});

userPanels[id] = {
  messageId: sent.id,
  postId: post.id,
  profileMessageId: null
};

savePanels();

await updateUserProfilePost(id);
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
  profileEditState[i.user.id] = "panelBg";

  return i.reply({
    content: "🖼️ Sube una imagen para el fondo del panel principal.",
    ephemeral: true
  });
}

    if (option === "pokemon") {
  profileEditState[i.user.id] = "pokemon";
  return i.reply({
    content: "❤️ Escribe el nombre del Pokémon favorito. Máximo 3 Pokémon.",
    ephemeral: true
  });
}

if (option === "favoriteCard") {
  profileEditState[i.user.id] = "favoriteCard";
  return i.reply({
    content: "🎴 Sube una imagen de tu carta favorita.",
    ephemeral: true
  });
}

if (option === "favoriteDeck") {
  profileEditState[i.user.id] = "favoriteDeck";
  return i.reply({
    content: "🃏 Sube una imagen de tu mazo favorito.",
    ephemeral: true
  });
}

if (option === "mostValuableCard") {
  profileEditState[i.user.id] = "mostValuableCard";
  return i.reply({
    content: "💎 Sube una imagen de tu carta más valiosa.",
    ephemeral: true
  });
}

if (option === "rarestCard") {
  profileEditState[i.user.id] = "rarestCard";
  return i.reply({
    content: "🌟 Sube una imagen de tu carta más rara.",
    ephemeral: true
  });
}

if (option === "bestGP") {
  profileEditState[i.user.id] = "bestGP";
  return i.reply({
    content: "🥇 Sube una imagen de tu mejor GP obtenido.",
    ephemeral: true
  });
}

if (option === "maxRank") {
  profileEditState[i.user.id] = "maxRank";
  return i.reply({
    content: "🏅 Sube una imagen de tu rango máximo alcanzado.",
    ephemeral: true
  });
}
    if (option === "profileBg") {
  profileEditState[i.user.id] = "profileBg";
  return i.reply({
    content: "🖼️ Sube la imagen que quieres usar como fondo del perfil.",
    ephemeral: true
  });
}

if (option === "status") {
  profileEditState[i.user.id] = "status";
  return i.reply({
    content: "🔥 Escribe tu estado. Ejemplo: Competitivo, Farmeando, Descanso.",
    ephemeral: true
  });
}

if (option === "quote") {
  profileEditState[i.user.id] = "quote";
  return i.reply({
    content: "💬 Escribe tu frase personalizada.",
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
    .find(([_, data]) => data.postId === i.channel.id);
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
  if (msg.content.toLowerCase().trim() === "ranking update") {
  await updateRanking();
  return msg.reply("✅ Ranking actualizado.");
}

  // =============================
  // 🔥 1. TRACKING GLOBAL (SIEMPRE)
  // =============================


  // 📦 WEBHOOK (packs + instancias)
 
 
  // =============================
  // 🎨 2. PERSONALIZACIÓN (SOLO THREAD)
  // =============================

  const entry = Object.entries(userPanels)
    .find(([_, d]) => d.postId === msg.channel.id);

  if (!entry) return;

  const [id] = entry;

  if (!userSettings[id]) userSettings[id] = {};

  const profile = ensureUserProfile(id);
const activeProfileEdit = profileEditState[msg.author.id];

  const content = msg.content.toLowerCase().trim();
  if (content === "pokemon reset") {
  profile.favoritePokemon = [];
  saveProfiles();
  await updateUserProfilePost(id);
  return msg.reply("✅ Pokémon favoritos reiniciados.");
}

if (content === "perfil actualizar") {
  await updateUserProfilePost(id);
  return msg.reply("✅ Perfil actualizado.");
}

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

if (activeProfileEdit === "pokemon") {
  const pokemonName = msg.content.trim();

  if (!pokemonName) {
    return msg.reply("❌ Escribe un nombre válido.");
  }

  if (profile.favoritePokemon.length >= 3) {
    delete profileEditState[msg.author.id];
    return msg.reply("❌ Ya tienes 3 Pokémon favoritos. Usa `pokemon reset` para borrar la lista.");
  }

  const gif = getPokemonGifUrlFromDataset(pokemonName);

  if (!gif) {
    return msg.reply("❌ No encontré ese Pokémon en la base de datos. Revisa el nombre.");
  }

  profile.favoritePokemon.push({
    name: normalizePokemonName(pokemonName),
    gif
  });

  delete profileEditState[msg.author.id];
  saveProfiles();

  await updateUserProfilePost(id);

  return msg.reply(`✅ Pokémon favorito agregado: **${pokemonName}**`);
}

if (activeProfileEdit === "status") {
  profile.status = msg.content.trim();
  delete profileEditState[msg.author.id];
  saveProfiles();
  await updateUserProfilePost(id);
  return msg.reply("✅ Estado actualizado.");
}

if (activeProfileEdit === "quote") {
  profile.quote = msg.content.trim();
  delete profileEditState[msg.author.id];
  saveProfiles();
  await updateUserProfilePost(id);
  return msg.reply("✅ Frase actualizada.");
}

  if (activeProfileEdit === "profileLabels") {
  const parts = msg.content.split("=");
  if (parts.length < 2) {
    return msg.reply("Usa: `favoriteCard=Mi texto`");
  }

  const key = parts[0].trim();
  const value = parts.slice(1).join("=").trim();

  profile.customLabels[key] = value;

  delete profileEditState[msg.author.id];
  saveProfiles();
  await updateUserProfilePost(id);

  return msg.reply("✅ Texto actualizado.");
}
  // =============================
  // 🖼️ FONDO
  // =============================
if (msg.attachments.size > 0) {
  const file = msg.attachments.first();

  if (!activeProfileEdit) {
    return msg.reply("❌ Primero selecciona en el menú qué imagen quieres cambiar.");
  }

  if (!file.url.match(/\.(png|jpg|jpeg|webp)(\?.*)?$/i)) {
    return msg.reply("❌ Solo se aceptan imágenes png, jpg, jpeg o webp.");
  }

  const res = await fetch(file.url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const profileFields = [
    "favoriteCard",
    "favoriteDeck",
    "mostValuableCard",
    "rarestCard",
    "bestGP",
    "maxRank",
    "profileBg"
  ];

  if (profileFields.includes(activeProfileEdit)) {
    profile[activeProfileEdit] = {
      type: "base64",
      data: base64
    };

    delete profileEditState[msg.author.id];

    saveProfiles();
    await updateUserProfilePost(id);

    return msg.reply(`✅ Imagen actualizada en perfil: ${activeProfileEdit}`);
  }

  if (activeProfileEdit === "panelBg") {
    userSettings[id].bg = {
      type: "base64",
      data: base64
    };

    delete profileEditState[msg.author.id];

    saveSettings();
    await forceRender(id);

    return msg.reply("✅ Fondo del panel principal actualizado.");
  }

  return msg.reply(`❌ Tipo de edición no reconocido: ${activeProfileEdit}`);
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

const post = await client.channels.fetch(userPanels[id].postId).catch(() => null);

await msg.edit({
  files: [file],
  components: post ? [buildProfileButton(post)] : []
});
}


  //////resetpokemon
  function resetPokemon(userId) {
  if (!trackingData[userId]) return;

  trackingData[userId].pokemonXP = 0;
  trackingData[userId].pokemonLineId = null;
  trackingData[userId].pokemonStage = 0;
  trackingData[userId].pokemonShiny = false;
}
function resetAllPokemon() {
  for (const id in trackingData) {
    resetPokemon(id);
  }
}

function getUserRanking() {
  return Object.entries(trackingData)
    .map(([id, data]) => {
      const session = liveTracker[id] || {};

      const totalXP = (data.xp || 0) + (session.sessionXP || 0);
      const level = Math.floor(totalXP / 20);

      return {
        id,
        name: data.name || session.name || "Unknown",
        level,
        xp: Math.floor(totalXP),
        gp: data.gp || 0,
        packs: (data.totalpacks || 0) + (data.currentpacks || 0),
        instances: data.recordInstances || 0
      };
    })
    .sort((a, b) => b.level - a.level || b.xp - a.xp);
}

function buildRankingEmbed() {
  const ranking = getUserRanking().slice(0, 10);

  const description = ranking.map((u, index) => {
    const medal =
      index === 0 ? "🥇" :
      index === 1 ? "🥈" :
      index === 2 ? "🥉" :
      `#${index + 1}`;

    return `${medal} <@${u.id}> — **Lv ${u.level}** | XP: ${u.xp} | GP: ${u.gp} | Packs: ${u.packs}`;
  }).join("\n");

  return new EmbedBuilder()
    .setTitle("🏆 Ranking de Rerollers")
    .setColor("#ffd700")
    .setDescription(description || "Todavía no hay usuarios en el ranking.")
    .setFooter({ text: "Ordenado por nivel de usuario" })
    .setTimestamp();
}
async function updateRanking() {
  try {
    const channel = await client.channels.fetch(process.env.RANKING_CHANNEL_ID);

    if (!channel) return;

    let message = null;

    if (rankingMessageId) {
      message = await channel.messages.fetch(rankingMessageId).catch(() => null);
    }

    const embed = buildRankingEmbed();

    if (message) {
      await message.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      rankingMessageId = sent.id;
    }

  } catch (err) {
    console.log("❌ Error actualizando ranking:", err.message);
  }
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
if (typeof s.gp === "number") {
  trackingData[id].gp = s.gp;
}
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
    //trackingData[k].pokemonXP = Number(trackingData[k].pokemonXP) || 0;
    trackingData[k].lastHeartbeatPacks =
  Number(trackingData[k].lastHeartbeatPacks) || 0;
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
