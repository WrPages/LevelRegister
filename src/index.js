import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder
} from "discord.js";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =============================
client.once("clientReady", () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
});

// =============================
client.on("messageCreate", async (msg) => {
  if (msg.content === "!card") {
    await sendCard(msg.channel);
  }
});

// =============================
async function sendCard(channel) {
  // ===== DATOS FAKE (puedes conectar luego a tu sistema)
  const name = "KyuremBot";
  const level = 55;
  const xp = 5576;
  const time = 904;
  const gp = 1;
  const progress = 0.75;

  // ===== CANVAS
  const canvas = createCanvas(500, 700);
  const ctx = canvas.getContext("2d");

  // 🔥 FONDO (tu imagen en /assets/card.png)
  const background = await loadImage("./assets/card.png");
  ctx.drawImage(background, 0, 0, 500, 700);

  // ===== TEXTO
  ctx.fillStyle = "#ffffff";

  ctx.font = "30px Arial";
  ctx.fillText(name, 40, 80);

  ctx.font = "20px Arial";
  ctx.fillText(`Nivel: ${level}`, 40, 130);
  ctx.fillText(`XP: ${xp}`, 40, 170);
  ctx.fillText(`Tiempo: ${time}m`, 40, 210);
  ctx.fillText(`GP: ${gp}`, 40, 250);

  // ===== BARRA PROGRESO
  ctx.fillStyle = "#222";
  ctx.fillRect(40, 300, 420, 20);

  ctx.fillStyle = "#00ff99";
  ctx.fillRect(40, 300, 420 * progress, 20);

  // ===== EXPORTAR
  const attachment = new AttachmentBuilder(
    canvas.toBuffer(),
    { name: "card.png" }
  );

  // =============================
  // 🔥 GIF (EL TUYO)
  // =============================
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setImage("https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif");

  // =============================
  // 🚀 ENVÍO PRO (SEPARADO)
  // =============================

  // 1. carta
  await channel.send({
    files: [attachment],
  });

  // 2. gif alineado
  await channel.send({
    embeds: [embed],
  });
}

// =============================
client.login(process.env.DISCORD_TOKEN);
