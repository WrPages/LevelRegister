export function parseHeartbeat(message) {
  const content = message.content;

  // ejemplo: "User: wR98 | Instances: 10"
  const nameMatch = content.match(/User:\s*(\w+)/i);
  const instMatch = content.match(/Instances:\s*(\d+)/i);

  if (!nameMatch) return null;

  return {
    name: nameMatch[1],
    instances: instMatch ? parseInt(instMatch[1]) : 0
  };
}

export function parseGP(message) {
  const firstLine = message.content.split("\n")[0];

  // ejemplo: "wR98 pulled ..."
  const match = firstLine.match(/^(\w+)/);

  return match ? match[1] : null;
}
