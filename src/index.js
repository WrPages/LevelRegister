import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getGist, updateGist } from "./gist.js";
import { parseHeartbeat, parseGP } from "./parser.js";
import {
  initUsers,
  updateHeartbeat,
  addGP,
  getUsers,
  resetLocalCounters
} from "./tracker.js";
import { buildStats } from "./display.js";

dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let eliteUsers = {};
let onlineIds = [];

client.once("ready", async () => {
  console.log("Bot listo");

  const usersRaw = await getGist(process.env.GIST_USERS);
  eliteUsers = JSON.parse(usersRaw);

  const onlineRaw = await getGist(process.env.GIST_ONLINE);
  onlineIds = onlineRaw.split("\n");

  initUsers(eliteUsers);

  // loop cada minuto
  setInterval(async () => {
    const onlineRaw = await getGist(process.env.GIST_ONLINE);
    onlineIds = onlineRaw.split("\n");
  }, 60000);

  // guardar cada 30 min
  setInterval(async () => {
    const users = getUsers();

    await updateGist(process.env.GIST_TRACKING, users);

    const channel = await client.channels.fetch(process.env.STATS_CHANNEL_ID);
    await channel.send(buildStats(users));

    resetLocalCounters();
  }, 1800000);
});

client.on("messageCreate", async (msg) => {
  if (msg.channel.id === process.env.HEARTBEAT_CHANNEL_ID) {
    const data = parseHeartbeat(msg);
    if (data) updateHeartbeat(data, onlineIds);
  }

  if (msg.channel.id === process.env.GP_CHANNEL_ID) {
    const name = parseGP(msg);
    if (name) addGP(name);
  }
});

client.login(process.env.DISCORD_TOKEN);
