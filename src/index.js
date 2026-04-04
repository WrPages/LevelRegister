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
import { getGist } from "./gist.js";

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
client.once("clientReady", async () => {
  console.log(`Bot listo como ${client.user.tag}`);

  eliteUsers = JSON.parse(await getGist(process.env.GIST_USERS));
  trackingData = JSON.parse(await getGist(process.env.GIST_TRACKING));

  startLoop();
});

// =============================
function startLoop() {
  setInterval(updatePanels, 5000);
}

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);

  for (const [id, user] of Object.entries(eliteUsers)) {
    if (!liveTracker[id]) {
      liveTracker[id] = {
        name: user.name,
        sessionXP: 0,
        sessionTime: 0,
        instances: 1,
        packs: 0,
      };
    }

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

    const totalXP = (t.xp || 0) + s.sessionXP;
    const level = Math.floor(totalXP / 100);

    const guild = channel.guild;
    const member = await guild.members.fetch(id).catch(() => null);
    const role = member ? getUserRole(member) : { name: "Reroller", color: "#aaa" };

    const canvas = createCanvas(800, 450);
    const ctx = canvas.getContext("2d");

    try {
      const bg = await loadImage(settings.bg || "./assets/card.png");
      ctx.drawImage(bg, 0, 0);
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

    // Stats
    ctx.fillStyle = settings.textColor;
    ctx.font = "24px Righteous";

    ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 170);
    ctx.fillText(`Tiempo: ${Math.floor(s.sessionTime / 60)}m`, 40, 210);
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

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`edit_${id}`)
        .setLabel("Editar perfil")
        .setStyle(ButtonStyle.Primary)
    );

    await thread.send({
      content: "Editar perfil:",
      components: [row],
    });

    userPanels[id] = {
      messageId: sent.id,
      threadId: thread.id,
    };
  }
}

// =============================
// 🔘 BOTÓN (CON PERMISOS)
// =============================
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const [, targetId] = i.customId.split("_");

  const member = await i.guild.members.fetch(i.user.id);
  const role = getUserRole(member);

  const isOwner = i.user.id === targetId;
  const isChampion = role.isChampion;

  if (!isOwner && !isChampion) {
    return i.reply({
      content: "No tienes permiso.",
      ephemeral: true,
    });
  }

  await i.reply({
    content: `Editando perfil de <@${targetId}>\n\nSube imagen o usa:\n!namecolor #hex\n!textcolor #hex`,
    ephemeral: true,
  });
});

// =============================
// 🎨 MENSAJES (CON PERMISOS)
// =============================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  let targetId = msg.author.id;

  // Champion puede mencionar a otro
  const mention = msg.mentions.users.first();
  if (mention) {
    const member = await msg.guild.members.fetch(msg.author.id);
    const role = getUserRole(member);

    if (role.isChampion) {
      targetId = mention.id;
    }
  }

  if (!userSettings[targetId]) {
    userSettings[targetId] = {};
  }

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

client.login(process.env.DISCORD_TOKEN);
