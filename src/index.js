import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder
} from "discord.js";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import { getGist } from "./gist.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let eliteUsers = {};
let onlineIds = [];
let trackingData = {};
let liveTracker = {};

// =============================
function getPokemonData(totalXP) {
  return {
    name: "🔥 Test Stage",
    gif: "https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif?ex=69d1da52&is=69d088d2&hm=b9bdc9d57b7303ba9b46afaf43b64528a27cff0b0297b47347bc76aec4290063&=&width=133&height=96",
    progress: 0.5
  };
}

// =============================
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  eliteUsers = await getGist(process.env.GIST_USERS) || {};
  trackingData = await getGist(process.env.GIST_TRACKING) || {};

  // 🔥 USER DE PRUEBA
  liveTracker["test"] = {
    name: "TestUser",
    sessionXP: 500,
    sessionTime: 300,
    instances: 2
  };
});

// =============================
client.on("messageCreate", async (msg) => {

  if (msg.content === "!testcard") {
    console.log("🔥 comando recibido");

    const fakeUser = liveTracker["test"];
    const fakeData = { xp: 1000, time: 50, gp: 2 };

    await sendCard(msg.channel, fakeUser, fakeData);
  }

});

// =============================
async function sendCard(channel, s, t) {
  try {
    console.log("🎨 generando canvas");

    const totalXP = (t.xp || 0) + (s.sessionXP || 0);
    const totalTime =
      (t.time || 0) + Math.floor((s.sessionTime || 0) / 60);
    const level = Math.floor(totalXP / 100);

    const evo = getPokemonData(totalXP);

    const canvas = createCanvas(500, 700);
    const ctx = canvas.getContext("2d");

    // 🔥 CARGAR FONDO
    const background = await loadImage("./assets/card.png");
    ctx.drawImage(background, 0, 0, 500, 700);

    // TEXTO
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px Arial";
    ctx.fillText(s.name, 40, 60);

    ctx.font = "20px Arial";
    ctx.fillText(`Nivel: ${level}`, 40, 100);
    ctx.fillText(`XP: ${totalXP}`, 40, 140);
    ctx.fillText(`Tiempo: ${totalTime}m`, 40, 180);
    ctx.fillText(`GP: ${t.gp}`, 40, 220);

    // BARRA
    ctx.fillStyle = "#333";
    ctx.fillRect(40, 260, 400, 20);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(40, 260, 400 * evo.progress, 20);

    const attachment = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "card.png" }
    );

    const embed = new EmbedBuilder()
      .setTitle("🃏 CARD GENERADA")
      .setDescription("Si ves esto + imagen abajo → FUNCIONA")
      .setImage(evo.gif)
      .setColor(0x00ff99);

    await channel.send({
      embeds: [embed],
      files: [attachment],
    });

    console.log("✅ enviada");

  } catch (err) {
    console.error("❌ ERROR CANVAS:", err);
  }
}

// =============================
client.login(process.env.DISCORD_TOKEN);
