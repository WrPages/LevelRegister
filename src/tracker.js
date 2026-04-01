const users = {}; // memoria

export function initUsers(eliteUsers) {
  for (const discordId in eliteUsers) {
    const u = eliteUsers[discordId];

    users[u.name] = {
      discord_id: discordId,
      name: u.name,
      main_id: u.main_id,
      sec_id: u.sec_id,

      time_active: 0,
      xp: 0,
      gp: 0,
      instances: 0,

      gp_boost_until: 0
    };
  }
}

export function updateHeartbeat(data, onlineIds) {
  const user = users[data.name];
  if (!user) return;

  const isOnline =
    onlineIds.includes(user.main_id) ||
    onlineIds.includes(user.sec_id);

  user.instances = data.instances;

  if (isOnline && data.instances > 0) {
    user.time_active += 1; // 1 ciclo
    addXP(user);
  }
}

function addXP(user) {
  let xp = 1 + (user.instances * 0.1);

  const now = Date.now();

  if (user.gp_boost_until > now) {
    xp *= 2;
  }

  user.xp += xp;
}

export function addGP(name) {
  const user = users[name];
  if (!user) return;

  user.gp += 1;
  user.gp_boost_until = Date.now() + (60 * 60 * 1000);
}

export function getUsers() {
  return users;
}

export function resetLocalCounters() {
  for (const u of Object.values(users)) {
    u.time_active = 0;
    u.xp = 0;
  }
}
