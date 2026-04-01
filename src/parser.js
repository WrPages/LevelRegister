export function parseHeartbeat(message) {
  const content =
    message.content ||
    message.embeds?.[0]?.description ||
    message.embeds?.[0]?.title ||
    "";

  if (!content) return null;

  const lines = content.split("\n");

  if (lines.length < 2) return null;

  const name = lines[0].trim();

  const onlineLine = lines.find(l =>
    l.toLowerCase().includes("online:")
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
  const content =
    message.content ||
    message.embeds?.[0]?.description ||
    message.embeds?.[0]?.title ||
    "";

  if (!content) return null;

  return content.split("\n")[0].trim();
}
