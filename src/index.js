import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";
import { parseHeartbeat, parseGP } from "./parser.js";
import {
  initUsers,
  updateHeartbeat,
  addGP,
  getUsers,
  resetLocalCounters
} from "./tracker.js";
import { buildStats } from "./display.js";

dotenv.config();

// ✅ VALIDACIÓN DE VARIABLES
const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "GP_CHANNEL_ID",
  "HEARTBEAT_CHANNEL_ID",
  "STATS_CHANNEL_ID",
  "GIST_TOKEN",
  "GIST_USERS",
  "GIST_ONLINE",
  "GIST_TRACKING"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Falta variable: ${key}`);
    process.exit(1);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let eliteUsers = {};
let onlineIds = [];

client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    // 🔹 Cargar usuarios
    const usersRaw = await getGist(process.env.GIST_USERS);
    eliteUsers = JSON.parse(usersRaw);

    // 🔹 Cargar online
    const onlineRaw = await getGist(process.env.GIST_ONLINE);
    onlineIds = cleanOnlineIds(onlineRaw);

    initUsers(eliteUsers);

    console.log(`👥 Usuarios cargados: ${Object.keys(eliteUsers).length}`);

  } catch (err) {
    console.error("❌ Error cargando gists:", err.message);
  }

  // 🔄 Actualizar online cada minuto
  setInterval(async () => {
    try {
      const onlineRaw = await getGist(process.env.GIST_ONLINE);
      onlineIds = cleanOnlineIds(onlineRaw);
    } catch (err) {
      console.error("❌ Error actualizando online:", err.message);
    }
  }, 60000);

  // 💾 Guardar + mostrar cada 30 min
  setInterval(async () => {
    try {
      const users = getUsers();

      await updateGist(process.env.GIST_TRACKING, users);

      const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

      if (channel) {
        await channel.send(buildStats(users));
      }

      console.log("💾 Datos guardados y enviados");

      resetLocalCounters();

    } catch (err) {
      console.error("❌ Error guardando datos:", err.message);
    }
  }, 1800000);
});

// 📩 Eventos de mensajes
client.on("messageCreate", async (msg) => {
  try {
    // HEARTBEAT
    if (msg.channel.id === process.env.HEARTBEAT_CHANNEL_ID) {
      const data = parseHeartbeat(msg);
      if (data) {
        updateHeartbeat(data, onlineIds);
      }
    }

    // GP
    if (msg.channel.id === process.env.GP_CHANNEL_ID) {
      const name = parseGP(msg);
      if (name) {
        console.log(`💎 GP detectado: ${name}`);
        addGP(name);
      }
    }

  } catch (err) {
    console.error("❌ Error en messageCreate:", err.message);
  }
});

// 🧹 Limpieza de IDs
function cleanOnlineIds(raw) {
  return raw
    .split("\n")
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

client.login(process.env.DISCORD_TOKEN);
