import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= CONFIG =================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// 👉 GIST IDS
const PROFILE_GIST = "8f3c918d57e1dbf417d068684fbfa238";

const REGISTRY_GISTS = {
  trainer: "1c066922bc39ac136b6f234fad6d9420",
  gym: "a3f5f3d8a2e6ddf2378fb3481dff49f6",
  elite: "bb18eda2ea748723d8fe0131dd740b70"
};

const ONLINE_GISTS = {
  trainer: "4edcf4d341cd4f7d5d0fb8a50f8b8c3c",
  gym: "e110c37b3e0b8de83a33a1b0a5eb64e8",
  elite: "d9db3a72fed74c496fd6cc830f9ca6e9"
};

// 👉 CANALES
const HEARTBEAT_CHANNEL_ID = "1492795826857054301";

const GP_CHANNELS = [
  "1487362022864588902",
  "1484015417411244082",
  "1486277594629275770"
];

const PROFILE_CHANNEL_ID = "1484015417411244082";

// ================= CACHE =================

let profilesCache = {};
let lastHeartbeatMessageId = null;
let leaderboardMessageId = null;

// ================= GIST =================

async function getGist(gistId) {
  const res = await axios.get(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });

  const file = Object.values(res.data.files)[0];
  const content = file.content.trim();

  try {
    // 👉 intenta como JSON (registros)
    return JSON.parse(content);
  } catch {
    // 👉 si falla, es TXT (usuarios online)
    return content
      .split("\n")
      .map(x => x.replace(/\r/g, "").trim())
      .filter(x => x.length > 0);
  }
}

async function updateGist(gistId, content) {
  await axios.patch(
    `https://api.github.com/gists/${gistId}`,
    {
      files: {
        "data.json": {
          content: JSON.stringify(content, null, 2)
        }
      }
    },
    {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    }
  );
}

// ================= HELPERS =================

function formatRole(role) {
  if (role === "elite") return "Elite Four";
  if (role === "gym") return "Gym Leader";
  return "Trainer";
}

function getHighestRole(current, incoming) {
  const hierarchy = ["Trainer", "Gym Leader", "Elite Four"];
  return hierarchy.indexOf(incoming) > hierarchy.indexOf(current)
    ? incoming
    : current;
}

// ================= NUEVO: CARGAR TODOS LOS USUARIOS =================

async function loadAllUsers() {
  for (const group in REGISTRY_GISTS) {
    const registry = await getGist(REGISTRY_GISTS[group]);

    for (const discordId in registry) {
      const user = registry[discordId];

      if (!profilesCache[discordId]) {
        profilesCache[discordId] = {
          xp: 0,
          time: 0,
          totalpacks: 0,
          currentpacks: 0,
          gp: 0,
          recordInstances: 0,
          name: user.name,
          role: formatRole(group),
          online: false
        };
      } else {
        profilesCache[discordId].role = getHighestRole(
          profilesCache[discordId].role,
          formatRole(group)
        );
      }
    }
  }
}

// ================= ONLINE USERS =================

async function getOnlineUsers() {
  let users = [];

  for (const group in ONLINE_GISTS) {
    const onlineList = await getGist(ONLINE_GISTS[group]);
    const registry = await getGist(REGISTRY_GISTS[group]);

    for (const discordId in registry) {
      const user = registry[discordId];

      if (onlineList.includes(String(user.main_id).trim())){
        users.push({
          discordId,
          name: user.name,
          role: formatRole(group)
        });
      }
    }
  }

  return users;
}

// ================= TIEMPO =================

async function updateStats() {
  const onlineUsers = await getOnlineUsers();

  // todos offline primero
  for (const id in profilesCache) {
    profilesCache[id].online = false;
  }

  for (const user of onlineUsers) {
    const profile = profilesCache[user.discordId];
    if (!profile) continue;

    profile.online = true;
    profile.time += 1;
    profile.role = getHighestRole(profile.role, user.role);
  }

  await updateGist(PROFILE_GIST, profilesCache);
}

// ================= HEARTBEAT (MODIFICADO PRO) =================

async function parseHeartbeat() {
  const channel = await client.channels.fetch(HEARTBEAT_CHANNEL_ID);
  const messages = await channel.messages.fetch({ limit: 50 });

  const latestByUser = {};

  for (const msg of messages.values()) {
    const username = msg.content.split("\n")[0]?.trim();
    if (!username) continue;

    if (!latestByUser[username]) {
      latestByUser[username] = msg;
    }
  }

  for (const username in latestByUser) {
    const msg = latestByUser[username];
    const lines = msg.content.split("\n");

    const onlineLine = lines.find(l => l.startsWith("Online:"));
    const packsLine = lines.find(l => l.includes("Packs:"));

    if (!onlineLine || !packsLine) continue;

    const instances = onlineLine
      .replace("Online:", "")
      .split(",")
      .map(x => x.trim())
      .filter(x => x !== "Main" && x !== "none" && x !== "");

    const instanceCount = instances.length;

    const packsMatch = packsLine.match(/Packs:\s(\d+)/);
    const packs = packsMatch ? parseInt(packsMatch[1]) : 0;

    for (const id in profilesCache) {
      const profile = profilesCache[id];

      if (profile.name === username && profile.online) {
        const multiplier = 1 + (instanceCount * 0.1);
        profile.xp += multiplier;

        profile.level = Math.floor(profile.xp / 200);

        if (instanceCount > profile.recordInstances) {
          profile.recordInstances = instanceCount;
        }

        if (packs === 0) {
          profile.totalpacks += profile.currentpacks;
          profile.currentpacks = 0;
        } else {
          profile.currentpacks = packs;
        }
      }
    }
  }

  await updateGist(PROFILE_GIST, profilesCache);
}

// ================= GOD PACKS =================

client.on("messageCreate", async (message) => {
  if (!GP_CHANNELS.includes(message.channel.id)) return;

  const firstLine = message.content.split("\n")[0];
  const username = firstLine.split(" ")[0];

  for (const id in profilesCache) {
    if (profilesCache[id].name === username) {
      profilesCache[id].gp += 1;
    }
  }

  await updateGist(PROFILE_GIST, profilesCache);
});

// ================= LEADERBOARD =================

async function updateProfileChannel() {
  const channel = await client.channels.fetch(PROFILE_CHANNEL_ID);
  if (!channel) return;

  const users = Object.values(profilesCache)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 20);

  let content = "🏆 **Leaderboard Reroll**\n\n";

  users.forEach((u, i) => {
    const status = u.online ? "🟢 Online" : "🔴 Offline";

    content += `#${i + 1} ${u.name} (${status})\n`;
    content += `XP: ${Math.floor(u.xp)} | Nivel: ${Math.floor(u.xp / 200)}\n`;
    content += `Tiempo: ${u.time} min\n`;
    content += `Packs: ${u.totalpacks}\n`;
    content += `GP: ${u.gp}\n`;
    content += `Instancias récord: ${u.recordInstances}\n`;
    content += `Rol: ${u.role}\n\n`;
  });

  try {
    if (!leaderboardMessageId) {
      const msg = await channel.send(content);
      leaderboardMessageId = msg.id;
    } else {
      const msg = await channel.messages.fetch(leaderboardMessageId);
      await msg.edit(content);
    }
  } catch {
    const msg = await channel.send(content);
    leaderboardMessageId = msg.id;
  }
}

// ================= INIT =================

client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  try {
    profilesCache = await getGist(PROFILE_GIST);
  } catch {
    profilesCache = {};
  }

  // 🔥 NUEVO FLUJO
  await loadAllUsers();
  await updateStats();
  await parseHeartbeat();
  await updateProfileChannel();

  // loops
  setInterval(updateStats, 60000);
  setInterval(parseHeartbeat, 30000);
  setInterval(updateProfileChannel, 60000);
});

// ================= LOGIN =================

client.login(DISCORD_TOKEN);
