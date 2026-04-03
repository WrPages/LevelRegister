import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist } from "./gist.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =============================
let eliteUsers = {};
let onlineIds = [];
let liveTracker = {};
let liveMessageId = null;

// =============================
client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));

  await bootstrapFromHistory();
  await createMessage();

  startLoop();

  setInterval(async () => {
    onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  }, 60000);
});

// =============================
// BOOTSTRAP
// =============================
async function bootstrapFromHistory() {
  const channel = await client.channels.fetch(
    process.env.HEARTBEAT_CHANNEL_ID
  );

  const messages = await channel.messages.fetch({ limit: 50 });

  for (const msg of messages.values()) {

    let content = msg.content;

    if (!content && msg.embeds.length > 0) {
      const e = msg.embeds[0];
      content = `${e.title || ""}\n${e.description || ""}`;
    }

    if (!content) continue;

    const lines = content.split("\n");
    const name = lines[0]?.trim();
    if (!name) continue;

    const onlineLine = lines.find(l => l.startsWith("Online:"));
    if (!onlineLine) continue;

    let instances = 0;
    const value = onlineLine.split(":")[1]?.trim();

    if (value && value.toLowerCase() !== "none") {
      instances = value.split(",").length;
    }

    const normalize = s => s?.toLowerCase().trim();

    const matched = Object.entries(eliteUsers).find(
      ([_, user]) => normalize(user.name) === normalize(name)
    );

    if (!matched) continue;

    const [discordId, user] = matched;

    const isOnline =
      onlineIds.includes(user.main_id) ||
      onlineIds.includes(user.sec_id);

    if (!isOnline) continue;

    if (!liveTracker[discordId]) {
      liveTracker[discordId] = {
        time: 0,
        xp: 0,
        instances: instances
      };
    }
  }

  console.log("✅ Bootstrap completado:", liveTracker);
}

// =============================
// LOOP
// =============================
function startLoop() {
  setInterval(() => {

    for (const [discordId, user] of Object.entries(eliteUsers)) {

      const isOnline =
        onlineIds.includes(user.main_id) ||
        onlineIds.includes(user.sec_id);

      if (!isOnline) continue;

      if (!liveTracker[discordId]) {
        liveTracker[discordId] = {
          time: 0,
          xp: 0,
          instances: 1
        };
      }

      const tracker = liveTracker[discordId];

      tracker.time += 1;

      const xpPerSecond =
        (2 + tracker.instances * 0.5) / 60;

      tracker.xp += xpPerSecond;
    }

    updateMessage();

  }, 1000);
}

// =============================
// MENSAJE
// =============================
async function createMessage() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.send("🔥 Iniciando tracking...");
  liveMessageId = msg.id;
}

async function updateMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.messages.fetch(liveMessageId);

  let content = "🏆 TRACKING EN VIVO\n\n";

  for (const [id, data] of Object.entries(liveTracker)) {

    const level = Math.floor(data.xp / 100);
    const currentXP = data.xp % 100;
    const progressBars = Math.floor(currentXP / 10);

    const bar =
      "▓".repeat(progressBars) +
      "░".repeat(10 - progressBars);

    content += `<@${id}>
🎖 Nivel ${level}
XP ${data.xp.toFixed(2)} (${currentXP.toFixed(1)}/100)
📊 ${bar}
⏱ ${data.time}s
🧩 ${data.instances}

`;
  }

  await msg.edit(content);
}

// =============================
// UTILS
// =============================
function safeParse(data) {
  try {
    return typeof data === "object" ? data : JSON.parse(data);
  } catch {
    return {};
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
}

client.login(process.env.DISCORD_TOKEN);
