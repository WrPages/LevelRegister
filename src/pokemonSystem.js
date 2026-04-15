const axios = require("axios");

const POKEMON_GIST_ID = process.env.GIST_POKEMON;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GIF_BASE_URL =
  "https://raw.githubusercontent.com/WrPages/gif_database/main/";

const thresholds = {
  hatch: 100,
  stage1: 1000,
  stage2: 2500,
  max: 4000
};

// =============================
// 📥 GIST HELPERS
// =============================

async function getGist() {
  const res = await axios.get(
    `https://api.github.com/gists/${POKEMON_GIST_ID}`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );

  return JSON.parse(res.data.files["pokemon_tracking.json"].content);
}

async function updateGist(data) {
  await axios.patch(
    `https://api.github.com/gists/${POKEMON_GIST_ID}`,
    {
      files: {
        "pokemon_tracking.json": {
          content: JSON.stringify(data, null, 2)
        }
      }
    },
    { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
  );
}

// =============================
// 🧠 LEVEL CALC
// =============================

function calculateLevel(xp) {
  return Math.min(100, Math.floor((xp / thresholds.max) * 100));
}

// =============================
// 🥚 EGG
// =============================

function createNewEgg() {
  const shiny = Math.random() < 0.05;

  return {
    lineId: null,
    stageIndex: -1,
    name: "egg",
    shiny,
    xp: 0,
    generation: null,
    legendary: false
  };
}

// =============================
// 🎲 PICK LINE
// =============================

function pickEvolutionLine(db) {

  const roll = Math.random();

  // 3% legendary
  if (roll < 0.03) {

    const randomLegend =
      db.legendary[Math.floor(Math.random() * db.legendary.length)];

    return {
      type: "legendary",
      name: randomLegend
    };
  }

  const randomLine =
    db.evolution_lines[
      Math.floor(Math.random() * db.evolution_lines.length)
    ];

  return {
    type: "normal",
    line: randomLine
  };
}

// =============================
// 📂 DETECT GENERATION
// =============================

function detectGeneration(pokemonName) {

  for (let line of globalPokemonDb.evolution_lines) {
    if (line.stages.includes(pokemonName)) {
      return line.generation || null;
    }
  }

  return null;
}

// =============================
// 🎞️ GIF PATH
// =============================

function getGifUrl(pokemon) {

  // 🥚 EGG
  if (pokemon.stageIndex === -1) {
    return pokemon.shiny
      ? `${GIF_BASE_URL}s_egg.gif`
      : `${GIF_BASE_URL}egg.gif`;
  }

  const fileName = pokemon.shiny
    ? `s_${pokemon.name}.gif`
    : `${pokemon.name}.gif`;

  // 🏆 LEGENDARY
  if (pokemon.legendary) {
    return `${GIF_BASE_URL}Legendary/${
      pokemon.shiny ? "Shiny" : "Normal"
    }/${fileName}`;
  }

  // 🧬 NORMAL BY GEN
  return `${GIF_BASE_URL}Gen${pokemon.generation}/${
    pokemon.shiny ? "Shiny" : "Normal"
  }/${fileName}`;
}

// =============================
// 🔄 UPDATE LOGIC
// =============================

let globalPokemonDb;

function updatePokemon(user, xpGained, db) {

  globalPokemonDb = db;

  const active = user.active;
  active.xp += xpGained;

  // HATCH
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
      active.legendary = false;
      active.generation = chosen.line.generation;
    }
  }

  // NORMAL EVOLUTIONS
  if (!active.legendary && active.stageIndex >= 0 && active.lineId) {

    const line = db.evolution_lines.find(l => l.id === active.lineId);

    if (active.stageIndex === 0 && active.xp >= thresholds.stage1) {
      active.stageIndex = 1;
      active.name = line.stages[1];
    }

    if (
      active.stageIndex === 1 &&
      active.xp >= thresholds.stage2 &&
      line.stages[2]
    ) {
      active.stageIndex = 2;
      active.name = line.stages[2];
    }
  }

  // MAX
  if (active.xp >= thresholds.max) {

    user.maxed.push({
      name: active.name,
      shiny: active.shiny,
      generation: active.generation,
      legendary: active.legendary
    });

    user.active = createNewEgg();
  }
}

// =============================
// 🚀 MAIN FUNCTION
// =============================

async function handleXpUpdate(userId, xpGained, pokemonDb, thread) {

  if (xpGained <= 0) return;

  const data = await getGist();

  if (!data[userId]) {
    data[userId] = {
      active: createNewEgg(),
      maxed: []
    };
  }

  updatePokemon(data[userId], xpGained, pokemonDb);

  await updateGist(data);

  const userData = data[userId];
  const active = userData.active;
  const level = calculateLevel(active.xp);

  // 🧹 CLEAN BOT MESSAGES
  const messages = await thread.messages.fetch({ limit: 20 });
  const botMessages = messages.filter(
    m => m.author.id === thread.client.user.id
  );

  for (const msg of botMessages.values()) {
    await msg.delete().catch(() => {});
  }

  // 🎯 ACTIVE
  await thread.send({
    content: `🌟 **Pokémon Activo**
Nombre: ${active.name}
Nivel: ${level}/100
XP: ${active.xp}/${thresholds.max}
Shiny: ${active.shiny ? "✨ Sí" : "No"}`,
    files: [getGifUrl(active)]
  });

  // 🏆 MAXED
  for (const p of userData.maxed) {

    const fileName = p.shiny
      ? `s_${p.name}.gif`
      : `${p.name}.gif`;

    let url;

    if (p.legendary) {
      url = `${GIF_BASE_URL}Legendary/${
        p.shiny ? "Shiny" : "Normal"
      }/${fileName}`;
    } else {
      url = `${GIF_BASE_URL}Gen${p.generation}/${
        p.shiny ? "Shiny" : "Normal"
      }/${fileName}`;
    }

    await thread.send({
      content: `🏆 ${p.name} (Nivel Máximo) ${p.shiny ? "✨" : ""}`,
      files: [url]
    });
  }
}

module.exports = {
  handleXpUpdate
};
