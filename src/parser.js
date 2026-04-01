export function parseHeartbeat(message) {
  let content = message.content;

  // 🔥 SI VIENE COMO EMBED
  if (!content && message.embeds?.length > 0) {
    const embed = message.embeds[0];

    // reconstruimos el texto completo del embed
    content = [
      embed.title,
      embed.description,
      ...(embed.fields?.map(f => `${f.name}: ${f.value}`) || [])
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (!content) return null;

  const lines = content.split("\n");

  // nombre = primera línea válida
  const name = lines[0]?.trim();
  if (!name) return null;

  const onlineLine = lines.find(l =>
    l.toLowerCase().includes("online")
  );

  if (!onlineLine) return null;

  let instances = 0;

  const value = onlineLine.split(":")[1]?.trim();

  if (value && value.toLowerCase() !== "none") {
    instances = value.split(",").length;
  }

  return {
    name,
    instances
  };
}

export function parseGP(message) {
  let content = message.content;

  if (!content && message.embeds?.length > 0) {
    const embed = message.embeds[0];

    content = embed.title || embed.description || "";
  }

  if (!content) return null;

  return content.split("\n")[0].trim();
}
