import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder
} from "discord.js";
import dotenv from "dotenv";
import { createCanvas } from "canvas";
import fetch from "node-fetch";

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
    // 🎴 CANVAS HEADER
    // =============================
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext("2d");

    // Fondo
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, 800, 250);

    // Borde
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 800, 250);

    // Nombre (con borde PRO)
    ctx.font = "bold 36px Arial";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 5;
    ctx.strokeText(name, 30, 60);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, 30, 60);

    // Nivel
    ctx.fillStyle = "#00ffcc";
    ctx.font = "28px Arial";
    ctx.fillText(`Lv ${level}`, 650, 60);

    // Stats colores separados
    ctx.font = "22px Arial";

    ctx.fillStyle = "#00ffcc";
    ctx.fillText(`XP: ${xp}`, 30, 120);

    ctx.fillStyle = "#ffaa00";
    ctx.fillText(`Tiempo: ${time}m`, 30, 160);

    ctx.fillStyle = "#ff66ff";
    ctx.fillText(`GP: ${gp}`, 30, 200);

    // Barra XP
    ctx.fillStyle = "#222";
    ctx.fillRect(250, 150, 500, 20);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(250, 150, 500 * progress, 20);

    // Exportar canvas
    const canvasFile = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "card.png" }
    );

    // =============================
    // 🎥 GIF COMO ARCHIVO (NO EMBED)
    // =============================
    const gifUrl = "https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif";

    const res = await fetch(gifUrl);
    const buffer = await res.arrayBuffer();

    const gifFile = new AttachmentBuilder(
      Buffer.from(buffer),
      { name: "pokemon.gif" }
    );

    // =============================
    // 🚀 ENVÍO LIMPIO
    // =============================
    await channel.send({
      files: [canvasFile, gifFile]
    });

    console.log("✅ CARD + GIF SIN EMBED ENVIADO");

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
}

// =============================
client.login(process.env.DISCORD_TOKEN);
