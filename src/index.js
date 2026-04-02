import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";
import { parseHeartbeat, parseGP } from "./parser.js";
import {
  initTracker,
  createLiveMessage,
  updateUserInstances,
  activateBoost
} from "./tracker.js";

dotenv.config();

// =============================
// VALIDAR VARIABLES
// =============================
const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "GP_CHANNEL_ID",
  "HEARTBEAT_CHANNEL_ID",
  "STATS_CHANNEL_ID",
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
let trackingData = {};

// =============================
// READY
// =============================
client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    const usersRaw = await getGist(process.env.GIST_USERS);
    eliteUsers = JSON.parse(usersRaw);

    const onlineRaw = await getGist(process.env.GIST_ONLINE);
    onlineIds = cleanOnlineIds(onlineRaw);

    try {
      const trackingRaw = await getGist(process.env.GIST_TRACKING);
      trackingData = JSON.parse(trackingRaw);
    } catch {
      trackingData = {};
    }

    // 🔥 LIMPIAR CLAVES INVÁLIDAS
    for (const key in trackingData) {
      if (!/^\d+$/.test(key)) {
        console.log("🧹 Eliminando clave inválida:", key);
        delete trackingData[key];
      }
    }

    initTracker(
      client,
      process.env.STATS_CHANNEL_ID,
      async (data) => {
        await updateGist(
          process.env.GIST_TRACKING,
          JSON.stringify(data, null, 2)
        );
      },
      trackingData
    );

    await createLiveMessage();

  } catch (err) {
    console.error("❌ Error cargando GISTS:", err.message);
  }

  // Actualizar online cada minuto
  setInterval(async () => {
    try {
      const onlineRaw = await getGist(process.env.GIST_ONLINE);
      onlineIds = cleanOnlineIds(onlineRaw);
    } catch (err) {
      console.error("❌ Error actualizando online:", err.message);
    }
  }, 60000);
});

// =============================
// MENSAJES
// =============================
client.on("messageCreate", async (msg) => {
  try {

    // HEARTBEAT
    if (msg.channel.id === process.env.HEARTBEAT_CHANNEL_ID) {
      const data = parseHeartbeat(msg);
      if (!data) return;

      const user = findUserByName(data.name);
      if (!user) return;

      const isOnline =
        onlineIds.includes(user.main_id) ||
        onlineIds.includes(user.sec_id);

      if (!isOnline) {
        updateUserInstances(user.discord_id, 0);
        return;
      }

      updateUserInstances(user.discord_id, data.instances);
    }

    // GP
    if (msg.channel.id === process.env.GP_CHANNEL_ID) {
      const name = parseGP(msg);
      if (!name) return;

      const user = findUserByName(name);
      if (!user) return;

      activateBoost(user.discord_id);

      if (!trackingData[user.discord_id]) {
        trackingData[user.discord_id] = {
          xp: 0,
          time: 0,
          gp: 0
        };
      }

      trackingData[user.discord_id].gp += 1;

      await updateGist(
        process.env.GIST_TRACKING,
        JSON.stringify(trackingData, null, 2)
      );

      console.log(`💎 GP + Boost activado para ${name}`);
    }

  } catch (err) {
    console.error("❌ Error messageCreate:", err.message);
  }
});

// =============================
// HELPERS
// =============================
function cleanOnlineIds(raw) {
  return raw
    .split("\n")
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

function normalize(str) {
  return str.toLowerCase().trim();
}

function findUserByName(name) {
  const normalized = normalize(name);

  for (const discordId in eliteUsers) {
    const user = eliteUsers[discordId];

    if (normalize(user.name) === normalized) {
      return {
        discord_id: discordId,
        main_id: user.main_id,
        sec_id: user.sec_id
      };
    }
  }

  return null;
}

client.login(process.env.DISCORD_TOKEN);
