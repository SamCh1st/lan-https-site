"""SQLite persistence for the LAN site.

All values are passed as SQL parameters. Browser input is never concatenated
into a statement, and this module exposes no arbitrary SQL execution endpoint.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from pathlib import Path
import economy
from campaign_defaults import starter_records

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "site.db"
UPLOAD_DIR = DB_PATH.parent / "uploads"
PASSWORD_ROUNDS = 600_000

# Shared reference sections in the campaign's Archive navigation.
# Items retain their assignment/collection rules; other sections stay private.
PUBLIC_ARCHIVE_CATEGORIES = frozenset({
    'spell', 'attack', 'species', 'background', 'class', 'feat',
    'map_part', 'artwork', 'lore',
})


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def initialize() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                email TEXT COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS work_items (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
                content TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS work_owner_idx
                ON work_items(user_id, updated_at);
            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                filename TEXT NOT NULL UNIQUE,
                mime_type TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS campaign_members (
                campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('creator', 'member')),
                status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined')),
                invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(campaign_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                campaign_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
                read_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS personal_notes (
                work_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                note TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(work_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS campaign_player_positions (
                campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                x REAL NOT NULL DEFAULT 0,
                y REAL NOT NULL DEFAULT 0,
                z REAL NOT NULL DEFAULT 0,
                motion TEXT NOT NULL DEFAULT 'idle',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(campaign_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS campaign_ai_messages (
                id INTEGER PRIMARY KEY,
                campaign_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
                chat_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                persona_type TEXT NOT NULL CHECK(persona_type IN ('character', 'dm')),
                persona_id INTEGER,
                persona_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                addressed_to_ai INTEGER NOT NULL DEFAULT 0 CHECK(addressed_to_ai IN (0, 1)),
                audience_user_ids TEXT NOT NULL DEFAULT '[]',
                message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 12000),
                deleted_at TEXT,
                deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                delete_guard_id INTEGER,
                generation_status TEXT NOT NULL DEFAULT 'complete',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS campaign_ai_messages_idx
                ON campaign_ai_messages(campaign_id, id);
            CREATE TABLE IF NOT EXISTS campaign_ai_effects (
                message_id INTEGER PRIMARY KEY REFERENCES campaign_ai_messages(id) ON DELETE CASCADE,
                result TEXT NOT NULL
            );
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        from campaign_maps import initialize as initialize_maps
        initialize_maps(db)
        if "translation_enabled" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN translation_enabled INTEGER NOT NULL DEFAULT 0")
        if "ui_language" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'auto'")
        if "avatar_id" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN avatar_id INTEGER")
        position_columns = {row["name"] for row in db.execute("PRAGMA table_info(campaign_player_positions)")}
        if "y" not in position_columns:
            db.execute("ALTER TABLE campaign_player_positions ADD COLUMN y REAL NOT NULL DEFAULT 0")
        if "motion" not in position_columns:
            db.execute("ALTER TABLE campaign_player_positions ADD COLUMN motion TEXT NOT NULL DEFAULT 'idle'")
        ai_message_columns = {row["name"] for row in db.execute("PRAGMA table_info(campaign_ai_messages)")}
        if "audience_user_ids" not in ai_message_columns:
            db.execute("ALTER TABLE campaign_ai_messages ADD COLUMN audience_user_ids TEXT NOT NULL DEFAULT '[]'")
        if "chat_id" not in ai_message_columns:
            db.execute("ALTER TABLE campaign_ai_messages ADD COLUMN chat_id INTEGER")
        if "deleted_at" not in ai_message_columns:
            db.execute("ALTER TABLE campaign_ai_messages ADD COLUMN deleted_at TEXT")
        if "deleted_by" not in ai_message_columns:
            db.execute("ALTER TABLE campaign_ai_messages ADD COLUMN deleted_by INTEGER")
        if "delete_guard_id" not in ai_message_columns:
            db.execute("ALTER TABLE campaign_ai_messages ADD COLUMN delete_guard_id INTEGER")
        if "generation_status" not in ai_message_columns:
            db.execute("ALTER TABLE campaign_ai_messages ADD COLUMN generation_status TEXT NOT NULL DEFAULT 'complete'")
        db.execute(
            """UPDATE campaign_ai_messages
               SET generation_status = 'error',
                   message = CASE WHEN length(trim(message)) = 0
                                  THEN 'Generation was interrupted. Click a character card to try again.'
                                  ELSE message || char(10) || '[Generation interrupted]'
                             END
               WHERE generation_status = 'streaming'"""
        )
        db.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS campaign_ai_one_stream_idx
               ON campaign_ai_messages(campaign_id, COALESCE(chat_id, 0))
               WHERE generation_status = 'streaming' AND deleted_at IS NULL"""
        )
        campaigns = db.execute(
            "SELECT id, user_id FROM work_items WHERE json_extract(content, '$.category') = 'campaign'"
        ).fetchall()
        db.executemany(
            """INSERT OR IGNORE INTO campaign_members
               (campaign_id, user_id, role, status, invited_by)
               VALUES (?, ?, 'creator', 'accepted', ?)""",
            [(row["id"], row["user_id"], row["user_id"]) for row in campaigns],
        )
        from map_part_catalog import install
        install(db)
        from business_catalog import install as install_business_catalog
        install_business_catalog(db)
        from character_references import install_existing
        references=starter_records()
        install_existing(db,references)
        from starter_prices import upgrade
        upgrade(db,references)
        db.execute("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP")


def _password_hash(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ROUNDS)
    return "$".join((
        "pbkdf2_sha256",
        str(PASSWORD_ROUNDS),
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    ))


def _password_valid(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, expected = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.b64decode(salt), int(rounds)
        )
        return hmac.compare_digest(actual, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_user(username: str, email: str | None, password: str) -> int:
    with connect() as db:
        cursor = db.execute(
            "INSERT INTO users(username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, _password_hash(password)),
        )
        return int(cursor.lastrowid)


def authenticate(username: str, password: str) -> int | None:
    with connect() as db:
        row = db.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    return int(row["id"]) if row and _password_valid(password, row["password_hash"]) else None


def update_account(
    user_id: int,
    current_password: str,
    username: str,
    email: str | None,
    new_password: str | None,
    avatar_id: int | None,
    translation_enabled: bool | None = None,
    ui_language: str | None = None,
) -> dict | None:
    """Update an account only after verifying its existing password."""
    with connect() as db:
        row = db.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row or not _password_valid(current_password, row["password_hash"]):
            return None
        if new_password:
            db.execute(
                """UPDATE users SET username = ?, email = ?, password_hash = ?, avatar_id = ?
                   WHERE id = ?""",
                (username, email, _password_hash(new_password), avatar_id, user_id),
            )
        else:
            db.execute(
                "UPDATE users SET username = ?, email = ?, avatar_id = ? WHERE id = ?",
                (username, email, avatar_id, user_id),
            )
        if translation_enabled is not None:
            db.execute("UPDATE users SET translation_enabled = ? WHERE id = ?", (int(translation_enabled), user_id))
        if ui_language is not None:
            if ui_language not in ('auto','en','fr'):
                raise ValueError('Choose a supported interface language.')
            db.execute("UPDATE users SET ui_language = ? WHERE id = ?", (ui_language, user_id))
        updated = db.execute(
            "SELECT id, username, email, avatar_id, translation_enabled, ui_language, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return dict(updated)


def create_session(user_id: int, days: int = 30) -> tuple[str, dict]:
    token = secrets.token_urlsafe(32)
    expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)
    with connect() as db:
        db.execute(
            "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (_token_hash(token), user_id, expires.strftime("%Y-%m-%d %H:%M:%S")),
        )
        user = db.execute(
            "SELECT id, username, email, avatar_id, translation_enabled, ui_language, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return token, dict(user)


def user_for_session(token: str) -> dict | None:
    with connect() as db:
        row = db.execute(
            """SELECT users.id, users.username, users.email, users.avatar_id, users.translation_enabled, users.ui_language, users.created_at
               FROM sessions JOIN users ON users.id = sessions.user_id
               WHERE sessions.token_hash = ?
                 AND sessions.expires_at > CURRENT_TIMESTAMP""",
            (_token_hash(token),),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token: str) -> None:
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def list_work(user_id: int) -> list[dict]:
    with connect() as db:
        campaign_rows = db.execute(
            "SELECT campaign_id, role FROM campaign_members WHERE user_id = ? AND status = 'accepted'",
            (user_id,),
        ).fetchall()
        campaign_ids = [row["campaign_id"] for row in campaign_rows]
        roles = {row["campaign_id"]: row["role"] for row in campaign_rows}
        placeholders = ",".join("?" for _ in campaign_ids)
        membership_clause = ""
        parameters: list[object] = [user_id]
        if campaign_ids:
            membership_clause = f" OR id IN ({placeholders}) OR CAST(json_extract(content, '$.campaign_id') AS INTEGER) IN ({placeholders})"
            parameters.extend(campaign_ids)
            parameters.extend(campaign_ids)
        rows = db.execute(
            """SELECT id, user_id, title, content, created_at, updated_at
               FROM work_items WHERE user_id = ?""" + membership_clause + " ORDER BY updated_at DESC",
            parameters,
        ).fetchall()
        notes = {
            row["work_id"]: row["note"] for row in db.execute(
                "SELECT work_id, note FROM personal_notes WHERE user_id = ?", (user_id,)
            )
        }
    with connect() as db:
        met_cards={(r['campaign_id'],r['card_id']) for r in db.execute('SELECT campaign_id,card_id FROM campaign_marker_meetings WHERE user_id=?',(user_id,))}
    result = []
    owned_characters = {(int(c.get('campaign_id') or 0), row['id'])
                        for row in rows
                        for c in [json.loads(row['content'])]
                        if c.get('category') == 'character' and int(c.get('owner_user_id') or 0) == user_id}
    for row in rows:
        item = dict(row) | {"content": json.loads(row["content"])}
        item["personal_note"] = notes.get(item["id"], "")
        if item["content"].get("category") == "campaign":
            item["membership_role"] = roles.get(item["id"], "creator" if item["id"] in campaign_ids else None)
            result.append(item)
            continue
        campaign_id = item["content"].get("campaign_id")
        role = roles.get(int(campaign_id)) if campaign_id else None
        if role == "creator":
            result.append(item)
        elif role == "member":
            category = item["content"].get("category")
            assigned = user_id in [int(value) for value in item["content"].get("assigned_user_ids", []) if str(value).isdigit()]
            grant_key = 'owner_ids' if category == 'item' else 'user_ids' if category in ('spell', 'attack') else None
            linked = grant_key and not item['content'].get('reference_only') and any(
                (int(campaign_id), int(value)) in owned_characters
                for value in item['content'].get(grant_key, []) if str(value).isdigit())
            met = category in ('npc','encounter') and (int(campaign_id),item['id']) in met_cards
            shared_chat = category == 'chat' and item['content'].get('player_visible')
            if category in PUBLIC_ARCHIVE_CATEGORIES or category == 'character' or assigned or linked or met or shared_chat:
                result.append(item)
        elif item["user_id"] == user_id:
            result.append(item)
    return result


def list_all_work_for_host(user_id: int) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT id, user_id, title, content, created_at, updated_at FROM work_items ORDER BY updated_at DESC"
        ).fetchall()
        notes = {
            row["work_id"]: row["note"] for row in db.execute(
                "SELECT work_id, note FROM personal_notes WHERE user_id = ?", (user_id,)
            )
        }
        roles = {
            row["campaign_id"]: row["role"] for row in db.execute(
                "SELECT campaign_id, role FROM campaign_members WHERE user_id = ? AND status = 'accepted'",
                (user_id,),
            )
        }
    result = []
    for row in rows:
        item = dict(row) | {"content": json.loads(row["content"]), "personal_note": notes.get(row["id"], "")}
        if item["content"].get("category") == "character_template" and item["user_id"] != user_id:
            continue
        if item["content"].get("category") == "campaign":
            item["membership_role"] = roles.get(item["id"], "host")
        result.append(item)
    return result


def delete_campaign_as_host(campaign_id: int) -> bool:
    with connect() as db:
        campaign = db.execute(
            """SELECT 1 FROM work_items WHERE id = ?
               AND json_extract(content, '$.category') = 'campaign'""",
            (campaign_id,),
        ).fetchone()
        if not campaign:
            return False
        db.execute(
            "DELETE FROM work_items WHERE CAST(json_extract(content, '$.campaign_id') AS INTEGER) = ?",
            (campaign_id,),
        )
        db.execute("DELETE FROM work_items WHERE id = ?", (campaign_id,))
    return True


def normalize_character_grants(db, content):
    """Only characters from this campaign can receive a playable card."""
    if not isinstance(content, dict) or content.get('category') not in ('item', 'spell', 'attack'):
        return
    key = 'owner_ids' if content['category'] == 'item' else 'user_ids'
    requested = content.get(key, [])
    requested = {int(value) for value in requested if str(value).isdigit()} if isinstance(requested, list) else set()
    valid = {row['id'] for row in db.execute(
        "SELECT id FROM work_items WHERE CAST(json_extract(content, '$.campaign_id') AS INTEGER) = ? AND json_extract(content, '$.category') IN ('character', 'npc')",
        (content.get('campaign_id'),))}
    content[key] = sorted(requested & valid)
    if content[key]:
        content['reference_only'] = False


def normalize_map_image_scale(content):
    if content.get('category') in ('character', 'npc', 'encounter', 'character_template'):
        value = content.get('map_image_scale', 1)
        if type(value) not in (int, float) or not .25 <= value <= 8:
            raise ValueError('Map image scale must be between 0.25 and 8.')
        content['map_image_scale'] = value


def create_work(user_id: int, title: str, content: object) -> dict:
    from map_part_catalog import validate
    validate(content)
    with connect() as db:
        if content.get('category')=='character' and content.get('campaign_id'):
            creator=db.execute("SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=? AND role='creator' AND status='accepted'",(content['campaign_id'],user_id)).fetchone()
            if not creator:
                content.setdefault('tabletop',{})['money_cp']=0
                content['tabletop']['interaction_range']=5
            table=content.setdefault('tabletop',{})
            table.pop('equipment_loadout',None)
            table.pop('equipment_attuned',None)
            if not creator:
                for key in list(table):
                    if key.startswith('equipment_') and key!='equipment_coin_weight': table.pop(key,None)
        normalize_map_image_scale(content)
        economy.normalize(content)
        normalize_character_grants(db, content)
        encoded = json.dumps(content, separators=(",", ":"))
        cursor = db.execute(
            "INSERT INTO work_items(user_id, title, content) VALUES (?, ?, ?)",
            (user_id, title, encoded),
        )
        row = db.execute(
            "SELECT id, title, content, created_at, updated_at FROM work_items WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        if isinstance(content, dict) and content.get("category") == "campaign":
            db.execute(
                """INSERT INTO campaign_members(campaign_id, user_id, role, status, invited_by)
                   VALUES (?, ?, 'creator', 'accepted', ?)""",
                (cursor.lastrowid, user_id, user_id),
            )
            from map_part_catalog import install
            install(db, row["id"], user_id)
            from business_catalog import install as install_business_catalog
            install_business_catalog(db, row["id"], user_id)
            # Seed in the same transaction: a failed seed cannot leave a partial campaign.
            # Editing a campaign never runs this, so existing campaigns are untouched.
            if (content.get('tabletop') or {}).get('ruleset', '2024') == '2024':
                for reference in starter_records():
                    reference['content']['campaign_id'] = row['id']
                    db.execute('INSERT INTO work_items(user_id, title, content) VALUES (?, ?, ?)',
                               (user_id, reference['title'], json.dumps(reference['content'], separators=(',', ':'))))
    return dict(row) | {"content": json.loads(row["content"])}


def update_work(user_id: int, item_id: int, title: str, content: object) -> bool:
    from map_part_catalog import validate
    validate(content)
    with connect() as db:
        existing = db.execute(
            "SELECT user_id, content FROM work_items WHERE id = ?", (item_id,)
        ).fetchone()
        if not existing:
            return False
        previous_content = json.loads(existing["content"])
        campaign_id = previous_content.get("campaign_id")
        creator = bool(campaign_id and db.execute(
            """SELECT 1 FROM campaign_members WHERE campaign_id = ? AND user_id = ?
               AND role = 'creator' AND status = 'accepted'""",
            (campaign_id, user_id),
        ).fetchone())
        owns_character = (
            previous_content.get("category") == "character"
            and int(previous_content.get("owner_user_id") or 0) == user_id
        )
        if previous_content.get('category') == 'character':
            old_table = previous_content.get('tabletop') or {}
            table = content.setdefault('tabletop', {})
            # Loadouts change only through the transactional equipment endpoint.
            for key in ('equipment_loadout', 'equipment_attuned'):
                table[key] = old_table.get(key, {} if key.endswith('loadout') else [])
            if not creator:
                for key in set(table) | set(old_table):
                    if key.startswith('equipment_') and key not in ('equipment_loadout', 'equipment_attuned', 'equipment_coin_weight'):
                        if key in old_table: table[key] = old_table[key]
                        else: table.pop(key, None)
        if not creator and campaign_id:
            content.setdefault("tabletop", {})["money_cp"] = economy.balance(previous_content)
            content["tabletop"]["interaction_range"] = previous_content.get("tabletop",{}).get("interaction_range",5)
        owns_artwork = previous_content.get('category') == 'artwork' and existing['user_id'] == user_id and bool(campaign_id and db.execute("SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=? AND status='accepted'", (campaign_id,user_id)).fetchone())
        if owns_artwork and not creator:
            content = {**previous_content, **{k:content[k] for k in ('summary','notes','image_id','state','tags') if k in content}}
        allowed = creator or owns_character or owns_artwork or (not campaign_id and existing["user_id"] == user_id)
        if not allowed:
            return False
        if isinstance(content, dict) and previous_content.get("category") == "character":
            content["owner_user_id"] = previous_content.get("owner_user_id", existing["user_id"])
            content["campaign_id"] = previous_content.get("campaign_id")
            content["role"] = "party"
            content["assigned_user_ids"] = [content["owner_user_id"]]
        elif isinstance(content, dict) and previous_content.get("category") == "character_template":
            content["category"] = "character_template"
            content["owner_user_id"] = existing["user_id"]
            content["campaign_id"] = None
        normalize_map_image_scale(content)
        economy.normalize(content)
        normalize_character_grants(db, content)
        encoded = json.dumps(content, separators=(",", ":"))
        from equipment import reconcile_item
        reconcile_item(db, item_id, content)
        cursor = db.execute(
            """UPDATE work_items SET title = ?, content = ?,
               updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
            (title, encoded, item_id),
        )
        return cursor.rowcount == 1


def delete_work(user_id: int, item_id: int) -> bool:
    with connect() as db:
        existing = db.execute(
            "SELECT user_id, content FROM work_items WHERE id = ?", (item_id,)
        ).fetchone()
        if not existing:
            return False
        content = json.loads(existing["content"])
        campaign_id = content.get("campaign_id")
        creator = bool(campaign_id and db.execute(
            """SELECT 1 FROM campaign_members WHERE campaign_id = ? AND user_id = ?
               AND role = 'creator' AND status = 'accepted'""",
            (campaign_id, user_id),
        ).fetchone())
        owns_character = (
            content.get("category") == "character"
            and int(content.get("owner_user_id") or 0) == user_id
        )
        owns_artwork = content.get('category') == 'artwork' and existing['user_id'] == user_id and bool(campaign_id and db.execute("SELECT 1 FROM campaign_members WHERE campaign_id=? AND user_id=? AND status='accepted'", (campaign_id,user_id)).fetchone())
        allowed = creator or owns_character or owns_artwork or (not campaign_id and existing["user_id"] == user_id)
        if not allowed:
            return False
        cursor = db.execute(
            "DELETE FROM work_items WHERE id = ?", (item_id,)
        )
        return cursor.rowcount == 1


def save_upload(user_id: int, data: bytes, extension: str, mime_type: str) -> int:
    filename = secrets.token_hex(24) + extension
    (UPLOAD_DIR / filename).write_bytes(data)
    try:
        with connect() as db:
            cursor = db.execute(
                "INSERT INTO uploads(user_id, filename, mime_type) VALUES (?, ?, ?)",
                (user_id, filename, mime_type),
            )
            return int(cursor.lastrowid)
    except Exception:
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
        raise


def get_upload(user_id: int, upload_id: int) -> tuple[Path, str] | None:
    with connect() as db:
        row = db.execute(
            "SELECT filename, mime_type FROM uploads WHERE id = ? AND user_id = ?",
            (upload_id, user_id),
        ).fetchone()
    if not row:
        return None
    path = UPLOAD_DIR / row["filename"]
    return (path, row["mime_type"]) if path.is_file() else None


def get_visible_upload(user_id: int, upload_id: int) -> tuple[Path, str] | None:
    """Return artwork owned by the viewer or attached to a record they may see."""
    with connect() as db:
        row = db.execute(
            "SELECT user_id, filename, mime_type FROM uploads WHERE id = ?",
            (upload_id,),
        ).fetchone()
    if not row:
        return None
    if row["user_id"] != user_id:
        def contains_image(value: object, owned_urls=False) -> bool:
            if isinstance(value, dict):
                return int(value.get("image_id") or 0) == upload_id or any(contains_image(child,owned_urls) for child in value.values())
            if isinstance(value, list):
                return any(contains_image(child,owned_urls) for child in value)
            if owned_urls and isinstance(value,str):
                import re
                return bool(re.search(r"/api/uploads/"+str(upload_id)+r"(?![0-9])",value))
            return False
        visible = any(
            contains_image(item.get("content") or {}, item.get("user_id")==row["user_id"])
            for item in list_work(user_id)
        )
        if not visible:
            # Party portraits remain visible on the map without exposing character cards.
            with connect() as db:
                visible=bool(db.execute("""SELECT 1 FROM work_items w
                    JOIN campaign_members m ON m.campaign_id=CAST(json_extract(w.content,'$.campaign_id') AS INTEGER)
                    WHERE m.user_id=? AND m.status='accepted'
                    AND json_extract(w.content,'$.category')='character'
                    AND json_extract(w.content,'$.role')='party'
                    AND CAST(json_extract(w.content,'$.image_id') AS INTEGER)=? LIMIT 1""",(user_id,upload_id)).fetchone())
        if not visible:
            # Publishing a marker reveals its portrait, not its private note card.
            with connect() as db:
                maps = db.execute('''SELECT m.campaign_id,m.state FROM campaign_maps m
                    JOIN campaign_members member ON member.campaign_id=m.campaign_id
                    JOIN campaign_map_settings settings ON settings.campaign_id=m.campaign_id AND settings.kind=m.kind
                    WHERE member.user_id=? AND member.status='accepted' ''', (user_id,)).fetchall()
                for map_row in maps:
                    for node in json.loads(map_row['state']).get('nodes', []):
                        if not node.get('hidden') and node.get('part_image_id') == upload_id:
                            visible=True
                            break
                        if node.get('hidden') or node.get('type') not in ('npc', 'encounter', 'shop') or not node.get('card_id'):
                            continue
                        card = db.execute('SELECT content FROM work_items WHERE id=?', (node['card_id'],)).fetchone()
                        content = json.loads(card['content']) if card else {}
                        if (int(content.get('campaign_id') or 0) == map_row['campaign_id']
                                and content.get('category') == ('npc' if node['type']=='shop' else node['type'])
                                and int(content.get('image_id') or 0) == upload_id):
                            visible = True
                            break
                    if visible:
                        break
        if not visible:
            return None
    path = UPLOAD_DIR / row["filename"]
    return (path, row["mime_type"]) if path.is_file() else None


def community_profiles() -> list[dict]:
    with connect() as db:
        rows = db.execute(
            "SELECT id, username, avatar_id FROM users ORDER BY created_at DESC"
        ).fetchall()
    return [dict(row) | {"display_name": row["username"]} for row in rows]


def get_avatar(user_id: int) -> tuple[Path, str] | None:
    with connect() as db:
        row = db.execute(
            """SELECT uploads.filename, uploads.mime_type FROM users
               JOIN uploads ON uploads.id = users.avatar_id
               WHERE users.id = ?""",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    path = UPLOAD_DIR / row["filename"]
    return (path, row["mime_type"]) if path.is_file() else None


def invite_to_campaign(creator_id: int, campaign_id: int, username: str) -> str:
    with connect() as db:
        owner = db.execute(
            """SELECT 1 FROM campaign_members
               WHERE campaign_id = ? AND user_id = ? AND role = 'creator' AND status = 'accepted'""",
            (campaign_id, creator_id),
        ).fetchone()
        if not owner:
            return "forbidden"
        target = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not target:
            return "missing"
        if target["id"] == creator_id:
            return "self"
        existing = db.execute(
            "SELECT status FROM campaign_members WHERE campaign_id = ? AND user_id = ?",
            (campaign_id, target["id"]),
        ).fetchone()
        if existing and existing["status"] in ("pending", "accepted"):
            return "exists"
        db.execute(
            """INSERT INTO campaign_members(campaign_id, user_id, role, status, invited_by)
               VALUES (?, ?, 'member', 'pending', ?)
               ON CONFLICT(campaign_id, user_id) DO UPDATE SET
               status = 'pending', invited_by = excluded.invited_by""",
            (campaign_id, target["id"], creator_id),
        )
        campaign = db.execute("SELECT title FROM work_items WHERE id = ?", (campaign_id,)).fetchone()
        db.execute(
            """INSERT INTO notifications(user_id, type, message, campaign_id)
               VALUES (?, 'campaign_invite', ?, ?)""",
            (target["id"], f"You were invited to {campaign['title']}.", campaign_id),
        )
    return "ok"


def list_notifications(user_id: int) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            """SELECT notifications.id, notifications.type, notifications.message,
                      notifications.campaign_id, notifications.read_at, notifications.created_at,
                      work_items.title AS campaign_title, campaign_members.status AS invite_status
               FROM notifications LEFT JOIN work_items ON work_items.id = notifications.campaign_id
               LEFT JOIN campaign_members ON campaign_members.campaign_id = notifications.campaign_id
                    AND campaign_members.user_id = notifications.user_id
               WHERE notifications.user_id = ? ORDER BY notifications.created_at DESC LIMIT 50""",
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def answer_invite(user_id: int, campaign_id: int, accept: bool) -> bool:
    status = "accepted" if accept else "declined"
    with connect() as db:
        cursor = db.execute(
            """UPDATE campaign_members SET status = ?
               WHERE campaign_id = ? AND user_id = ? AND status = 'pending'""",
            (status, campaign_id, user_id),
        )
        if cursor.rowcount:
            db.execute(
                """UPDATE notifications SET read_at = CURRENT_TIMESTAMP
                   WHERE user_id = ? AND campaign_id = ? AND type = 'campaign_invite'""",
                (user_id, campaign_id),
            )
    return cursor.rowcount == 1


def mark_notifications_read(user_id: int) -> None:
    with connect() as db:
        db.execute(
            "UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (user_id,),
        )


def save_personal_note(user_id: int, work_id: int, note: str) -> bool:
    if not any(item["id"] == work_id for item in list_work(user_id)):
        return False
    with connect() as db:
        db.execute(
            """INSERT INTO personal_notes(work_id, user_id, note) VALUES (?, ?, ?)
               ON CONFLICT(work_id, user_id) DO UPDATE SET
               note = excluded.note, updated_at = CURRENT_TIMESTAMP""",
            (work_id, user_id, note),
        )
    return True


def has_campaign_access(user_id: int, campaign_id: int) -> bool:
    with connect() as db:
        return bool(db.execute(
            """SELECT 1 FROM campaign_members
               WHERE campaign_id = ? AND user_id = ? AND status = 'accepted'""",
            (campaign_id, user_id),
        ).fetchone())


def campaign_role(user_id: int, campaign_id: int) -> str | None:
    with connect() as db:
        row = db.execute(
            """SELECT role FROM campaign_members
               WHERE campaign_id = ? AND user_id = ? AND status = 'accepted'""",
            (campaign_id, user_id),
        ).fetchone()
    return row["role"] if row else None


def campaign_members(campaign_id: int) -> list[dict]:
    with connect() as db:
        rows = db.execute(
            """SELECT users.id, users.username, users.avatar_id, campaign_members.role
               FROM campaign_members JOIN users ON users.id = campaign_members.user_id
               WHERE campaign_members.campaign_id = ? AND campaign_members.status = 'accepted'
               ORDER BY campaign_members.role = 'creator' DESC, users.username""",
            (campaign_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def campaign_record(user_id: int, campaign_id: int) -> dict | None:
    if not has_campaign_access(user_id, campaign_id):
        return None
    with connect() as db:
        row = db.execute(
            "SELECT id, user_id, title, content FROM work_items WHERE id = ?",
            (campaign_id,),
        ).fetchone()
    if not row:
        return None
    return dict(row) | {"content": json.loads(row["content"])}


def list_ai_messages(user_id: int, campaign_id: int, addressed_only: bool = False, chat_id: int | None = None) -> list[dict] | None:
    if not has_campaign_access(user_id, campaign_id):
        return None
    clause = " AND (addressed_to_ai = 1 OR (role = 'assistant' AND user_id IS NULL)) AND generation_status = 'complete'" if addressed_only else ""
    clause += " AND campaign_ai_messages.chat_id = ?" if chat_id is not None else " AND campaign_ai_messages.chat_id IS NULL"
    parameters = (campaign_id, chat_id) if chat_id is not None else (campaign_id,)
    with connect() as db:
        rows = db.execute(
            """SELECT campaign_ai_messages.id, campaign_ai_messages.user_id,
                      campaign_ai_messages.chat_id, campaign_ai_messages.persona_type, campaign_ai_messages.persona_id,
                      campaign_ai_messages.persona_name, campaign_ai_messages.role,
                      campaign_ai_messages.addressed_to_ai, campaign_ai_messages.audience_user_ids, campaign_ai_messages.message,
                      campaign_ai_messages.generation_status,
                      campaign_ai_messages.created_at, users.username AS author_username
               FROM campaign_ai_messages LEFT JOIN users ON users.id = campaign_ai_messages.user_id
               WHERE campaign_ai_messages.campaign_id = ? AND campaign_ai_messages.deleted_at IS NULL""" + clause +
            " ORDER BY campaign_ai_messages.id",
            parameters,
        ).fetchall()
    creator = campaign_role(user_id, campaign_id) == "creator"
    result = []
    for row in rows:
        item = dict(row)
        try:
            item["audience_user_ids"] = [int(value) for value in json.loads(item.get("audience_user_ids") or "[]")]
        except (ValueError, TypeError, json.JSONDecodeError):
            item["audience_user_ids"] = []
        if creator or not item["audience_user_ids"] or user_id in item["audience_user_ids"]:
            result.append(item)
    return result


def add_ai_message(
    campaign_id: int,
    user_id: int | None,
    persona_type: str,
    persona_id: int | None,
    persona_name: str,
    role: str,
    addressed_to_ai: bool,
    message: str,
    audience_user_ids: list[int] | None = None,
    chat_id: int | None = None,
    generation_status: str = "complete",
) -> dict:
    audience = json.dumps(sorted(set(int(value) for value in (audience_user_ids or []))))
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO campaign_ai_messages
               (campaign_id,chat_id,user_id,persona_type,persona_id,persona_name,role,addressed_to_ai,audience_user_ids,message,generation_status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (campaign_id, chat_id, user_id, persona_type, persona_id, persona_name, role, int(addressed_to_ai), audience, message, generation_status),
        )
        row = db.execute(
            """SELECT campaign_ai_messages.id, campaign_ai_messages.user_id,
                      campaign_ai_messages.chat_id, campaign_ai_messages.persona_type, campaign_ai_messages.persona_id,
                      campaign_ai_messages.persona_name, campaign_ai_messages.role,
                      campaign_ai_messages.addressed_to_ai, campaign_ai_messages.audience_user_ids, campaign_ai_messages.message,
                      campaign_ai_messages.generation_status,
                      campaign_ai_messages.created_at, users.username AS author_username
               FROM campaign_ai_messages LEFT JOIN users ON users.id = campaign_ai_messages.user_id
               WHERE campaign_ai_messages.id = ?""",
            (cursor.lastrowid,),
        ).fetchone()
    item = dict(row)
    item["audience_user_ids"] = json.loads(item.get("audience_user_ids") or "[]")
    return item


def get_ai_message(campaign_id: int, message_id: int) -> dict | None:
    with connect() as db:
        row = db.execute(
            "SELECT * FROM campaign_ai_messages WHERE campaign_id = ? AND id = ?",
            (campaign_id, message_id),
        ).fetchone()
    return dict(row) if row else None


def update_ai_message(campaign_id: int, message_id: int, message: str) -> bool:
    with connect() as db:
        cursor = db.execute(
            "UPDATE campaign_ai_messages SET message = ? WHERE campaign_id = ? AND id = ?",
            (message, campaign_id, message_id),
        )
    return cursor.rowcount == 1


def update_ai_generation(campaign_id: int, message_id: int, message: str, status: str = "streaming") -> bool:
    safe_status = status if status in ("streaming", "complete", "error") else "streaming"
    safe_message = message[:12000] if message else " "
    with connect() as db:
        cursor = db.execute(
            "UPDATE campaign_ai_messages SET message = ?, generation_status = ? WHERE campaign_id = ? AND id = ?",
            (safe_message, safe_status, campaign_id, message_id),
        )
    return cursor.rowcount == 1


def delete_ai_message(campaign_id: int, message_id: int, deleted_by: int) -> int | None:
    with connect() as db:
        target = db.execute(
            "SELECT chat_id FROM campaign_ai_messages WHERE campaign_id = ? AND id = ? AND deleted_at IS NULL",
            (campaign_id, message_id),
        ).fetchone()
        if not target:
            return None
        if target["chat_id"] is None:
            guard = db.execute(
                "SELECT COALESCE(MAX(id), 0) AS value FROM campaign_ai_messages WHERE campaign_id = ? AND chat_id IS NULL AND deleted_at IS NULL AND id <> ?",
                (campaign_id, message_id),
            ).fetchone()["value"]
        else:
            guard = db.execute(
                "SELECT COALESCE(MAX(id), 0) AS value FROM campaign_ai_messages WHERE campaign_id = ? AND chat_id = ? AND deleted_at IS NULL AND id <> ?",
                (campaign_id, target["chat_id"], message_id),
            ).fetchone()["value"]
        cursor = db.execute(
            """UPDATE campaign_ai_messages SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, delete_guard_id = ?
               WHERE campaign_id = ? AND id = ? AND deleted_at IS NULL""",
            (deleted_by, guard, campaign_id, message_id),
        )
    return int(guard) if cursor.rowcount == 1 else None


def restore_ai_message(campaign_id: int, message_id: int, user_id: int) -> bool:
    with connect() as db:
        target = db.execute(
            """SELECT chat_id, delete_guard_id FROM campaign_ai_messages
               WHERE campaign_id = ? AND id = ? AND deleted_at IS NOT NULL AND deleted_by = ?""",
            (campaign_id, message_id, user_id),
        ).fetchone()
        if not target:
            return False
        if target["chat_id"] is None:
            latest = db.execute(
                "SELECT COALESCE(MAX(id), 0) AS value FROM campaign_ai_messages WHERE campaign_id = ? AND chat_id IS NULL AND deleted_at IS NULL",
                (campaign_id,),
            ).fetchone()["value"]
        else:
            latest = db.execute(
                "SELECT COALESCE(MAX(id), 0) AS value FROM campaign_ai_messages WHERE campaign_id = ? AND chat_id = ? AND deleted_at IS NULL",
                (campaign_id, target["chat_id"]),
            ).fetchone()["value"]
        if int(latest) != int(target["delete_guard_id"] or 0):
            return False
        cursor = db.execute(
            """UPDATE campaign_ai_messages SET deleted_at = NULL, deleted_by = NULL, delete_guard_id = NULL
               WHERE campaign_id = ? AND id = ?""",
            (campaign_id, message_id),
        )
    return cursor.rowcount == 1


def update_campaign_ai_state(campaign_id: int, changes: dict) -> dict | None:
    allowed = {"ai_story", "ai_memory", "ai_story_mode", "ai_model", "ai_helper_models", "ai_story_prompt", "ai_world"}
    with connect() as db:
        row = db.execute(
            "SELECT content FROM work_items WHERE id = ? AND json_extract(content, '$.category') = 'campaign'",
            (campaign_id,),
        ).fetchone()
        if not row:
            return None
        content = json.loads(row["content"])
        for key, value in changes.items():
            if key in allowed:
                content[key] = value
        db.execute(
            "UPDATE work_items SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(content, separators=(",", ":")), campaign_id),
        )
    return content


def campaign_character(campaign_id: int, character_id: int) -> dict | None:
    with connect() as db:
        row = db.execute(
            """SELECT id, user_id, title, content FROM work_items
               WHERE id = ? AND CAST(json_extract(content, '$.campaign_id') AS INTEGER) = ?
                 AND json_extract(content, '$.category') = 'character'""",
            (character_id, campaign_id),
        ).fetchone()
    return (dict(row) | {"content": json.loads(row["content"])}) if row else None


def campaign_chat(user_id: int, campaign_id: int, chat_id: int) -> dict | None:
    if not has_campaign_access(user_id, campaign_id):
        return None
    with connect() as db:
        row = db.execute(
            """SELECT id, user_id, title, content FROM work_items
               WHERE id = ? AND CAST(json_extract(content, '$.campaign_id') AS INTEGER) = ?
                 AND json_extract(content, '$.category') = 'chat'""",
            (chat_id, campaign_id),
        ).fetchone()
    if not row:
        return None
    item = dict(row) | {"content": json.loads(row["content"])}
    if campaign_role(user_id, campaign_id) == "creator":
        return item
    assigned = [int(value) for value in item["content"].get("assigned_user_ids", []) if str(value).isdigit()]
    return item if item["content"].get("player_visible") or user_id in assigned else None


def campaign_map_state(user_id: int, campaign_id: int) -> dict | None:
    if not has_campaign_access(user_id, campaign_id):
        return None
    requester_role = campaign_role(user_id, campaign_id)
    with connect() as db:
        campaign = db.execute("SELECT content FROM work_items WHERE id = ?", (campaign_id,)).fetchone()
        players = db.execute(
            """SELECT users.id, users.username, users.avatar_id,
                       COALESCE(campaign_player_positions.x, 0) AS x,
                       COALESCE(campaign_player_positions.y, 0) AS y,
                       COALESCE(campaign_player_positions.z, 0) AS z,
                       COALESCE(campaign_player_positions.motion, 'idle') AS motion
               FROM campaign_members JOIN users ON users.id = campaign_members.user_id
               LEFT JOIN campaign_player_positions ON campaign_player_positions.campaign_id = campaign_members.campaign_id
                    AND campaign_player_positions.user_id = campaign_members.user_id
               WHERE campaign_members.campaign_id = ? AND campaign_members.status = 'accepted'
                 AND campaign_members.role = 'member' ORDER BY users.username""",
            (campaign_id,),
        ).fetchall()
        actor_rows = db.execute(
            """SELECT id, title, content FROM work_items
               WHERE CAST(json_extract(content, '$.campaign_id') AS INTEGER) = ?
                 AND json_extract(content, '$.category') IN ('character', 'npc')
               ORDER BY updated_at DESC""",
            (campaign_id,),
        ).fetchall()
    if not campaign:
        return None
    content = json.loads(campaign["content"])
    characters: dict[int, dict] = {}
    npcs = []
    for row in actor_rows:
        actor = json.loads(row["content"])
        if actor.get("category") == "character":
            owner_id = int(actor.get("owner_user_id") or 0)
            if owner_id and owner_id not in characters:
                characters[owner_id] = {"character_id": row["id"], "character_name": row["title"],
                                        "character_image_id": actor.get("image_id"),
                                        "character_image_scale": actor.get("map_image_scale", 1),
                                        "character_rig": actor.get("character_rig")}
        elif requester_role == "creator" or actor.get("player_visible"):
            npcs.append({"id": row["id"], "name": row["title"], "character_rig": actor.get("character_rig")})
    player_data = []
    for row in players:
        player = dict(row)
        player.update(characters.get(int(row["id"]), {}))
        player_data.append(player)
    return {"time": content.get("map_time", "day"), "weather": content.get("map_weather", "clear"),
            "objects": content.get("map_objects", []), "paint": content.get("map_paint", []), "expanded": content.get("map_expanded", []),
            "removed": content.get("map_removed", []),
            "checkpoints": content.get("map_checkpoints", []), "icons": content.get("map_icons", []),
            "folders": content.get("map_folders", []), "players": player_data, "npcs": npcs}


def move_campaign_player(actor_id: int, campaign_id: int, target_id: int, x: float, y: float, z: float, motion: str) -> bool:
    role = campaign_role(actor_id, campaign_id)
    if role not in ("creator", "member") or (role != "creator" and actor_id != target_id):
        return False
    with connect() as db:
        member = db.execute(
            "SELECT 1 FROM campaign_members WHERE campaign_id = ? AND user_id = ? AND role = 'member' AND status = 'accepted'",
            (campaign_id, target_id),
        ).fetchone()
        if not member:
            return False
        db.execute(
            """INSERT INTO campaign_player_positions(campaign_id,user_id,x,y,z,motion) VALUES(?,?,?,?,?,?)
               ON CONFLICT(campaign_id,user_id) DO UPDATE SET x=excluded.x,y=excluded.y,z=excluded.z,motion=excluded.motion,updated_at=CURRENT_TIMESTAMP""",
            (campaign_id, target_id, x, y, z, motion),
        )
    return True


def has_owned_character(user_id: int, campaign_id: int) -> bool:
    with connect() as db:
        rows = db.execute(
            """SELECT content FROM work_items
               WHERE CAST(json_extract(content, '$.campaign_id') AS INTEGER) = ?
                 AND json_extract(content, '$.category') = 'character'""",
            (campaign_id,),
        ).fetchall()
    return any(int(json.loads(row["content"]).get("owner_user_id") or 0) == user_id for row in rows)
