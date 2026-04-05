import {
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

import { getGist, updateGist } from "./gist.js";

// =============================
// ⚙️ VARIABLES
// =============================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =============================
// 📦 REGISTRAR COMANDOS
// =============================
export async function registerCommands() {

  const commands = [
    new SlashCommandBuilder()
      .setName("online")
      .setDescription("Pon tu ID como online"),

    new SlashCommandBuilder()
      .setName("offline")
      .setDescription("Quita tu ID del online")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Comandos registrados");
}

// =============================
// ⚡ HANDLER
// =============================
export async function handleCommands(client) {

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    let users = await getGist(process.env.GIST_USERS);
    let online = await getGist(process.env.GIST_ONLINE);

    users = typeof users === "object" ? users : JSON.parse(users || "{}");
    online = online ? online.split("\n").filter(Boolean) : [];

    const user = users[interaction.user.id];

    if (!user) {
      return interaction.reply({ content: "❌ No estás registrado", ephemeral: true });
    }

    // =============================
    // 🟢 ONLINE
    // =============================
    if (interaction.commandName === "online") {

      if (!online.includes(user.main_id))
        online.push(user.main_id);

      if (user.sec_id && !online.includes(user.sec_id))
        online.push(user.sec_id);

      await updateGist(process.env.GIST_ONLINE, online.join("\n"));

      return interaction.reply("🟢 Estás online");
    }

    // =============================
    // 🔴 OFFLINE
    // =============================
    if (interaction.commandName === "offline") {

      online = online.filter(id =>
        id !== user.main_id && id !== user.sec_id
      );

      await updateGist(process.env.GIST_ONLINE, online.join("\n"));

      return interaction.reply("🔴 Estás offline");
    }
  });
}
