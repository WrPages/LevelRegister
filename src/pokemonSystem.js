import axios from "axios";

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

// =============================
// 📥 GIST HELPERS
// =============================
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

// =============================
// 💾 UPDATE GIST
// =============================
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

// =============================
// 🧠 LEVEL
// =============================
function calculateLevel(xp) {
  return Math.min(100, Math.floor((xp / thresholds.max) * 100));
}

// =============================
// 🥚 EGG
// =============================
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

// =============================
// 🎲 PICK LINE
// =============================
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

// =============================
// 🎞️ GIF
// =============================
function getGifUrl(pokemon) {

  if (pokemon.stageIndex === -1) {
    return pokemon.shiny
      ? `${GIF_BASE_URL}s_egg.gif`
      : `${GIF_BASE_URL}egg.gif`;
  }

  const fileName = pokemon.shiny
    ? `s_${pokemon.name}.gif`
    : `${pokemon.name}.gif`;

  if (pokemon.legendary) {
    return `${GIF_BASE_URL}Legendary/${
      pokemon.shiny ? "Shiny" : "Normal"
    }/${fileName}`;
  }

  return `${GIF_BASE_URL}Gen${pokemon.generation}/${
    pokemon.shiny ? "Shiny" : "Normal"
  }/${fileName}`;
}

// =============================
// 🔄 UPDATE LOGIC
// =============================
function updatePokemon(user, xpGained, db) {

  const active = user.active;
  active.xp += xpGained;

  // 🥚 HATCH
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

  // 🔁 EVOLUCIONES
  if (!active.legendary && active.lineId) {

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

  // 🏆 MAX
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
// 🚀 MAIN
// =============================
async function handleXpUpdate(userId, xpGained, db, thread) {

  const data = await getGist();

  if (!data[userId]) {
    data[userId] = {
      active: createNewEgg(),
      maxed: []
    };
  }

  const user = data[userId];

  updatePokemon(user, xpGained, db);

  await updateGist(data);

  const active = user.active;
  const level = calculateLevel(active.xp);

  // 🧹 limpiar mensajes del bot
  const messages = await thread.messages.fetch({ limit: 20 });

  for (const msg of messages.values()) {
    if (msg.author.id !== thread.client.user.id) continue;
    if (msg.components?.length > 0) continue;
    if (msg.system) continue;

    await msg.delete().catch(() => {});
  }

  // 🎯 ACTIVO
  await thread.send({
    content: `🌟 Pokémon Activo
Nombre: ${active.name}
Nivel: ${level}/100
XP: ${active.xp}/${thresholds.max}
Shiny: ${active.shiny ? "✨ Sí" : "No"}`,
    files: [getGifUrl(active)]
  });

  // 🏆 MAXED
  for (const p of user.maxed) {
    await thread.send({
      content: `🏆 ${p.name} ${p.shiny ? "✨" : ""}`,
      files: [getGifUrl({ ...p, stageIndex: 1 })]
    });
  }
}

// =============================
export { handleXpUpdate };
