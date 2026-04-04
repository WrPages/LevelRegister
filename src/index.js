const embed = new EmbedBuilder()
  .setColor(0x0d1117) // oscuro elegante

  // 🔥 NOMBRE GRANDE
  .setAuthor({
    name: "KYUREMBOT",
  })

  // 🎥 GIF PRINCIPAL
  .setImage("https://media.discordapp.net/attachments/1489832190530425014/1489832694924836944/venusaur.gif")

  // 📊 DATOS LIMPIOS (SIN EMOJIS)
  .setDescription(`
LEVEL 55

XP       5576
TIME     904m
GP       1

██████████░░░░░░░░
  `)

  // 🧊 FOOTER MINIMALISTA
  .setFooter({
    text: "REROLL PROFILE",
  });

