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
  console.log("MENSAJE:", msg.content);

  if (msg.content === "!card") {
    console.log("🔥 GENERANDO CARTA");
    await sendCard(msg.channel);
  }
});

// =============================
async function sendCard(channel) {
  try {
    // ===== DATOS (luego los conectas a tu sistema real)
    const name = "KyuremBot";
    const level = 55;
    const xp = 5576;
    const time = 904;
    const gp = 1;
    const progress = 0.75;

    // ===== CANVAS
    const canvas = createCanvas(600, 800);
    const ctx = canvas.getContext("2d");

    // ===== FONDO
    const bg = await loadImage("./assets/card.png");
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // =============================
    // 🔥 ESPACIO ARRIBA PARA EL GIF
    // =============================
    const offsetY = 200; // 🔥 clave para alineación

    // ===== OVERLAY SUAVE
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, offsetY, canvas.width, canvas.height - offsetY);

    // ===== NOMBRE
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    ctx.fillText(name, 40, offsetY + 60);

    // ===== NIVEL
    ctx.font = "bold 26px Arial";
    ctx.fillText(`Lv ${level}`, 450, offsetY + 60);

    // ===== CAJA STATS
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(40, offsetY + 120, 520, 250);

    // ===== TEXTO STATS
    ctx.fillStyle = "#00ffcc";
    ctx.font = "22px Arial";

    ctx.fillText(`XP: ${xp}`, 60, offsetY + 170);
    ctx.fillText(`Tiempo: ${time}m`, 60, offsetY + 210);
    ctx.fillText(`GP: ${gp}`, 60, offsetY + 250);

    // ===== BARRA XP
    ctx.fillStyle = "#222";
    ctx.fillRect(60, offsetY + 300, 480, 25);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(60, offsetY + 300, 480 * progress, 25);

    // ===== BORDE PRO
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 560, 760);

    // ===== EXPORTAR
    const attachment = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "card.png" }
    );

    // =============================
    // 🔥 GIF LIMPIO (SIN TEXTO)
    // =============================
    const embed = new EmbedBuilder()
      .setImage("https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif");

    // =============================
    // 🚀 ORDEN PRO (ILUSIÓN)
    // =============================
    await channel.send({ embeds: [embed] }); // GIF primero
    await channel.send({ files: [attachment] }); // carta después

    console.log("✅ CARTA PRO ENVIADA");

  } catch (err) {
    console.error("❌ ERROR:", err);
  }
}

// =============================
client.login(process.env.DISCORD_TOKEN);
