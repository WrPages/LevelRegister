import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder
} from "discord.js";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =============================
let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};
let userPanels = {};

// =============================
// 🧬 EVOLUCIÓN + GIF (TUS LINKS)
// =============================
function getPokemonData(totalXP) {
  const stages = [
    {
      name: "Huevo",
      min: 0,
      max: 400,
      gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif",
    },
    {
      name: "Fase 1",
      min: 400,
      max: 800,
      gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif",
    },
    {
      name: "Fase 2",
      min: 800,
      max: 1200,
      gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832678525243554/ivysaur.gif",
    },
    {
      name: "Final",
      min: 1200,
      max: Infinity,
      gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832694924836944/venusaur.gif",
    },
  ];

  const current = stages.find(
    (s) => totalXP >= s.min && totalXP < s.max
  );

  const progress =
    current.max === Infinity
      ? 1
      : (totalXP - current.min) / (current.max - current.min);

  return {
    stage: current.name,
    gif: current.gif,
    progress,
  };
}

// =============================
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  eliteUsers = safeParse(await getGist(process.env.GIST_USERS));
  onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));
  trackingData = safeParse(await getGist(process.env.GIST_TRACKING));

  sanitizeTracking();

  startLoop();
  startBackupLoop();
});

// =============================
function startLoop() {
  setInterval(async () => {
    onlineIds = cleanOnlineIds(
      await getGist(process.env.GIST_ONLINE)
    );

    for (const [discordId, user] of Object.entries(eliteUsers)) {
      const isOnline =
        onlineIds.includes(user.main_id) ||
        onlineIds.includes(user.sec_id);

      if (!isOnline) continue;

      if (!liveTracker[discordId]) {
        liveTracker[discordId] = {
          sessionXP: 0,
          sessionTime: 0,
          instances: 1,
          boostUntil: 0,
          name: user.name,
          packs: 0,
        };
      }

      const t = liveTracker[discordId];

      t.sessionTime += 1;

      let xpPerSecond =
        (2 + t.instances * 0.5) / 60;

      if (Date.now() < t.boostUntil) {
        xpPerSecond *= 2;
      }

      t.sessionXP += xpPerSecond;
    }

    await updatePanels();

  }, 5000);
}

// =============================
// 🎴 PANEL VISUAL
// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  for (const [id, s] of Object.entries(liveTracker)) {
    const t = trackingData[id] || {};

    const totalXP = (t.xp || 0) + (s.sessionXP || 0);
    const totalTime =
      (t.time || 0) +
      Math.floor((s.sessionTime || 0) / 60);

    const level = Math.floor(totalXP / 100);

    const { gif, progress, stage } = getPokemonData(totalXP);

    // 🎴 CANVAS 16:9
    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext("2d");

    try {
      const bg = await loadImage("./assets/card.png");
      ctx.drawImage(bg, 0, 0, 800, 450);
    } catch {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 800, 450);
    }

    // ===== TEXTO ENCIMA =====
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 40px Arial";
    ctx.fillText(s.name, 40, 70);

    ctx.fillStyle = "#00ffcc";
    ctx.font = "28px Arial";
    ctx.fillText(`Nivel ${level}`, 600, 70);

    ctx.fillStyle = "#ffffff";
    ctx.font = "24px Arial";

    ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 150);
    ctx.fillText(`Tiempo: ${totalTime}m`, 40, 190);
    ctx.fillText(`Instancias: ${s.instances}`, 40, 230);
    ctx.fillText(`Packs: ${s.packs}`, 40, 270);
    ctx.fillText(`GP: ${t.gp || 0}`, 40, 310);

    ctx.fillStyle = "#00ffcc";
    ctx.fillText(stage, 600, 120);

    // Barra progreso
    ctx.fillStyle = "#222";
    ctx.fillRect(200, 360, 500, 20);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(200, 360, 500 * progress, 20);

    const file = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "card.png" }
    );

    // EDITAR SI EXISTE
    if (userPanels[id]) {
      try {
        const msg = await channel.messages.fetch(
          userPanels[id].messageId
        );

        await msg.edit({ files: [file] });
        continue;
      } catch {
        delete userPanels[id];
      }
    }

    // CREAR NUEVO
    const sent = await channel.send({
      files: [file],
    });

    const thread = await sent.startThread({
      name: `GIF - ${s.name}`,
      autoArchiveDuration: 1440,
    });

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setImage(gif);

    await thread.send({ embeds: [embed] });

    userPanels[id] = {
      messageId: sent.id,
      threadId: thread.id,
    };
  }
}

// =============================
function startBackupLoop() {
  setInterval(async () => {
    for (const id in liveTracker) {
      if (!trackingData[id]) {
        trackingData[id] = {
          xp: 0,
          time: 0,
          name: liveTracker[id].name,
          packs: 0,
          gp: 0,
        };
      }

      const s = liveTracker[id];

      trackingData[id].xp += s.sessionXP;
      trackingData[id].time += Math.floor(s.sessionTime / 60);
      trackingData[id].packs = s.packs;

      s.sessionXP = 0;
      s.sessionTime = 0;
    }

    await updateGist(process.env.GIST_TRACKING, trackingData);

  }, 600000);
}

// =============================
function safeParse(data) {
  try {
    return typeof data === "object"
      ? data
      : JSON.parse(data);
  } catch {
    return {};
  }
}

function sanitizeTracking() {
  for (const k in trackingData) {
    trackingData[k].xp = Number(trackingData[k].xp) || 0;
    trackingData[k].time = Number(trackingData[k].time) || 0;
    trackingData[k].gp = Number(trackingData[k].gp) || 0;
  }
}

function cleanOnlineIds(raw) {
  if (!raw) return [];
  return raw.split("\n").map(x => x.trim()).filter(Boolean);
}

client.login(process.env.DISCORD_TOKEN);
