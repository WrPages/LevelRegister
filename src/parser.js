export function parseHeartbeat(message) {
  const lines = message.content.split("\n");

  if (lines.length < 2) return null;

  // 🧠 Nombre = primera línea
  const name = lines[0].trim();

  // 🔍 Línea de instancias
  const onlineLine = lines.find(l => l.toLowerCase().startsWith("online:"));
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
