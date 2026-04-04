// =============================
let userPanels = {}; // 👈 guarda paneles

// =============================
async function updatePanels() {
  const channel = await client.channels.fetch(
    process.env.STATS_CHANNEL_ID
  );

  for (const [id, s] of Object.entries(liveTracker)) {
    const t = trackingData[id] || {};

    const totalXP = (t.xp || 0) + s.sessionXP;
    const totalTime =
      (t.time || 0) +
      Math.floor((s.sessionTime || 0) / 60);

    const level = Math.floor(totalXP / 100);

    const { gif, progress } = getPokemonData(totalXP);

    // =============================
    // 🎴 GENERAR CANVAS
    // =============================
    const canvas = createCanvas(900, 300);
    const ctx = canvas.getContext("2d");

    const bg = await loadImage("./assets/card.png");
    ctx.drawImage(bg, 0, 0, 900, 300);

    ctx.font = "bold 36px Arial";
    ctx.fillStyle = "#fff";
    ctx.fillText(s.name, 40, 60);

    ctx.fillStyle = "#00ffcc";
    ctx.fillText(`Lv ${level}`, 750, 60);

    ctx.font = "22px Arial";

    ctx.fillStyle = "#00ffcc";
    ctx.fillText(`XP: ${totalXP.toFixed(0)}`, 40, 140);

    ctx.fillStyle = "#ffaa00";
    ctx.fillText(`Tiempo: ${totalTime}m`, 40, 180);

    ctx.fillStyle = "#ff66ff";
    ctx.fillText(`GP: ${t.gp || 0}`, 40, 220);

    ctx.fillStyle = "#222";
    ctx.fillRect(300, 200, 500, 20);

    ctx.fillStyle = "#00ff99";
    ctx.fillRect(300, 200, 500 * progress, 20);

    const file = new AttachmentBuilder(
      canvas.toBuffer(),
      { name: "card.png" }
    );

    // =============================
    // 🧠 SI YA EXISTE → EDITAR
    // =============================
    if (userPanels[id]) {
      try {
        const msg = await channel.messages.fetch(
          userPanels[id].messageId
        );

        await msg.edit({
          files: [file],
        });

        continue;
      } catch {
        delete userPanels[id]; // si falla, recrea
      }
    }

    // =============================
    // 🚀 CREAR NUEVO PANEL
    // =============================
    const sent = await channel.send({
      files: [file],
    });

    const thread = await sent.startThread({
      name: `GIF - ${s.name}`,
      autoArchiveDuration: 1440,
    });

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setImage(gif);

    await thread.send({ embeds: [embed] });

    userPanels[id] = {
      messageId: sent.id,
      threadId: thread.id,
    };
  }
}
