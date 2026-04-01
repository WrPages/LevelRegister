import axios from "axios";

const BASE = "https://api.github.com/gists";

export async function getGist(gistId) {
  try {
    const res = await axios.get(`${BASE}/${gistId}`, {
      headers: {
        Authorization: `token ${process.env.GIST_TOKEN}`
      }
    });

    const file = Object.values(res.data.files)[0];
    return file.content;

  } catch (err) {
    console.error("❌ Error leyendo gist:", err.response?.data || err.message);
    throw err;
  }
}

export async function updateGist(gistId, content) {
  try {
    await axios.patch(`${BASE}/${gistId}`, {
      files: {
        "tracking.json": {
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
