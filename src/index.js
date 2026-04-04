import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder
} from "discord.js";
import dotenv from "dotenv";
import { createCanvas } from "canvas";

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
  try {
    // ===== DATOS (luego conectas reales)
    const name = "KyuremBot";
    const level = 55;
    const xp = 5576;
    const time = 904;
    const gp = 1;
    const progress = 0.75;

    // =============================
    // 🎴 CANVAS HORIZONTAL (HEADER)
    // =============================
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext("2d");

    // Fondo oscuro pro
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, 800, 250);

    // Borde
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 800, 250);

    // Nombre
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Arial";
    ctx.fillText(name, 30, 60);

    // Nivel
    ctx.fillStyle = "#00ffcc";
    ctx.font = "28px Arial";
    ctx.fillText(`Lv ${level}`, 650, 60);

    // Stats
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "22px Arial";

    ctx.fillText(`XP: ${xp}`, 30, 120);
    ctx.fillText(`Tiempo: ${time}m`, 30, 160);
    ctx.fillText(`GP: ${gp}`, 30, 200);

    // Barra XP
    ctx.fillStyle = "#222";
    ctx.fillRect(250, 150, 500, 20);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(250, 150, 500 * progress, 20);

    // Exportar
    const attachment = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "header.png" }
    );

    // =============================
    // 🎥 GIF (ABAJO)
    // =============================
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setImage("https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif");

    // =============================
    // 🚀 ENVÍO (ALINEADO)
    // =============================
    await channel.send({ files: [attachment] });
    await channel.send({ embeds: [embed] });

    console.log("✅ CARD PANEL ENVIADO");

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
}

// =============================
client.login(process.env.DISCORD_TOKEN);
