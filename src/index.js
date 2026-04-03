import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =============================
let liveTracker = {};
let liveMessageId = null;

// =============================
client.once("ready", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
  await createMessage();
  startLoop();
});

// =============================
// DETECTOR DE HEARTBEAT (FIX REAL)
// =============================
client.on("messageCreate", async (msg) => {

  // 🔥 DEBUG
  console.log("------");
  console.log("Canal:", msg.channel.id);
  console.log("Webhook:", msg.webhookId);
  console.log("Contenido:", msg.content);
  console.log("Embeds:", msg.embeds.length);

  // ❗ QUITA FILTRO PARA DEBUG
  // if (msg.channel.id !== process.env.HEARTBEAT_CHANNEL_ID) return;

  // =============================
  // EXTRAER CONTENIDO REAL
  // =============================
  let content = msg.content;

  if (!content && msg.embeds.length > 0) {
    const e = msg.embeds[0];
    content = `${e.title || ""}\n${e.description || ""}`;
  }

  if (!content) return;

  console.log("📦 CONTENIDO FINAL:\n", content);

  // =============================
  // PARSEO REAL PARA TU FORMATO
  // =============================
  const lines = content.split("\n");

  const name = lines[0]?.trim();
  if (!name) return;

  const onlineLine = lines.find(l => l.startsWith("Online:"));
  if (!onlineLine) return;

  let instances = 0;

  const value = onlineLine.split(":")[1]?.trim();

  if (value && value.toLowerCase() !== "none") {
    instances = value.split(",").length;
  }

  console.log("👤 Usuario:", name);
  console.log("🧩 Instancias:", instances);

  // =============================
  // TRACKING SIMPLE
  // =============================
  if (!liveTracker[name]) {
    liveTracker[name] = {
      time: 0,
      xp: 0,
      instances: 0,
      lastSeen: Date.now()
    };
  }

  liveTracker[name].instances = instances;
  liveTracker[name].lastSeen = Date.now();
});

// =============================
// LOOP TIEMPO REAL
// =============================
function startLoop() {
  setInterval(() => {

    for (const name in liveTracker) {
      const user = liveTracker[name];

      // si no hay heartbeat reciente → offline
      if (Date.now() - user.lastSeen > 30000) {
        user.instances = 0;
        continue;
      }

      if (user.instances > 0) {
        user.time += 1;

        const xpPerSecond = (2 + user.instances * 0.5) / 60;
        user.xp += xpPerSecond;
      }
    }

    updateMessage();

  }, 1000);
}

// =============================
// MENSAJE EN DISCORD
// =============================
async function createMessage() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.send("Iniciando tracking...");
  liveMessageId = msg.id;
}

async function updateMessage() {
  if (!liveMessageId) return;

  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  const msg = await channel.messages.fetch(liveMessageId);

  let content = "🔥 TRACKING EN VIVO\n\n";

  for (const name in liveTracker) {
    const u = liveTracker[name];

    content += `**${name}**
⏱ ${u.time}s
XP ${u.xp.toFixed(2)}
🧩 ${u.instances}

`;
  }

  await msg.edit(content);
}

client.login(process.env.DISCORD_TOKEN);
