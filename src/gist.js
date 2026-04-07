import axios from "axios";

const BASE = "https://api.github.com/gists";

// =============================
// 📥 LEER GIST
// =============================
export async function getGist(gistId) {
  try {
    const res = await axios.get(`${BASE}/${gistId}`, {
      headers: {
        Authorization: `token ${process.env.GIST_TOKEN}`
      }
    });

    // Obtener nombre real del archivo
    const fileName = Object.keys(res.data.files)[0];
    const file = res.data.files[fileName];

    return file.content;

  } catch (err) {
    console.error("❌ Error leyendo gist:", err.response?.data || err.message);
    return "{}";
  }
}

// =============================
// 💾 ACTUALIZAR GIST
// =============================
export async function updateGist(gistId, content) {
  try {
    // Primero obtenemos el nombre real del archivo
    const res = await axios.get(`${BASE}/${gistId}`, {
      headers: {
        Authorization: `token ${process.env.GIST_TOKEN}`
      }
    });

    const fileName = Object.keys(res.data.files)[0];

    await axios.patch(`${BASE}/${gistId}`, {
      files: {
        [fileName]: {
          content: JSON.stringify(content, null, 2)
        }
      }
    }, {
      headers: {
        Authorization: `token ${process.env.GIST_TOKEN}`
      }
    });

  } catch (err) {
    console.error("❌ Error actualizando gist:", err.response?.data || err.message);
  }
}
