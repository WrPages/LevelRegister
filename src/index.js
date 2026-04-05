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
function getPokemonData(xp) {
  return {
    name: "Fase",
    gif: "https://cdn.discordapp.com/attachments/1489832190530425014/1489832654227374131/bulbasaur.gif"
  };
}

// =============================
client.once("clientReady", async () => {
  eliteUsers = JSON.parse(await getGist(process.env.GIST_USERS));
  trackingData = JSON.parse(await getGist(process.env.GIST_TRACKING));

  startLoop();
});

// =============================
function startLoop() {
  setInterval(updatePanels, 5000);
}

// =============================
// 🎴 RENDER PANEL
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
  const level = Math.floor(totalXP / 100);

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

  ctx.fillStyle = settings.textColor;
  ctx.font = "24px Righteous";

  ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 170);

  return new AttachmentBuilder(canvas.toBuffer(), { name: "card.png" });
}

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id, user] of Object.entries(eliteUsers)) {

    if (!liveTracker[id]) {
      liveTracker[id] = {
        name: user.name,
        sessionXP: 0,
      };
    }

    const file = await renderPanel(id, channel);

    if (userPanels[id]) {
      const msg = await channel.messages.fetch(userPanels[id].messageId);
      await msg.edit({ files: [file] });
      continue;
    }

    const sent = await channel.send({ files: [file] });

    const thread = await sent.startThread({
      name: `Perfil - ${user.name}`,
    });

    // 🎨 BOTONES
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`edit_${id}`).setLabel("Editar").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`color_name_${id}`).setLabel("Nombre 🎨").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`color_text_${id}`).setLabel("Texto 🎨").setStyle(ButtonStyle.Secondary)
    );

    await thread.send({ content: "Editar perfil", components: [row] });

    const embed = new EmbedBuilder().setImage(getPokemonData().gif);
    await thread.send({ embeds: [embed] });

    userPanels[id] = { messageId: sent.id, threadId: thread.id };
  }
}

// =============================
// 🎨 INTERACCIONES
// =============================
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const parts = i.customId.split("_");
  const action = parts[0];
  const type = parts[1];
  const id = parts[2];

  const member = await i.guild.members.fetch(i.user.id);
  const role = getUserRole(member);

  if (i.user.id !== id && !role.isChampion) {
    return i.reply({ content: "No tienes permiso", ephemeral: true });
  }

  if (action === "edit") {
    return i.reply({ content: "Sube una imagen aquí para cambiar fondo", ephemeral: true });
  }

  // 🎨 PALETA SIMPLE
  const colors = ["#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff","#00ffff"];

  const row = new ActionRowBuilder().addComponents(
    colors.map(c =>
      new ButtonBuilder()
        .setCustomId(`apply_${type}_${id}_${c}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(" ")
    )
  );

  await i.reply({ content: "Elige color:", components: [row], ephemeral: true });
});

// =============================
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const parts = i.customId.split("_");

  if (parts[0] !== "apply") return;

  const type = parts[1];
  const id = parts[2];
  const color = parts[3];

  if (!userSettings[id]) userSettings[id] = {};

  if (type === "name") userSettings[id].nameColor = color;
  if (type === "text") userSettings[id].textColor = color;

  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);
  const file = await renderPanel(id, channel);

  const msg = await channel.messages.fetch(userPanels[id].messageId);
  await msg.edit({ files: [file] });

  await i.update({ content: "Color aplicado ✅", components: [] });
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
  const file = await renderPanel(id, channel);

  const panel = await channel.messages.fetch(userPanels[id].messageId);
  await panel.edit({ files: [file] });

  msg.reply("Fondo actualizado ✅");
});

client.login(process.env.DISCORD_TOKEN);
