export function parseHeartbeat(message) {
  const lines = message.content.split("\n");

  if (lines.length < 2) return null;

  const name = lines[0].trim();

  const onlineLine = lines.find(l =>
    l.toLowerCase().startsWith("online:")
  );

  if (!onlineLine) return null;

  let instances = 0;

  const value = onlineLine.split(":")[1].trim();

  if (value.toLowerCase() !== "none") {
    instances = value.split(",").length;
  }

  return {
    name,
    instances
  };
}

// ✅ ESTA ES LA QUE TE FALTA
export function parseGP(message) {
  const firstLine = message.content.split("\n")[0].trim();

  return firstLine;
}
