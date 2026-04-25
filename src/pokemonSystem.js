import axios from "axios";
import { EmbedBuilder } from "discord.js";

const POKEMON_GIST_ID = process.env.GIST_POKEMON;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GIF_BASE_URL =
  "https://raw.githubusercontent.com/WrPages/gif_database/main/";

const thresholds = {
  hatch: 20,
  stage1: 30,
  stage2: 40,
  max: 50
};

async function getGist() {
  try {
    const res = await axios.get(
      `https://api.github.com/gists/${POKEMON_GIST_ID}`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );

    const file = res.data.files["pokemon_tracking.json"];
    if (!file || !file.content) return {};

    return JSON.parse(file.content);
  } catch (err) {
    console.error("Error leyendo Gist Pokémon:", err.message);
    return {};
  }
}

async function updateGist(data) {
  try {
    await axios.patch(
      `https://api.github.com/gists/${POKEMON_GIST_ID}`,
      {
        files: {
          "pokemon_tracking.json": {
            content: JSON.stringify(data, null, 2)
          }
        }
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("❌ Error actualizando Pokemon Gist:");
    console.error(err.response?.data || err.message);
  }
}

function calculateLevel(xp) {
  return Math.min(100, Math.floor((xp / thresholds.max) * 100));
}

function createNewEgg() {
  return {
    lineId: null,
    stageIndex: -1,
    name: "egg",
    shiny: Math.random() < 0.05,
    xp: 0,
    generation: null,
    legendary: false
  };
}

function pickEvolutionLine(db) {
  if (Math.random() < 0.03) {
    return {
      type: "legendary",
      name: db.legendary[Math.floor(Math.random() * db.legendary.length)]
    };
  }

  return {
    type: "normal",
    line: db.evolution_lines[
      Math.floor(Math.random() * db.evolution_lines.length)
    ]
  };
}

function encodeGifUrl(url) {
  return url
    .split("/")
    .map((part, index) => index < 3 ? part : encodeURIComponent(part))
    .join("/");
}

function getGifUrl(pokemon) {
  if (pokemon.stageIndex === -1 || pokemon.name === "egg") {
    return pokemon.shiny
      ? `${GIF_BASE_URL}s_egg.gif`
      : `${GIF_BASE_URL}egg.gif`;
  }

  const fileName = pokemon.shiny
    ? `s_${pokemon.name}.gif`
    : `${pokemon.name}.gif`;

  let url;

  if (pokemon.legendary) {
    url = `${GIF_BASE_URL}Legendary/${
      pokemon.shiny ? "Shiny" : "Normal"
    }/${fileName}`;
  } else {
    url = `${GIF_BASE_URL}Gen${pokemon.generation}/${
      pokemon.shiny ? "Shiny" : "Normal"
    }/${fileName}`;
  }

  return encodeGifUrl(url);
}

function normalizeUser(user) {
  if (!user.active) user.active = createNewEgg();

  // Migración desde tu sistema viejo
  if (!user.hallOfFame) {
    user.hallOfFame = [];
  }

  if (!user.boxes) {
    user.boxes = [];
  }

  if (Array.isArray(user.maxed) && user.maxed.length > 0) {
    for (const p of user.maxed) {
      if (user.hallOfFame.length < 6) {
        user.hallOfFame.push(p);
      } else {
        user.boxes.push(p);
      }
    }

    user.maxed = [];
  }

  if (!user.messages) {
    user.messages = {
      active: null,
      hall: null
    };
  }
}

function updatePokemon(user, xpGained, db) {
  const active = user.active;
  active.xp += xpGained;

  if (active.stageIndex === -1 && active.xp >= thresholds.hatch) {
    const chosen = pickEvolutionLine(db);

    if (chosen.type === "legendary") {
      active.name = chosen.name;
      active.stageIndex = 999;
      active.legendary = true;
      active.generation = null;
    } else {
      active.lineId = chosen.line.id;
      active.stageIndex = 0;
      active.name = chosen.line.stages[0];
      active.generation = chosen.line.generation;
      active.legendary = false;
    }
  }

  if (!active.legendary && active.lineId) {
    const line = db.evolution_lines.find(l => l.id === active.lineId);

    if (line) {
      if (active.stageIndex === 0 && active.xp >= thresholds.stage1 && line.stages[1]) {
        active.stageIndex = 1;
        active.name = line.stages[1];
      }

      if (active.stageIndex === 1 && active.xp >= thresholds.stage2 && line.stages[2]) {
        active.stageIndex = 2;
        active.name = line.stages[2];
      }
    }
  }

  if (active.xp >= thresholds.max) {
    const completed = {
      name: active.name,
      shiny: active.shiny,
      generation: active.generation,
      legendary: active.legendary,
      stageIndex: active.stageIndex
    };

    if (user.hallOfFame.length < 6) {
      user.hallOfFame.push(completed);
    } else {
      user.boxes.push(completed);
    }

    user.active = createNewEgg();
  }
}

async function upsertMessage(thread, messageId, payload) {
  let msg = null;

  if (messageId) {
    msg = await thread.messages.fetch(messageId).catch(() => null);
  }

  if (msg) {
    await msg.edit(payload);
    return msg.id;
  }

  const sent = await thread.send(payload);
  return sent.id;
}

function buildActiveEmbed(active) {
  const level = calculateLevel(active.xp);

  return new EmbedBuilder()
    .setTitle(`🌟 Pokémon activo: ${active.name.toUpperCase()} ${active.shiny ? "✨" : ""}`)
    .setDescription(
      `**Nivel:** ${level}/100\n` +
      `**XP:** ${Math.floor(active.xp)}/${thresholds.max}\n` +
      `**Shiny:** ${active.shiny ? "Sí ✨" : "No"}`
    )
    .setImage(getGifUrl(active));
}

function buildHallEmbeds(user) {
  if (!user.hallOfFame.length) {
    return [
      new EmbedBuilder()
        .setTitle("🏆 Hall de la Fama")
        .setDescription("Todavía no hay Pokémon maxeados.")
    ];
  }

  const embeds = [
    new EmbedBuilder()
      .setTitle("🏆 Hall de la Fama")
      .setDescription(
        `Pokémon en Hall: **${user.hallOfFame.length}/6**\n` +
        `Pokémon en cajas: **${user.boxes.length}**`
      )
  ];

  for (const [index, p] of user.hallOfFame.entries()) {
    embeds.push(
      new EmbedBuilder()
        .setTitle(`#${index + 1} ${p.name.toUpperCase()} ${p.shiny ? "✨" : ""}`)
        .setImage(getGifUrl(p))
    );
  }

  return embeds.slice(0, 10);
}

async function handleXpUpdate(userId, xpGained, db, thread) {
  const data = await getGist();

  if (!data[userId]) {
    data[userId] = {
      active: createNewEgg(),
      maxed: [],
      hallOfFame: [],
      boxes: [],
      messages: {
        active: null,
        hall: null
      }
    };
  }

  const user = data[userId];

  normalizeUser(user);
  updatePokemon(user, xpGained, db);
  normalizeUser(user);

  user.messages.active = await upsertMessage(
    thread,
    user.messages.active,
    {
      embeds: [buildActiveEmbed(user.active)]
    }
  );

  user.messages.hall = await upsertMessage(
    thread,
    user.messages.hall,
    {
      embeds: buildHallEmbeds(user)
    }
  );

  await updateGist(data);
}

export { handleXpUpdate };
