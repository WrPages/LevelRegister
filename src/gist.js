import axios from "axios";

const BASE = "https://api.github.com/gists";

export async function getGist(gistId) {
  const res = await axios.get(`${BASE}/${gistId}`, {
    headers: { Authorization: `token ${process.env.GIST_TOKEN}` }
  });

  const file = Object.values(res.data.files)[0];
  return file.content;
}

export async function updateGist(gistId, content) {
  const res = await axios.patch(`${BASE}/${gistId}`, {
    files: {
      "tracking.json": {
        content: JSON.stringify(content, null, 2)
      }
    }
  }, {
    headers: { Authorization: `token ${process.env.GIST_TOKEN}` }
  });

  return res.data;
}
