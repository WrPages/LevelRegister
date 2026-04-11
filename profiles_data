import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";

// =========================
// VARIABLES DE ENTORNO
// =========================

const TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN || !GITHUB_TOKEN) {
  throw new Error("Faltan variables de entorno");
}

const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
};

// =========================
// CONFIG
// =========================

const HEARTBEAT_CHANNELS = {
  trainer: "1486243169422020648",
  gym_leader: "1491238609578360833",
  elite_four: "1483616146996465735",
};

const GP_CHANNELS = [
  "1487362022864588902",
  "1491238471556403281",
  "1486277594629275770",
];

const OUTPUT_CHANNEL = "1484015417411244082";

const GISTS = {
  register_trainer: "1c066922bc39ac136b6f234fad6d9420",
  register_gym: "a3f5f3d8a2e6ddf2378fb3481dff49f6",
  register_elite_four: "bb18eda2ea748723d8fe0131dd740b70",

  online_trainer: "4edcf4d341cd4f7d5d0fb8a50f8b8c3c",
  online_gym: "e110c37b3e0b8de83a33a1b0a5eb64e8",
  online_elite_four: "d9db3a72fed74c496fd6cc830f9ca6e9",

  global: "8f3c918d57e1dbf417d068684fbfa238",
};

// =========================
// CLIENT
// =========================

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const lastSeen = {};

// =========================
// GIST FUNCTIONS
// =========================

async function getGistData(id) {
  try {
    const res = await axios.get(`https://api.github.com/gists/${id}`, {
      headers: HEADERS,
    });

    const file = Object.values(res.data.files)[0];
    return JSON.parse(file.content);
  } catch (err) {
    console.log("Error leyendo gist", err.message);
    return {};
  }
}

async function updateGist(id, data) {
  try {
    await axios.patch(
      `https://api.github.com/gists/${id}`,
      {
        files: {
          "data.json": {
            content: JSON.stringify(data, null, 2),
          },
        },
      },
      { headers: HEADERS }
    );
  } catch (err) {
    console.log("Error guardando gist", err.message);
  }
}

// =========================
// HELPERS
// =========================

function getUser(groupData, name) {
  for (const [id, data] of Object.entries(groupData)) {
    if (data.name.toLowerCase() === name.toLowerCase()) {
      return [id, data];
    }
  }
  return [null, null];
}

function extractInstances(text) {
  const match = text.match(/Online:\s*(.+)/);
  if (!match) return 0;

  const line = match[1];
  if (line.toLowerCase().includes("none")) return 0;

  const nums = line.match(/\b\d+\b/g);
  return nums ? nums.length : 0;
}

function extractPacks(text) {
  const match = text.match(/Packs:\s*(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function updateLevel(user) {
  user.level = Math.floor(user.xp / 10);
}

// =========================
// EVENT
// =========================

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;

  // =========================
  // HEARTBEAT
  // =========================
  for (const [group, chId] of Object.entries(HEARTBEAT_CHANNELS)) {
    if (channelId === chId) {
      const key = group === "gym_leader" ? "gym" : group;

      const register = await getGistData(GISTS[`register_${key}`]);
      const online = await getGistData(GISTS[`online_${key}`]);
      const globalStats = await getGistData(GISTS["global"]);

      const lines = message.content.split("\n");
      const username = lines[0].trim();

      const [discordId, userData] = getUser(register, username);
      if (!discordId) return;

      if (!globalStats[discordId]) {
        globalStats[discordId] = {
          name: username,
          rol: group,
          time: 0,
          xp: 0,
          level: 0,
          instances: 0,
          total_packs: 0,
          temp_packs: 0,
          gp: 0,
          online: false,
        };
      }

      const user = globalStats[discordId];

      const instances = extractInstances(message.content);
      const packs = extractPacks(message.content);

      let isOnline = false;

      if (online.includes(userData.main_id)) isOnline = true;
      if (userData.sec_id && online.includes(userData.sec_id)) isOnline = true;

      const now = Date.now();

      if (isOnline) {
        if (lastSeen[discordId]) {
          const diff = (now - lastSeen[discordId]) / 60000;
          user.time += diff;
          user.xp += diff;
          updateLevel(user);
        }
        lastSeen[discordId] = now;
      }

      if (isOnline) {
        user.temp_packs = packs;
      } else {
        if (user.temp_packs > 0) {
          user.total_packs += user.temp_packs;
          user.temp_packs = 0;
        }
      }

      if (instances > user.instances) {
        user.instances = instances;
      }

      user.online = isOnline;

      await updateGist(GISTS.global, globalStats);
      await sendOutput(message.guild, globalStats);
    }
  }

  // =========================
  // GODPACK
  // =========================
  if (GP_CHANNELS.includes(channelId)) {
    const globalStats = await getGistData(GISTS.global);

    const match = message.content.match(/^@(\w+)/);
    if (match) {
      const username = match[1];

      for (const user of Object.values(globalStats)) {
        if (user.name.toLowerCase() === username.toLowerCase()) {
          user.gp += 1;
          break;
        }
      }

      await updateGist(GISTS.global, globalStats);
      await sendOutput(message.guild, globalStats);
    }
  }
});

// =========================
// OUTPUT
// =========================

async function sendOutput(guild, data) {
  const channel = await guild.channels.fetch(OUTPUT_CHANNEL);

  let msg = "```json\n";

  for (const [uid, u] of Object.entries(data)) {
    const packs = u.total_packs + u.temp_packs;

    msg += `"${uid}": {\n`;
    msg += `  "name": "${u.name}",\n`;
    msg += `  "rol": "${u.rol}",\n`;
    msg += `  "time": ${Math.floor(u.time)},\n`;
    msg += `  "xp": ${Math.floor(u.xp)},\n`;
    msg += `  "level": ${u.level},\n`;
    msg += `  "instances": ${u.instances},\n`;
    msg += `  "packs": ${packs},\n`;
    msg += `  "gp": ${u.gp}\n`;
    msg += "},\n";
  }

  msg += "```";

  await channel.send(msg);
}

// =========================
// RUN
// =========================

client.login(TOKEN);
