import discord
from discord.ext import commands
import requests
import json
import re
import time
import os

# =========================
# VARIABLES DE ENTORNO
# =========================

TOKEN = os.getenv("DISCORD_TOKEN")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

if not TOKEN or not GITHUB_TOKEN:
    raise Exception("Faltan variables de entorno (DISCORD_TOKEN / GITHUB_TOKEN)")

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}"
}

# =========================
# CONFIG (EDITA ESTO)
# =========================

HEARTBEAT_CHANNELS = {
    "trainer": 1486243169422020648,
    "gym_leader": 1491238609578360833,
    "elite_four": 1483616146996465735
}

# ⚠️ IMPORTANTE: NO incluir canales de heartbeat aquí
GP_CHANNELS = [
    1487362022864588902,
    1491238471556403281,
    1486277594629275770
]

OUTPUT_CHANNEL = 1484015417411244082

GISTS = {
    "register_trainer": "1c066922bc39ac136b6f234fad6d9420",
    "register_gym": "a3f5f3d8a2e6ddf2378fb3481dff49f6",
    "register_elite_four": "bb18eda2ea748723d8fe0131dd740b70",

    "online_trainer": "4edcf4d341cd4f7d5d0fb8a50f8b8c3c",
    "online_gym": "e110c37b3e0b8de83a33a1b0a5eb64e8",
    "online_elite_four": "d9db3a72fed74c496fd6cc830f9ca6e9",

    "global": "8f3c918d57e1dbf417d068684fbfa238"
}

# =========================
# BOT
# =========================

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

last_seen = {}

# =========================
# GIST FUNCTIONS
# =========================

def get_gist_data(gist_id):
    url = f"https://api.github.com/gists/{gist_id}"
    r = requests.get(url, headers=HEADERS)

    if r.status_code != 200:
        print("Error leyendo gist:", r.text)
        return {}

    data = r.json()
    content = list(data["files"].values())[0]["content"]

    try:
        return json.loads(content)
    except:
        print("Error parseando JSON")
        return {}


def update_gist(gist_id, data):
    url = f"https://api.github.com/gists/{gist_id}"

    payload = {
        "files": {
            "data.json": {
                "content": json.dumps(data, indent=2)
            }
        }
    }

    r = requests.patch(url, headers=HEADERS, json=payload)

    if r.status_code != 200:
        print("Error guardando gist:", r.text)


# =========================
# HELPERS
# =========================

def get_user(group_data, name):
    for discord_id, data in group_data.items():
        if data["name"].lower() == name.lower():
            return discord_id, data
    return None, None


def extract_instances(text):
    match = re.search(r"Online:\s*(.+)", text)
    if not match:
        return 0

    line = match.group(1)

    if "none" in line.lower():
        return 0

    nums = re.findall(r"\b\d+\b", line)
    return len(nums)


def extract_packs(text):
    match = re.search(r"Packs:\s*(\d+)", text)
    return int(match.group(1)) if match else 0


def update_level(user):
    user["level"] = int(user["xp"] // 10)


# =========================
# EVENT
# =========================

@bot.event
async def on_message(message):
    if message.author.bot:
        return

    channel_id = message.channel.id

    # =========================
    # HEARTBEAT
    # =========================
    for group, ch_id in HEARTBEAT_CHANNELS.items():
        if channel_id == ch_id:

            register_key = f"register_{group if group != 'gym_leader' else 'gym'}"
            online_key = f"online_{group if group != 'gym_leader' else 'gym'}"

            register = get_gist_data(GISTS[register_key])
            online = get_gist_data(GISTS[online_key])
            global_stats = get_gist_data(GISTS["global"])

            lines = message.content.split("\n")
            username = lines[0].strip()

            discord_id, user_data = get_user(register, username)
            if not discord_id:
                return

            if discord_id not in global_stats:
                global_stats[discord_id] = {
                    "name": username,
                    "rol": group,
                    "time": 0,
                    "xp": 0,
                    "level": 0,
                    "instances": 0,
                    "total_packs": 0,
                    "temp_packs": 0,
                    "gp": 0,
                    "online": False
                }

            user = global_stats[discord_id]

            instances = extract_instances(message.content)
            packs = extract_packs(message.content)

            # =========================
            # ONLINE DETECTION
            # =========================
            is_online = False

            if user_data["main_id"] in online:
                is_online = True

            if user_data["sec_id"] and user_data["sec_id"] in online:
                is_online = True

            now = time.time()

            # =========================
            # TIEMPO + XP
            # =========================
            if is_online:
                if discord_id in last_seen:
                    diff = (now - last_seen[discord_id]) / 60
                    user["time"] += diff
                    user["xp"] += diff
                    update_level(user)

                last_seen[discord_id] = now

            # =========================
            # PACKS
            # =========================
            if is_online:
                user["temp_packs"] = packs
            else:
                if user["temp_packs"] > 0:
                    user["total_packs"] += user["temp_packs"]
                    user["temp_packs"] = 0

            # =========================
            # INSTANCIAS RECORD
            # =========================
            if instances > user["instances"]:
                user["instances"] = instances

            user["online"] = is_online

            # =========================
            # GUARDAR
            # =========================
            update_gist(GISTS["global"], global_stats)

            await send_output(message.guild, global_stats)

    # =========================
    # GODPACKS
    # =========================
    if channel_id in GP_CHANNELS:
        global_stats = get_gist_data(GISTS["global"])

        match = re.match(r"@(\w+)", message.content)
        if match:
            username = match.group(1)

            for uid, user in global_stats.items():
                if user["name"].lower() == username.lower():
                    user["gp"] += 1
                    break

            update_gist(GISTS["global"], global_stats)
            await send_output(message.guild, global_stats)

    await bot.process_commands(message)


# =========================
# OUTPUT
# =========================

async def send_output(guild, data):
    channel = guild.get_channel(OUTPUT_CHANNEL)

    msg = "```json\n"
    for uid, u in data.items():
        packs = u["total_packs"] + u["temp_packs"]

        msg += f'"{uid}": {{\n'
        msg += f'  "name": "{u["name"]}",\n'
        msg += f'  "rol": "{u["rol"]}",\n'
        msg += f'  "time": {int(u["time"])},\n'
        msg += f'  "xp": {int(u["xp"])},\n'
        msg += f'  "level": {u["level"]},\n'
        msg += f'  "instances": {u["instances"]},\n'
        msg += f'  "packs": {packs},\n'
        msg += f'  "gp": {u["gp"]}\n'
        msg += "},\n"
    msg += "```"

    await channel.send(msg)


# =========================
# RUN
# =========================

bot.run(TOKEN)
