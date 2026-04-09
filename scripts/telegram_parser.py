#!/usr/bin/env python3
"""
LebAid — Telegram Parser
Surveille un channel Telegram pour les alertes de frappes/sécurité
et les insère dans la table `strikes` de Supabase.

Usage:
  pip install python-telegram-bot supabase geopy
  TELEGRAM_BOT_TOKEN=... TELEGRAM_CHANNEL_ID=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python telegram_parser.py

Cron (toutes les 5 minutes):
  */5 * * * * cd /path/to/scripts && python telegram_parser.py
"""

import os
import re
import json
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
from geopy.geocoders import Nominatim
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
CHANNEL_ID = os.environ["TELEGRAM_CHANNEL_ID"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
STATE_FILE = Path(__file__).parent / ".telegram_last_id"

# ── Mots-clés pour détecter une frappe ──────────────────────────────────────
STRIKE_KEYWORDS = [
    # Anglais
    "airstrike", "air strike", "missile", "raid", "bombing", "explosion",
    "attack", "shelling", "drone", "projectile",
    # Français
    "frappe", "bombardement", "missile", "raid", "explosion", "attaque",
    "tir", "roquette",
    # Arabe (translittéré)
    "غارة", "صاروخ", "قصف", "انفجار", "هجوم", "طيران",
]

# ── Villes libanaises — dictionnaire de géocodage manuel ────────────────────
LEBANON_CITIES: dict[str, tuple[float, float]] = {
    "beyrouth": (33.8938, 35.5018),
    "beirut": (33.8938, 35.5018),
    "بيروت": (33.8938, 35.5018),
    "tripoli": (34.4333, 35.8497),
    "طرابلس": (34.4333, 35.8497),
    "sidon": (33.5600, 35.3700),
    "saida": (33.5600, 35.3700),
    "صيدا": (33.5600, 35.3700),
    "tyr": (33.2731, 35.2042),
    "tyre": (33.2731, 35.2042),
    "sur": (33.2731, 35.2042),
    "صور": (33.2731, 35.2042),
    "nabatieh": (33.3788, 35.4836),
    "النبطية": (33.3788, 35.4836),
    "baalbek": (34.0042, 36.2103),
    "بعلبك": (34.0042, 36.2103),
    "zahle": (33.8500, 35.9019),
    "زحلة": (33.8500, 35.9019),
    "jounieh": (33.9806, 35.6178),
    "جونيه": (33.9806, 35.6178),
    "byblos": (34.1208, 35.6480),
    "jbeil": (34.1208, 35.6480),
    "جبيل": (34.1208, 35.6480),
    "hermel": (34.3889, 36.3861),
    "الهرمل": (34.3889, 36.3861),
    "rashaya": (33.5044, 35.8417),
    "راشيا": (33.5044, 35.8417),
    "south lebanon": (33.2731, 35.2042),
    "liban-sud": (33.2731, 35.2042),
    "bekaa": (33.8500, 35.9019),
    "بقاع": (33.8500, 35.9019),
}


def load_last_id() -> int:
    if STATE_FILE.exists():
        return int(STATE_FILE.read_text().strip())
    return 0


def save_last_id(message_id: int) -> None:
    STATE_FILE.write_text(str(message_id))


def fetch_messages(offset: int) -> list[dict]:
    """Fetch updates from Telegram Bot API."""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates"
    params = {"offset": offset + 1, "timeout": 5, "limit": 100}
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json().get("result", [])
    except Exception as e:
        log.error(f"Telegram API error: {e}")
        return []


def is_strike(text: str) -> bool:
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in STRIKE_KEYWORDS)


def extract_location_name(text: str) -> str | None:
    """Extrait le premier lieu libanais mentionné dans le texte."""
    text_lower = text.lower()
    for city in LEBANON_CITIES:
        if city in text_lower:
            return city
    return None


def geocode(location_name: str) -> tuple[float, float] | None:
    """Retourne (lat, lng) pour un lieu libanais."""
    if location_name.lower() in LEBANON_CITIES:
        return LEBANON_CITIES[location_name.lower()]

    # Fallback : Nominatim (si le nom n'est pas dans le dict)
    try:
        geolocator = Nominatim(user_agent="lebaid-parser/1.0")
        result = geolocator.geocode(f"{location_name}, Lebanon", timeout=5)
        if result:
            return (result.latitude, result.longitude)
    except Exception as e:
        log.warning(f"Nominatim error for '{location_name}': {e}")

    return None


def insert_strike(supabase, message: dict, location_name: str, lat: float, lng: float) -> None:
    msg_id = str(message.get("message_id", ""))
    text = message.get("text", "")
    date = datetime.fromtimestamp(message.get("date", time.time()), tz=timezone.utc).isoformat()

    # Évite les doublons via source_message_id (colonne UNIQUE)
    result = supabase.table("strikes").insert({
        "location": f"POINT({lng} {lat})",
        "location_name": location_name,
        "occurred_at": date,
        "description": text[:500],  # max 500 chars
        "source_message_id": f"{CHANNEL_ID}_{msg_id}",
        "verified": False,
    }).execute()

    if result.data:
        log.info(f"Inserted strike: {location_name} ({lat}, {lng})")
    else:
        log.debug(f"Strike already exists or error: {msg_id}")


def main() -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    last_id = load_last_id()
    log.info(f"Starting from message_id offset: {last_id}")

    updates = fetch_messages(last_id)
    if not updates:
        log.info("No new messages.")
        return

    processed = 0
    strikes_found = 0
    new_last_id = last_id

    for update in updates:
        message = update.get("message", {})
        msg_id = update.get("update_id", 0)
        new_last_id = max(new_last_id, msg_id)

        # Filtrer par channel si spécifié
        chat = message.get("chat", {})
        if CHANNEL_ID and str(chat.get("id", "")) != str(CHANNEL_ID) and str(chat.get("username", "")) != CHANNEL_ID.lstrip("@"):
            continue

        text = message.get("text", "")
        if not text:
            continue

        processed += 1

        if not is_strike(text):
            continue

        location_name = extract_location_name(text)
        if not location_name:
            log.debug(f"No location found in: {text[:100]}")
            continue

        coords = geocode(location_name)
        if not coords:
            log.warning(f"Could not geocode: {location_name}")
            continue

        lat, lng = coords
        insert_strike(supabase, message, location_name, lat, lng)
        strikes_found += 1

    save_last_id(new_last_id)
    log.info(f"Processed {processed} messages, found {strikes_found} strikes.")


if __name__ == "__main__":
    main()
