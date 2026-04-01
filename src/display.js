export function buildStats(users) {
  const sorted = Object.values(users)
    .sort((a, b) => b.xp - a.xp);

  let msg = "**📊 REROLL STATS (30 MIN)**\n\n";

  for (const u of sorted) {
    msg += `👤 ${u.name}\n`;
    msg += `⏱️ ${u.time_active} min\n`;
    msg += `⚡ ${u.xp.toFixed(1)} XP\n`;
    msg += `💎 ${u.gp} GP\n`;
    msg += `🧪 ${u.instances} instancias\n\n`;
  }

  return msg;
}
