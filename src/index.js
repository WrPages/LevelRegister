import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { createCanvas, loadImage, registerFont } from "canvas";
import { getGist, updateGist } from "./gist.js";

dotenv.config();

// =============================
// 🔤 FUENTE
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
  ],
});

// =============================
let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};
let userPanels = {};
let userSettings = {};

// =============================
// 🧠 ROLES
// =============================
function getUserRole(member) {
  const roles = member.roles.cache;

  if (roles.some(r => r.name === "Champion"))
    return { name: "Champion", color: "#FFD700", isChampion: true };

  if (roles.some(r => r.name === "Elite_Four"))
    return { name: "Elite Four", color: "#800080" };

  if (roles.some(r => r.name === "Gym_Leader"))
    return { name: "Gym Leader", color: "#0099ff" };

  if (roles.some(r => r.name === "Trainer"))
    return { name: "Trainer", color: "#00ff00" };

  return { name: "Reroller", color: "#aaaaaa" };
}

// =============================
// 🧬 EVOLUCIÓN
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

  return stages.find(s => totalXP >= s.min && totalXP < s.max);
}

// =============================
client.once("clientReady", async () => {
  console.log(`Bot listo como ${client.user.tag}`);

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
    onlineIds = cleanOnlineIds(await getGist(process.env.GIST_ONLINE));

    for (const [id, user] of Object.entries(eliteUsers)) {
      const isOnline =
        onlineIds.includes(user.main_id) ||
        onlineIds.includes(user.sec_id);

      if (!isOnline) continue;

      if (!liveTracker[id]) {
        liveTracker[id] = {
          sessionXP: 0,
          sessionTime: 0,
          instances: 1,
          boostUntil: 0,
          name: user.name,
          packs: 0,
        };
      }

      const t = liveTracker[id];

      t.sessionTime += 1;

      let xpPerSecond = (2 + t.instances * 0.5) / 60;

      if (Date.now() < t.boostUntil) {
        xpPerSecond *= 2;
      }

      t.sessionXP += xpPerSecond;
    }

    await updatePanels();
  }, 5000);
}

// =============================
// 🎴 PANEL
// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id, s] of Object.entries(liveTracker)) {
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
    const totalTime =
      (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);

    const level = Math.floor(totalXP / 100);

    const poke = getPokemonData(totalXP);

    const guild = channel.guild;
    const member = await guild.members.fetch(id).catch(() => null);
    const role = member ? getUserRole(member) : { name: "Reroller", color: "#aaa" };

    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext("2d");

    // Fondo
    try {
      const bg = await loadImage(settings.bg || "./assets/card.png");
      ctx.drawImage(bg, 0, 0, 800, 450);
    } catch {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 800, 450);
    }

    // Nombre
    ctx.fillStyle = settings.nameColor;
    ctx.font = "50px Righteous";
    ctx.fillText(s.name, 40, 80);

    // Rol
    ctx.fillStyle = role.color;
    ctx.font = "22px Righteous";
    ctx.fillText(role.name, 42, 110);

    // Nivel
    ctx.fillStyle = "#00ffcc";
    ctx.font = "38px Righteous";
    ctx.fillText(`Lv ${level}`, 620, 80);

    // Fase
    ctx.fillStyle = "#00ffcc";
    ctx.font = "22px Righteous";
    ctx.fillText(poke.name, 620, 110);

    // Stats
    ctx.fillStyle = settings.textColor;
    ctx.font = "24px Righteous";

    ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 170);
    ctx.fillText(`Tiempo: ${totalTime}m`, 40, 210);
    ctx.fillText(`Instancias: ${s.instances}`, 40, 250);
    ctx.fillText(`Packs: ${s.packs}`, 40, 290);
    ctx.fillText(`GP: ${t.gp || 0}`, 40, 330);

    const file = new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" });

    if (userPanels[id]) {
      try {
        const msg = await channel.messages.fetch(userPanels[id].messageId);
        await msg.edit({ files: [file] });
        continue;
      } catch {
        delete userPanels[id];
      }
    }

    const sent = await channel.send({ files: [file] });

    const thread = await sent.startThread({
      name: `Perfil - ${s.name}`,
      autoArchiveDuration: 1440,
    });

    // 🔘 BOTÓN
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`edit_${id}`)
        .setLabel("Editar perfil")
        .setStyle(ButtonStyle.Primary)
    );

    await thread.send({
      content: "Configura tu perfil:",
      components: [row],
    });

    // 🎞️ GIF RESTAURADO
    const embed = new EmbedBuilder().setImage(poke.gif);
    await thread.send({ embeds: [embed] });

    userPanels[id] = {
      messageId: sent.id,
      threadId: thread.id,
    };
  }
}

// =============================
// 🔘 BOTÓN PERMISOS
// =============================
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const [, targetId] = i.customId.split("_");

  const member = await i.guild.members.fetch(i.user.id);
  const role = getUserRole(member);

  const isOwner = i.user.id === targetId;
  const isChampion = role.isChampion;

  if (!isOwner && !isChampion) {
    return i.reply({ content: "No tienes permiso.", ephemeral: true });
  }

  await i.reply({
    content: `Editando <@${targetId}>\nSube imagen o usa:\n!namecolor #hex\n!textcolor #hex`,
    ephemeral: true,
  });
});

// =============================
// 🎨 MENSAJES
// =============================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  let targetId = msg.author.id;

  const mention = msg.mentions.users.first();
  if (mention) {
    const member = await msg.guild.members.fetch(msg.author.id);
    const role = getUserRole(member);

    if (role.isChampion) {
      targetId = mention.id;
    }
  }

  if (!userSettings[targetId]) userSettings[targetId] = {};
  const settings = userSettings[targetId];

  // Fondo
  if (msg.attachments.size > 0) {
    const url = msg.attachments.first().url;
    settings.bg = url;
    return msg.reply(`Fondo actualizado para <@${targetId}>`);
  }

  if (msg.content.startsWith("!namecolor")) {
    settings.nameColor = msg.content.split(" ")[1];
    return msg.reply("Color nombre actualizado");
  }

  if (msg.content.startsWith("!textcolor")) {
    settings.textColor = msg.content.split(" ")[1];
    return msg.reply("Color texto actualizado");
  }
});

// =============================
function safeParse(data) {
  try {
    return typeof data === "object" ? data : JSON.parse(data);
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
