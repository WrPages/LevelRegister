import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder
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
  if (msg.content === "!profile") {
    await createProfileCard(msg);
  }
});

// =============================
async function createProfileCard(msg) {
  try {
    // ===== DATOS EJEMPLO
    const name = msg.author.username;
    const level = 55;
    const xp = 5576;
    const time = 904;
    const gp = 1;
    const progress = 0.75;

    // =============================
    // 🎴 CANVAS (TARJETA)
    // =============================
    const canvas = createCanvas(800, 300);
    const ctx = canvas.getContext("2d");

    // Fondo
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, 800, 300);

    // Borde
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 800, 300);

    // Nombre
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

    // Stats
    ctx.font = "22px Arial";

    ctx.fillStyle = "#00ffcc";
    ctx.fillText(`XP: ${xp}`, 30, 140);

    ctx.fillStyle = "#ffaa00";
    ctx.fillText(`Tiempo: ${time}m`, 30, 180);

    ctx.fillStyle = "#ff66ff";
    ctx.fillText(`GP: ${gp}`, 30, 220);

    // Barra XP
    ctx.fillStyle = "#222";
    ctx.fillRect(250, 180, 500, 20);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(250, 180, 500 * progress, 20);

    // Exportar
    const attachment = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "card.png" }
    );

    // =============================
    // 📤 ENVIAR CANVAS
    // =============================
    const sentMessage = await msg.channel.send({
      files: [attachment]
    });

    // =============================
    // 🧵 CREAR HILO
    // =============================
    const thread = await sentMessage.startThread({
      name: `GIF - ${name}`,
      autoArchiveDuration: 1440,
    });

    // =============================
    // 🎥 EMBED CON GIF
    // =============================
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setImage("https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif");

    await thread.send({
      embeds: [embed]
    });

    console.log("✅ PERFIL + HILO CREADO");

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
}

// =============================
client.login(process.env.DISCORD_TOKEN);
