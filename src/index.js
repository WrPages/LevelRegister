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
function getPokemonData(totalXP) {
  const stages = [
    { name: "Huevo", min: 0, max: 400, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif" },
    { name: "Fase 1", min: 400, max: 800, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif" },
    { name: "Fase 2", min: 800, max: 1200, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832678525243554/ivysaur.gif" },
    { name: "Final", min: 1200, max: Infinity, gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832694924836944/venusaur.gif" },
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

      if (Date.now() < t.boostUntil) xpPerSecond *= 2;

      t.sessionXP += xpPerSecond;
    }

    await updatePanels();
  }, 5000);
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
  const level = Math.floor(totalXP / 100);

  const poke = getPokemonData(totalXP);

  const member = await channel.guild.members.fetch(id).catch(() => null);
  const role = member ? getUserRole(member) : { name: "Reroller", color: "#aaa" };

  const canvas = createCanvas(800, 450);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage(settings.bg || "./assets/card.png");
  ctx.drawImage(bg, 0, 0, 800, 450);

  ctx.fillStyle = settings.nameColor;
  ctx.font = "50px Righteous";
  ctx.fillText(s.name, 40, 80);

  ctx.fillStyle = role.color;
  ctx.font = "22px Righteous";
  ctx.fillText(role.name, 42, 110);

  ctx.fillStyle = "#00ffcc";
  ctx.font = "38px Righteous";
  ctx.fillText(`Lv ${level}`, 620, 80);

  ctx.fillStyle = "#00ffcc";
  ctx.font = "22px Righteous";
  ctx.fillText(poke.name, 620, 110);

  ctx.fillStyle = settings.textColor;
  ctx.font = "24px Righteous";

  ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 170);
  ctx.fillText(`Tiempo: ${totalTime}m`, 40, 210);
  ctx.fillText(`Instancias: ${s.instances}`, 40, 250);
  ctx.fillText(`Packs: ${s.packs}`, 40, 290);
  ctx.fillText(`GP: ${t.gp || 0}`, 40, 330);

  return {
    file: new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" }),
    gif: poke.gif
  };
}

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id] of Object.entries(liveTracker)) {
    const { file, gif } = await renderPanel(id, channel);

    if (userPanels[id]) {
      const msg = await channel.messages.fetch(userPanels[id].messageId);
      await msg.edit({ files: [file] });
      continue;
    }

    const sent = await channel.send({ files: [file] });

    const thread = await sent.startThread({
      name: `Perfil`,
      autoArchiveDuration: 1440,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`edit_${id}`).setLabel("Editar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`name_${id}`).setLabel("Nombre 🎨").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`text_${id}`).setLabel("Texto 🎨").setStyle(ButtonStyle.Secondary)
    );

    await thread.send({ content: "Configura tu perfil", components: [row] });

    const embed = new EmbedBuilder().setImage(gif);
    await thread.send({ embeds: [embed] });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
  }
}

// =============================
// 🔘 INTERACCIONES (FIX REAL)
// =============================
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const parts = i.customId.split("_");
  const action = parts[0];
  const id = parts[1];

  const member = await i.guild.members.fetch(i.user.id);
  const role = getUserRole(member);

  if (i.user.id !== id && !role.isChampion) {
    return i.reply({ content: "No tienes permiso", ephemeral: true });
  }

  // EDIT
  if (action === "edit") {
    return i.reply({ content: "Sube imagen aquí para fondo", ephemeral: true });
  }

  // PALETA
  if (action === "name" || action === "text") {
    const colors = ["#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff","#00ffff"];

    const row = new ActionRowBuilder().addComponents(
      colors.map(c =>
        new ButtonBuilder()
          .setCustomId(`apply_${action}_${id}_${c}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel("⬤")
      )
    );

    return i.reply({ content: "Elige color", components: [row], ephemeral: true });
  }

  // APPLY COLOR
  if (action === "apply") {
    const type = parts[1];
    const targetId = parts[2];
    const color = parts[3];

    if (!userSettings[targetId]) userSettings[targetId] = {};

    if (type === "name") userSettings[targetId].nameColor = color;
    if (type === "text") userSettings[targetId].textColor = color;

    const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);
    const { file } = await renderPanel(targetId, channel);

    const msg = await channel.messages.fetch(userPanels[targetId].messageId);
    await msg.edit({ files: [file] });

    return i.update({ content: "Aplicado ✅", components: [] });
  }
});

// =============================
// 🖼️ FONDO
// =============================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (!msg.attachments.size) return;

  const url = msg.attachments.first().url;
  const id = msg.author.id;

  if (!userSettings[id]) userSettings[id] = {};
  userSettings[id].bg = url;

  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);
  const { file } = await renderPanel(id, channel);

  const panel = await channel.messages.fetch(userPanels[id].messageId);
  await panel.edit({ files: [file] });

  msg.reply("Fondo actualizado ✅");
});

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
      trackingData[id].packs = s.packs;

      s.sessionXP = 0;
      s.sessionTime = 0;
    }

    await updateGist(process.env.GIST_TRACKING, trackingData);
  }, 600000);
}

// =============================
function safeParse(data) {
  try { return typeof data === "object" ? data : JSON.parse(data); }
  catch { return {}; }
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
