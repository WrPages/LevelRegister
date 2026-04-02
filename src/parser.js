// ===============================
// UTILIDAD: reconstruir mensaje
// ===============================
function extractFullContent(message) {
  let content = "";

  // Texto normal
  if (message.content) {
    content += message.content + "\n";
  }

  // Embeds (pueden venir varios)
  if (message.embeds && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      if (embed.title) content += embed.title + "\n";
      if (embed.description) content += embed.description + "\n";

      if (embed.fields && embed.fields.length > 0) {
        for (const field of embed.fields) {
          content += `${field.name}: ${field.value}\n`;
        }
      }
    }
  }

  return content.trim();
}

// ===============================
// HEARTBEAT PARSER
// ===============================
export function parseHeartbeat(message) {
  const content = extractFullContent(message);
  if (!content) return null;

  const lines = content
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  // 🧠 Primera línea válida = nombre
  const name = lines[0];
  if (!name) return null;

  // 🔍 Buscar línea que empiece con "Online:"
  const onlineLine = lines.find(l =>
    l.toLowerCase().startsWith("online:")
  );

  if (!onlineLine) return null;

  const value = onlineLine.split(":")[1]?.trim();
  if (!value) return null;

  let instances = 0;

  if (value.toLowerCase() !== "none") {
    instances = value
      .split(",")
      .map(v => v.trim())
      .filter(Boolean).length;
  }

  return {
    name: name.toLowerCase().trim(),
    instances
  };
}

// ===============================
// GP PARSER
// ===============================
export function parseGP(message) {
  const content = extractFullContent(message);
  if (!content) return null;

  const firstLine = content
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)[0];

  if (!firstLine) return null;

  // normalmente es algo tipo:
  // "Cynical Chery pulled..."
  const name = firstLine.split(" pulled")[0];

  return name.toLowerCase().trim();
}
