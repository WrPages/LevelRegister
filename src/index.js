const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fetch = require("node-fetch");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// 👉 GIST DE USUARIOS (donde tienes main_id)
const USERS_GIST_ID = "bb18eda2ea748723d8fe0131dd740b70";
const USERS_FILE = "elite_users.json";

// 👉 GIST DE ONLINE IDS (lista simple txt)
const ONLINE_GIST_ID = "d9db3a72fed74c496fd6cc830f9ca6e9";
const ONLINE_FILE = "elite_ids.txt";

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== LEER USUARIOS =====
async function getUsers() {
  try {
    const res = await fetch(`https://api.github.com/gists/${USERS_GIST_ID}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });

    const data = await res.json();
    return JSON.parse(data.files[USERS_FILE].content || "{}");

  } catch (err) {
    console.error("❌ ERROR USERS:", err);
    return {};
  }
}

// ===== LEER ONLINE =====
async function getOnlineList() {
  try {
    const res = await fetch(`https://api.github.com/gists/${ONLINE_GIST_ID}`);
    const data = await res.json();

    const content = data.files[ONLINE_FILE].content || "";
    return content.split("\n").filter(x => x.trim() !== "");

  } catch (err) {
    console.error("❌ ERROR ONLINE:", err);
    return [];
  }
}

// ===== GUARDAR ONLINE =====
async function saveOnlineList(list) {
  try {
    await fetch(`https://api.github.com/gists/${ONLINE_GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: {
          [ONLINE_FILE]: {
            content: list.join("\n")
          }
        }
      })
    });
  } catch (err) {
    console.error("❌ ERROR SAVE ONLINE:", err);
  }
}

// ===== READY =====
client.once("clientReady", async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("online")
      .setDescription("Pon tu ID en online"),

    new SlashCommandBuilder()
      .setName("offline")
      .setDescription("Quita tu ID de online")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("🚀 Comandos registrados");
  } catch (err) {
    console.error("❌ ERROR REGISTRANDO:", err);
  }
});

// ===== COMANDOS =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const users = await getUsers();
  const userData = users[interaction.user.id];

  if (!userData) {
    return interaction.reply("❌ No estás registrado.");
  }

  const mainId = userData.main_id;

  let onlineList = await getOnlineList();

  // ===== ONLINE =====
  if (interaction.commandName === "online") {

    if (!onlineList.includes(mainId)) {
      onlineList.push(mainId);
      await saveOnlineList(onlineList);
    }

    return interaction.reply("🟢  ONLINE");
  }

  // ===== OFFLINE =====
  if (interaction.commandName === "offline") {

    onlineList = onlineList.filter(id => id !== mainId);
    await saveOnlineList(onlineList);

    return interaction.reply("🔴  OFFLINE");
  }
});

// ===== LOGIN =====
client.login(TOKEN);
