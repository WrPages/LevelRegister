import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";
import { parseHeartbeat, parseGP } from "./parser.js";
import {
  initTracker,
  updateUserInstances,
  activateBoost
} from "./tracker.js";

dotenv.config();

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
let trackingData = {};

client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    const usersRaw = await getGist(process.env.GIST_USERS);
    eliteUsers = JSON.parse(usersRaw);

    const onlineRaw = await getGist(process.env.GIST_ONLINE);
    onlineIds = cleanOnlineIds(onlineRaw);

    const trackingRaw = await getGist(process.env.GIST_TRACKING);
    trackingData = trackingRaw ? JSON.parse(trackingRaw) : {};

  } catch (err) {
    console.error("❌ Error cargando gists:", err.message);
  }

  // 🔥 Inicializa tracker (ya crea o reutiliza mensaje automáticamente)
  await initTracker(
    client,
    process.env.STATS_CHANNEL_ID,
    async (data) => {
      await updateGist(process.env.GIST_TRACKING, data);
    },
    trackingData
  );

  // 🔄 Actualizar online cada minuto
  setInterval(async () => {
    try {
      const onlineRaw = await getGist(process.env.GIST_ONLINE);
      onlineIds = cleanOnlineIds(onlineRaw);
    } catch (err) {
      console.error("❌ Error actualizando online:", err.message);
    }
  }, 60000);
});

client.on("messageCreate", async (msg) => {
  try {
    // HEARTBEAT
    if (msg.channel.id === process.env.HEARTBEAT_CHANNEL_ID) {
      const data = parseHeartbeat(msg);

      if (!data) return;

      const matchedUser = Object.entries(eliteUsers).find(
        ([discordId, user]) =>
          user.name?.toLowerCase() === data.name?.toLowerCase() &&
          onlineIds.includes(user.main_id)
      );

      if (matchedUser) {
        const [discordId] = matchedUser;
        updateUserInstances(discordId, data.instances);
      }
    }

    // GP
    if (msg.channel.id === process.env.GP_CHANNEL_ID) {
      const name = parseGP(msg);
      if (!name) return;

      const matchedUser = Object.entries(eliteUsers).find(
        ([discordId, user]) =>
          user.name?.toLowerCase() === name?.toLowerCase()
      );

      if (matchedUser) {
        const [discordId] = matchedUser;
        activateBoost(discordId);
      }
    }

  } catch (err) {
    console.error("❌ Error en messageCreate:", err.message);
  }
});

function cleanOnlineIds(raw) {
  return raw
    .split("\n")
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

client.login(process.env.DISCORD_TOKEN);
