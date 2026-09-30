from __future__ import annotations
from functools import partial
from ai_language import localized_payload, preferred_language

import argparse
import datetime as dt
import errno
import hashlib
import ipaddress
import json
import logging
import math
import os
import re
import socket
import sqlite3
import ssl
import time
import urllib.error
import urllib.request
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer as BaseThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import storage
import audio_library
import character_generator
import ai_effects
import campaign_maps
import economy
import equipment
from tabletop import normalize_tabletop
import spell_reader
import spell_designer
import art_designer
import art_editor
import local_art
from helper_advice import advice_cache, scope_key


ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = ROOT / "site"
CERT_DIR = ROOT / ".cert"
OLLAMA_BASE = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")


class ThreadingHTTPServer(BaseThreadingHTTPServer):
    # Campaign assets, polling and streamed artwork can arrive together.
    request_queue_size = 128
    # Windows address reuse can let a second site instance bind the same port.
    # Keep requests on one version of the application.
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def ollama_request(path: str, payload: dict | None = None, timeout: int = 120, language: str | None = None) -> dict:
    if language:
        payload = localized_payload(payload, language)
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        OLLAMA_BASE + path,
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
        method="POST" if body else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        value = json.loads(response.read().decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Ollama returned an unexpected response.")
    return value


def ollama_models() -> list[str]:
    result = ollama_request("/api/tags", timeout=5)
    return [str(model.get("name", "")).strip() for model in result.get("models", []) if model.get("name")]


def ollama_stream(path: str, payload: dict, timeout: int = 120, language: str | None = None):
    if language:
        payload = localized_payload(payload, language)
    request = urllib.request.Request(
        OLLAMA_BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        for line in response:
            line = line.strip()
            if not line:
                continue
            value = json.loads(line)
            if isinstance(value, dict):
                yield value


def partial_json_string_field(text: str, field: str) -> str:
    """Read a JSON string field even while Ollama is still streaming its value."""
    match = re.search(r'"' + re.escape(field) + r'"\s*:\s*"', text)
    if not match:
        return ""
    index = match.end()
    output: list[str] = []
    escapes = {"\"": "\"", "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
    while index < len(text):
        char = text[index]
        if char == '"':
            break
        if char != "\\":
            output.append(char)
            index += 1
            continue
        if index + 1 >= len(text):
            break
        escaped = text[index + 1]
        if escaped == "u":
            code = text[index + 2:index + 6]
            if len(code) < 4 or not re.fullmatch(r"[0-9a-fA-F]{4}", code):
                break
            output.append(chr(int(code, 16)))
            index += 6
            continue
        output.append(escapes.get(escaped, escaped))
        index += 2
    return "".join(output)


def response_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.I)
    value = json.loads(cleaned)
    if not isinstance(value, dict):
        raise ValueError("The AI response was not an object.")
    return value


def normalize_character_stats(content: dict) -> None:
    """Keep character-sheet values within the ranges used by the 2024 D&D sheet."""
    normalize_tabletop(content)
    if content.get("category") not in ("character", "character_template"):
        return

    def number(name: str, default: int, low: int, high: int) -> int:
        try:
            value = int(content.get(name, default))
        except (TypeError, ValueError, OverflowError):
            value = default
        value = max(low, min(high, value))
        content[name] = value
        return value

    level = number("character_level", 1, 1, 20)
    content["proficiency_bonus"] = 2 + (level - 1) // 4
    number("experience_points", 0, 0, 99_999_999)
    for ability in ("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"):
        number(ability, 10, 1, 30)
    number("armor_class", 10, 0, 99)
    maximum = number("hp_max", 1, 1, 999_999)
    number("hp_current", 1, 0, maximum)
    number("hp_temporary", 0, 0, 999_999)
    number("initiative", 0, -50, 50)
    number("speed", 30, 0, 999)
    number("passive_perception", 10, 0, 99)
    number("death_save_successes", 0, 0, 3)
    number("death_save_failures", 0, 0, 3)
    hit_die = str(content.get("hit_die", "d8")).lower()
    content["hit_die"] = hit_die if hit_die in ("d4", "d6", "d8", "d10", "d12") else "d8"
    for name in ("character_class", "subclass", "species", "background"):
        content[name] = str(content.get(name, "")).strip()[:80]


def best_lan_ip() -> str:
    """Find the IPv4 address used for the machine's default network route."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("1.1.1.1", 80))
        return probe.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())
    finally:
        probe.close()


def ensure_certificate(ip_text: str) -> tuple[Path, Path]:
    CERT_DIR.mkdir(exist_ok=True)
    cert_path = CERT_DIR / "lan-cert.pem"
    key_path = CERT_DIR / "lan-key.pem"

    if cert_path.exists() and key_path.exists():
        try:
            cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
            sans = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
            if ipaddress.ip_address(ip_text) in sans.get_values_for_type(x509.IPAddress):
                return cert_path, key_path
        except (ValueError, x509.ExtensionNotFound):
            pass

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, ip_text)])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=825))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.IPAddress(ipaddress.ip_address(ip_text)),
                x509.DNSName("localhost"),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    key_path.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path


class Handler(SimpleHTTPRequestHandler):
    def request_language(self):
        headers = getattr(self, 'headers', {})
        return preferred_language(headers.get('X-Site-Language') or headers.get('Accept-Language'))

    @property
    def ai_request(self):
        return partial(ollama_request, language=self.request_language())

    @property
    def ai_stream(self):
        return partial(ollama_stream, language=self.request_language())

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: HTTPStatus, payload: dict | list, cookie: str | None = None) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                return None
            value = json.loads(self.rfile.read(length))
            return value if isinstance(value, dict) else None
        except (ValueError, json.JSONDecodeError):
            return None

    def session_token(self) -> str | None:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get("lan_session")
        return morsel.value if morsel else None

    def current_user(self) -> dict | None:
        token = self.session_token()
        return storage.user_for_session(token) if token else None

    def is_host_request(self) -> bool:
        address = self.client_address[0]
        if address.startswith("::ffff:"):
            address = address[7:]
        return address in ("127.0.0.1", "::1", getattr(self.server, "lan_ip", ""))

    def require_user(self) -> dict | None:
        user = self.current_user()
        if not user:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Sign in to continue."})
        return user

    def safe_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlparse(origin)
        return parsed.scheme == "https" and parsed.netloc == self.headers.get("Host")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == '/api/audio':
            self.send_json(HTTPStatus.OK, audio_library.listing())
            return
        if path == '/api/audio/file':
            self.serve_audio()
            return
        avatar_match = re.fullmatch(r"/api/avatars/(\d+)", path)
        upload_match = re.fullmatch(r"/api/uploads/(\d+)", path)
        if avatar_match:
            user = self.require_user()
            if not user:
                return
            upload = storage.get_avatar(int(avatar_match.group(1)))
            if not upload:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Profile image not found."})
                return
            image_path, mime_type = upload
            body = image_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif upload_match:
            user = self.require_user()
            if not user:
                return
            upload = storage.get_visible_upload(user["id"], int(upload_match.group(1)))
            if not upload:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Image not found."})
                return
            image_path, mime_type = upload
            body = image_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "/api/me":
            user = self.current_user()
            if user:
                user["is_host"] = self.is_host_request()
            self.send_json(HTTPStatus.OK, {"user": user})
        elif path == "/api/work":
            user = self.require_user()
            if user:
                items = storage.list_work(user["id"])
                body = json.dumps({"items": items}, separators=(",", ":")).encode()
                etag = '"' + hashlib.sha256(body).hexdigest() + '"'
                # Hash the authorized response, including notes and visibility changes.
                unchanged = self.headers.get("If-None-Match") == etag
                self.send_response(HTTPStatus.NOT_MODIFIED if unchanged else HTTPStatus.OK)
                self.send_header("ETag", etag)
                self.send_header("Vary", "Cookie")
                if not unchanged:
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if not unchanged:
                    self.wfile.write(body)
        elif path == "/api/community":
            user = self.require_user()
            if user:
                self.send_json(HTTPStatus.OK, {"profiles": storage.community_profiles()})
        elif path == "/api/ai/status":
            user = self.require_user()
            if user:
                try:
                    models = ollama_models()
                    self.send_json(HTTPStatus.OK, {"available": True, "models": models})
                except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
                    self.send_json(HTTPStatus.OK, {"available": False, "models": [], "error": str(error)})
        elif re.fullmatch(r"/api/campaign/\d+/ai", path):
            user = self.require_user()
            if user:
                campaign_id = int(path.split("/")[3])
                campaign = storage.campaign_record(user["id"], campaign_id)
                if not campaign or not campaign["content"].get("ai_dm"):
                    self.send_json(HTTPStatus.FORBIDDEN, {"error": "AI campaign access denied."})
                    return
                role = storage.campaign_role(user["id"], campaign_id)
                content = campaign["content"]
                query = parse_qs(urlparse(self.path).query)
                try:
                    chat_id = int(query.get("chat_id", [""])[0]) if query.get("chat_id", [""])[0] else None
                except (TypeError, ValueError):
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose a valid campaign chat."})
                    return
                chat = storage.campaign_chat(user["id"], campaign_id, chat_id) if chat_id else None
                if chat_id and not chat:
                    self.send_json(HTTPStatus.FORBIDDEN, {"error": "That private chat is not available to you."})
                    return
                self.send_json(HTTPStatus.OK, {
                    "messages": storage.list_ai_messages(user["id"], campaign_id, chat_id=chat_id) or [],
                    "members": storage.campaign_members(campaign_id),
                    "chat": {"id": chat["id"], "title": chat["title"], "content": chat["content"]} if chat else None,
                    "story": content.get("ai_story", "") if role == "creator" else "",
                    "memory": content.get("ai_memory", "") if role == "creator" else "",
                    "story_mode": content.get("ai_story_mode", "adaptive"),
                    "model": content.get("ai_model", ""),
                    "helper_models": content.get("ai_helper_models", []),
                    "world": content.get("ai_world", {}),
                    "creator": role == "creator",
                })
        elif re.fullmatch(r"/api/campaign/\d+/maps(?:/\d+)?", path):
            self.map_request('GET', path)
        elif re.fullmatch(r"/api/campaign/\d+/map", path):
            user = self.require_user()
            if user:
                campaign_id = int(path.split("/")[3])
                state = storage.campaign_map_state(user["id"], campaign_id)
                self.send_json(HTTPStatus.OK, state) if state else self.send_json(HTTPStatus.FORBIDDEN, {"error": "Campaign access denied."})
        elif path == "/api/notifications":
            user = self.require_user()
            if user:
                self.send_json(HTTPStatus.OK, {"notifications": storage.list_notifications(user["id"])})
        elif path.startswith("/api/"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "API route not found."})
        else:
            super().do_GET()

    def do_POST(self) -> None:
        if not self.safe_origin():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Request origin rejected."})
            return
        path = urlparse(self.path).path
        if path == '/api/audio/import':
            self.import_audio()
            return
        if path == "/api/upload":
            self.upload_image()
            return
        data = self.read_json()
        if data is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid request."})
            return
        if path == "/api/register":
            self.register(data)
        elif path == "/api/login":
            self.login(data)
        elif path == "/api/logout":
            token = self.session_token()
            if token:
                storage.delete_session(token)
            self.send_json(
                HTTPStatus.OK, {"ok": True},
                "lan_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
            )
        elif path == "/api/work":
            user = self.require_user()
            if not user:
                return
            title = str(data.get("title", "")).strip()
            if not title or len(title) > 120:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Title must be 1–120 characters."})
                return
            content = data.get("content", {})
            if not isinstance(content, dict):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid campaign record."})
                return
            category = content.get("category")
            normalize_character_stats(content)
            try:
                from map_part_catalog import validate
                validate(content)
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return
            if category == "character_template":
                content["campaign_id"] = None
                content["owner_user_id"] = user["id"]
            elif category != "campaign":
                try:
                    campaign_id = int(content.get("campaign_id"))
                except (TypeError, ValueError):
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Enter a campaign before adding records."})
                    return
                if not storage.has_campaign_access(user["id"], campaign_id):
                    self.send_json(HTTPStatus.FORBIDDEN, {"error": "You are not a member of that campaign."})
                    return
                role = storage.campaign_role(user["id"], campaign_id)
                valid_members = {member["id"] for member in storage.campaign_members(campaign_id) if member["role"] == "member"}
                requested_assignments = content.get("assigned_user_ids", []) if isinstance(content.get("assigned_user_ids", []), list) else []
                content["assigned_user_ids"] = [int(value) for value in requested_assignments if str(value).isdigit() and int(value) in valid_members]
                if content.get("category") == "chat":
                    requested_characters = content.get("participant_ids", []) if isinstance(content.get("participant_ids", []), list) else []
                    participants = []
                    for value in requested_characters:
                        if not str(value).isdigit():
                            continue
                        character = storage.campaign_character(campaign_id, int(value))
                        if not character:
                            continue
                        participants.append(character["id"])
                        owner_id = int(character["content"].get("owner_user_id") or 0)
                        if owner_id in valid_members and owner_id not in content["assigned_user_ids"]:
                            content["assigned_user_ids"].append(owner_id)
                    content["participant_ids"] = participants
                if role != "creator":
                    may_create_character = (
                        content.get("category") == "character"
                        and not storage.has_owned_character(user["id"], campaign_id)
                    )
                    if category == 'artwork':
                        content['assigned_user_ids'] = [user['id']]
                    if not may_create_character and category != 'artwork':
                        self.send_json(HTTPStatus.FORBIDDEN, {"error": "Only the campaign creator can add this record."})
                        return
            if category == "character":
                content["role"] = "party"
                if role == "creator" and content.get("assigned_user_ids"):
                    content["owner_user_id"] = int(content["assigned_user_ids"][0])
                else:
                    content["owner_user_id"] = user["id"]
                content["assigned_user_ids"] = [content["owner_user_id"]] if content["owner_user_id"] in valid_members else []
            item = storage.create_work(user["id"], title, content)
            self.send_json(HTTPStatus.CREATED, {"item": item})
        elif re.fullmatch(r"/api/campaign/\d+/equipment", path):
            user = self.require_user()
            if user:
                try:
                    self.send_json(HTTPStatus.OK, equipment.request(user['id'], int(path.split('/')[3]), data))
                except PermissionError as error:
                    self.send_json(HTTPStatus.FORBIDDEN, {'error': str(error)})
                except (ValueError, TypeError, OverflowError) as error:
                    self.send_json(HTTPStatus.BAD_REQUEST, {'error': str(error)})
        elif re.fullmatch(r"/api/campaign/\d+/maps(?:/\d+/(?:take|meet|trade|open))?", path):
            self.map_request('POST',path,data)
        elif re.fullmatch(r"/api/campaign/\d+/characters/generate", path):
            user = self.require_user()
            if user:
                self.generate_character(user, int(path.split('/')[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/art/design", path):
            user = self.require_user()
            if user:
                self.design_art(user, int(path.split("/")[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/spells/design", path):
            user = self.require_user()
            if user:
                self.design_spell(user, int(path.split("/")[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/spells/interpret", path):
            user = self.require_user()
            if user:
                self.interpret_spell(user, int(path.split("/")[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/ai/message", path):
            user = self.require_user()
            if user:
                self.ai_message(user, int(path.split("/")[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/ai/respond", path):
            user = self.require_user()
            if user:
                data["respond_only"] = True
                self.ai_message(user, int(path.split("/")[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/ai/story", path):
            user = self.require_user()
            if user:
                self.ai_story(user, int(path.split("/")[3]), data)
        elif re.fullmatch(r"/api/campaign/\d+/ai/regenerate", path):
            user = self.require_user()
            if user:
                self.ai_regenerate(user, int(path.split("/")[3]), data)
        elif path == "/api/campaign/invite":
            user = self.require_user()
            if not user:
                return
            try:
                campaign_id = int(data.get("campaign_id"))
            except (TypeError, ValueError):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose a valid campaign."})
                return
            result = storage.invite_to_campaign(
                user["id"], campaign_id, str(data.get("username", "")).strip()
            )
            messages = {
                "forbidden": (HTTPStatus.FORBIDDEN, "Only the campaign creator can invite members."),
                "missing": (HTTPStatus.NOT_FOUND, "No account has that username."),
                "self": (HTTPStatus.BAD_REQUEST, "You are already the campaign creator."),
                "exists": (HTTPStatus.CONFLICT, "That user is already invited or is a member."),
            }
            if result != "ok":
                status, message = messages[result]
                self.send_json(status, {"error": message})
                return
            self.send_json(HTTPStatus.CREATED, {"ok": True})
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "API route not found."})

    def design_art(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user['id'], campaign_id)
        if not campaign or storage.campaign_role(user['id'], campaign_id) not in ('creator','member'):
            self.send_json(HTTPStatus.FORBIDDEN, {'error':'Join this campaign before drawing with AI.'})
            return
        prompt = data.get('prompt')
        if not isinstance(prompt,str) or not 1 <= len(prompt.strip()) <= 3000:
            self.send_json(HTTPStatus.BAD_REQUEST, {'error':'Describe your artwork in 1–3,000 characters.'})
            return
        image_mode = data.get('renderer') == 'local-image'
        source = None
        if image_mode and data.get('edit') is True:
            image_id = data.get('source_image_id')
            source_record = storage.get_upload(user['id'], image_id) if type(image_id) is int else None
            if not source_record or source_record[1] != 'image/png':
                self.send_json(HTTPStatus.BAD_REQUEST, {'error': 'Upload the current canvas before editing it.'})
                return
            source = source_record[0]
        if image_mode and not local_art.ready():
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {'error': 'Local image model setup is not complete. Run scripts/setup_local_art.py on the server computer.'})
            return
        try:
            model = campaign['content'].get('ai_model') if image_mode else self.ai_model(campaign['content'].get('ai_model'))
        except (OSError,ValueError) as error:
            if image_mode: model = None
            else:
                self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {'error':str(error)})
                return
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type','application/x-ndjson; charset=utf-8')
        self.send_header('X-Accel-Buffering','no')
        self.send_header('Connection','close')
        self.end_headers()
        self.close_connection = True
        def emit(event):
            self.wfile.write((json.dumps(event,ensure_ascii=False)+'\n').encode('utf-8'))
            self.wfile.flush()
        configured=campaign['content'].get('ai_helper_models',[])
        configured=configured if isinstance(configured,list) else []
        if image_mode and data.get('use_helpers') is not True:
            configured=[]
        try:installed=set(ollama_models()) if configured else set()
        except (OSError,ValueError):installed=set()
        helpers=list(dict.fromkeys(h for h in configured if isinstance(h,str) and h in installed and h!=model))[:3]
        if image_mode:
            events=local_art.design(prompt.strip(),source,data.get('image_size',512),helpers,self.ai_stream,data.get('research') is True,data.get('transparent_background') is not False)
        else:
            events=art_editor.edit(prompt.strip(),model,self.ai_stream,data.get('layers'),helpers,data.get('selected')) if data.get('edit') is True else art_designer.design(prompt.strip(),model,self.ai_stream,data.get('research') is not False,helper_models=helpers)
        try:
            for event in events:
                if event.get('event') == 'pixels':
                    image_id = storage.save_upload(user['id'], event['data'], '.png', 'image/png')
                    emit({'event':'image','image_id':image_id})
                else: emit(event)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            pass
        except Exception as error:
            logging.exception('AI artwork failed')
            try:emit({'event':'error','message':str(error)[:400]})
            except OSError:pass
        finally:
            events.close()

    def design_spell(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user["id"], campaign_id)
        if not campaign or storage.campaign_role(user["id"], campaign_id) not in ("creator", "member"):
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Enter a campaign you belong to before designing a spell."})
            return
        prompt = data.get("prompt")
        if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 2000:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Describe a spell in 1–2,000 characters."})
            return
        try:
            model = self.ai_model(campaign["content"].get("ai_model"))
        except (OSError, ValueError) as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "The AI designer is unavailable: " + str(error)})
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        def emit(event):
            self.wfile.write((json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8"))
            self.wfile.flush()

        configured=campaign['content'].get('ai_helper_models',[])
        try:
            installed=set(ollama_models()) if configured else set()
        except (OSError,ValueError):
            installed=set()
        helpers=list(dict.fromkeys(str(name) for name in configured if str(name) in installed and str(name)!=model))[:3]
        target_parts=data.get('target_parts',600)
        if type(target_parts) is not int or target_parts not in (300,600,900):target_parts=600
        helper_context={'request':prompt.strip(),'detail':data.get('detail','detailed'),'target_parts':target_parts}
        helper_key=scope_key(['spell',user['id'],campaign_id],helper_context,[model]+helpers)
        notes=advice_cache.ready(helper_key) if helpers else []
        events = spell_designer.design(prompt.strip(), model, self.ai_stream, detail="simple" if data.get("detail") == "simple" else "detailed",helper_models=helpers,helper_notes=notes,target_parts=target_parts)
        try:
            for event in events:
                emit(event)
                if event.get('event')=='done':
                    advice_cache.prepare(helper_key,helpers,helper_context,[],json.dumps({'summary':event['summary'],'nodes':event['nodes']})[:20000],self.ai_request,
                        instruction='Review this fictional spell drawing for a future revision. Check signs versus elemental sigils, main ring and branch connectivity, and unsupported claims. Suggest concise corrections; do not certify invented magic as canon. Return JSON only: {"advice":"brief notes"}.')
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as error:
            logging.exception("AI spell design failed")
            try:
                emit({"event": "error", "message": "The AI stopped drawing: " + str(error)[:400]})
            except OSError:
                pass
        finally:
            events.close()

    def interpret_spell(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user["id"], campaign_id)
        if not campaign or storage.campaign_role(user["id"], campaign_id) not in ("creator", "member"):
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Enter a campaign you belong to before reading a spell."})
            return
        try:
            measured = spell_reader.geometry(data.get("nodes"))
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        try:
            model = self.ai_model(campaign["content"].get("ai_model"))
            result = spell_reader.interpret(measured, model, self.ai_request)
            self.send_json(HTTPStatus.OK, result)
        except (OSError, ValueError, TypeError, urllib.error.URLError) as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "The AI spell reader could not finish: " + str(error).rstrip(".") + ". Your drawing is saved; retry the reading."})

    def map_request(self, method, path, data=None, user=None):
        user=user or self.require_user()
        if not user: return
        match=re.fullmatch(r'/api/campaign/(\d+)/maps(?:/(\d+))?(?:/(activate|visit|summon|rename|position|take|meet|trade|open))?',path)
        if not match: self.send_json(HTTPStatus.NOT_FOUND,{'error':'Map route not found.'}); return
        cid=int(match[1]);mid=int(match[2]) if match[2] else None;action=match[3]
        try:
            if method=='GET': result=campaign_maps.get(user['id'],cid,mid) if mid else campaign_maps.listing(user['id'],cid)
            elif method=='POST' and mid is None: result=campaign_maps.create(user['id'],cid,data or {})
            elif method=='POST' and mid and action=='open': result=campaign_maps.part_opening.attempt(user['id'],cid,mid,data or {})
            elif method=='POST' and mid and action=='meet': result=campaign_maps.meet_marker(user['id'],cid,mid,data or {})
            elif method=='POST' and mid and action=='trade': result=economy.transact(user['id'],cid,mid,data or {})
            elif method=='POST' and mid and action=='take': result=campaign_maps.take_contents(user['id'],cid,mid,data or {})
            elif method=='PUT' and mid and action=='activate': result=campaign_maps.activate(user['id'],cid,mid)
            elif method=='PUT' and mid and action=='visit': result=campaign_maps.visit(user['id'],cid,mid,data or {})
            elif method=='PUT' and mid and action=='summon': result=campaign_maps.summon(user['id'],cid,mid,data or {})
            elif method=='PUT' and mid and action=='rename': result=campaign_maps.rename(user['id'],cid,mid,data or {})
            elif method=='PUT' and mid and action=='position': result=campaign_maps.move(user['id'],cid,mid,data or {})
            elif method=='PUT' and mid: result=campaign_maps.update(user['id'],cid,mid,data or {})
            else: raise ValueError('Unsupported map action.')
            self.send_json(HTTPStatus.CREATED if method=='POST' else HTTPStatus.OK,result)
        except PermissionError as error: self.send_json(HTTPStatus.FORBIDDEN,{'error':str(error)})
        except FileExistsError as error: self.send_json(HTTPStatus.CONFLICT,{'error':str(error)})
        except (ValueError,TypeError,OverflowError) as error: self.send_json(HTTPStatus.BAD_REQUEST,{'error':str(error)})

    def generate_character(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user['id'], campaign_id)
        if not campaign:
            self.send_json(HTTPStatus.FORBIDDEN, {'error':'Join a campaign to generate a character.'})
            return
        prompt = data.get('prompt')
        if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 6000:
            self.send_json(HTTPStatus.BAD_REQUEST, {'error':'Describe your character in 1–6,000 characters.'})
            return
        try:
            model = self.ai_model(campaign['content'].get('ai_model'))
            draft = character_generator.generate(prompt.strip(), campaign['content'], model, self.ai_request, response_json, normalize_character_stats)
            self.send_json(HTTPStatus.OK, {'draft':draft})
        except (ValueError, TypeError, KeyError, urllib.error.URLError, TimeoutError, OSError) as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {'error':'Character generation could not finish: '+str(error).rstrip('. ')+'. Your form has not been changed.'})

    def ai_model(self, requested: object) -> str:
        models = ollama_models()
        if not models:
            raise ValueError("Ollama is running, but no local models are installed.")
        model = str(requested or "").strip()
        if not model:
            return models[0]
        if model not in models:
            raise ValueError("That Ollama model is not installed on the server computer.")
        return model

    def ai_story(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user["id"], campaign_id)
        if not campaign or storage.campaign_role(user["id"], campaign_id) != "creator" or not campaign["content"].get("ai_dm"):
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Only the campaign creator can shape the AI DM's story."})
            return
        content = campaign["content"]
        mode = str(data.get("story_mode", content.get("ai_story_mode", "adaptive")))
        mode = mode if mode in ("adaptive", "fixed") else "adaptive"
        action = str(data.get("action", "save"))
        prompt = str(data.get("prompt", "")).strip()[:8000]
        current_story = str(data.get("story", content.get("ai_story", "")))[:50000]
        memory = str(data.get("memory", content.get("ai_memory", "")))[:30000]
        requested_helpers = data.get("helper_models", content.get("ai_helper_models", []))
        requested_helpers = requested_helpers if isinstance(requested_helpers, list) else []
        helper_models = list(dict.fromkeys(str(value).strip()[:120] for value in requested_helpers if str(value).strip()))[:3]
        if action == "save":
            updated = storage.update_campaign_ai_state(campaign_id, {
                "ai_story": current_story, "ai_memory": memory, "ai_story_mode": mode,
                "ai_model": str(data.get("model", content.get("ai_model", ""))).strip()[:120],
                "ai_helper_models": helper_models,
                "ai_world": data.get("world", content.get("ai_world", {})) if isinstance(data.get("world", content.get("ai_world", {})), dict) else {},
            })
            self.send_json(HTTPStatus.OK, {"story": updated.get("ai_story", ""), "memory": updated.get("ai_memory", ""), "story_mode": mode})
            return
        if action not in ("generate", "modify") or not prompt:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Enter a story prompt first."})
            return
        try:
            model = self.ai_model(data.get("model") or content.get("ai_model"))
            instruction = "Create a complete campaign story from the request." if action == "generate" else "Revise and expand the existing campaign story according to the request without discarding unrelated useful material."
            result = self.ai_request("/api/chat", {
                "model": model,
                "stream": False,
                "think": False,
                "options": {"num_predict": 1200},
                "messages": [
                    {"role": "system", "content": "You are a tabletop RPG campaign designer. Write a concise campaign story directly as readable prose, not JSON. Include premise, important characters, locations, conflicts, secrets, likely arcs, and flexible hooks. Keep it under 750 words and usable at the table."},
                    {"role": "user", "content": instruction + "\n\nExisting story:\n" + current_story[:14000] + "\n\nRequest:\n" + prompt},
                ],
            })
            story = str((result.get("message") or {}).get("content", "")).strip()[:50000]
            if not story:
                raise ValueError("Ollama did not return a story.")
            storage.update_campaign_ai_state(campaign_id, {
                "ai_story": story, "ai_story_prompt": prompt, "ai_story_mode": mode, "ai_model": model,
                "ai_helper_models": helper_models,
            })
            self.send_json(HTTPStatus.OK, {"story": story, "story_mode": mode, "model": model})
        except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "Ollama could not generate the story: " + str(error)})

    def ai_message(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user["id"], campaign_id)
        if not campaign or not campaign["content"].get("ai_dm"):
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "AI campaign access denied."})
            return
        role = storage.campaign_role(user["id"], campaign_id)
        members = storage.campaign_members(campaign_id)
        try:
            chat_id = int(data.get("chat_id")) if data.get("chat_id") not in (None, "") else None
        except (TypeError, ValueError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose a valid campaign chat."})
            return
        chat = storage.campaign_chat(user["id"], campaign_id, chat_id) if chat_id else None
        if chat_id and not chat:
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "That private chat is not available to you."})
            return
        valid_audience = {member["id"] for member in members if member["role"] == "member"}
        requested_audience = data.get("audience_user_ids", []) if isinstance(data.get("audience_user_ids", []), list) else []
        public_message = any(str(value).casefold() == "all" for value in requested_audience) or not requested_audience
        audience_ids = [] if public_message else [int(value) for value in requested_audience if str(value).isdigit() and int(value) in valid_audience]
        if chat:
            audience_ids = [int(value) for value in chat["content"].get("assigned_user_ids", []) if str(value).isdigit() and int(value) in valid_audience]
        if audience_ids and user["id"] in valid_audience and user["id"] not in audience_ids:
            audience_ids.append(user["id"])
        respond_only = bool(data.get("respond_only"))
        posted = None
        if not respond_only:
            message = str(data.get("message", "")).strip()
            if not message or len(message) > 12000:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Write a message up to 12,000 characters."})
                return
            persona_type = str(data.get("persona_type", "character"))
            persona_id = None
            persona_name = "AI Dungeon Master"
            message_role = "user"
            addressed = bool(data.get("addressed_to_ai"))
            if persona_type == "dm":
                if not addressed:
                    message_role = "assistant"
            else:
                try:
                    persona_id = int(data.get("persona_id"))
                except (TypeError, ValueError):
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose a character before speaking."})
                    return
                character = storage.campaign_character(campaign_id, persona_id)
                if not character:
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": "That campaign character no longer exists."})
                    return
                if chat and persona_id not in [int(value) for value in chat["content"].get("participant_ids", []) if str(value).isdigit()]:
                    self.send_json(HTTPStatus.FORBIDDEN, {"error": "That character is not part of this private chat."})
                    return
                owner_id = int(character["content"].get("owner_user_id") or 0)
                persona_name = character["title"]
                if audience_ids and owner_id in valid_audience and owner_id not in audience_ids:
                    audience_ids.append(owner_id)
            posted = storage.add_ai_message(campaign_id, user["id"], persona_type, persona_id, persona_name, message_role, addressed, message, audience_ids, chat_id)
            self.send_json(HTTPStatus.CREATED, {"message": posted, "ai_replied": False})
            return
        content = campaign["content"]
        member_names = {member["username"].casefold(): member for member in members if member["role"] == "member"}
        reply_as_type = str(data.get("reply_as_type", "dm"))
        reply_as_id = None
        reply_as_name = "AI Dungeon Master"
        reply_owner_id = None
        if reply_as_type == "character":
            try:
                reply_as_id = int(data.get("reply_as_id"))
            except (TypeError, ValueError):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose which character the AI should answer as."})
                return
            reply_character = storage.campaign_character(campaign_id, reply_as_id)
            if not reply_character:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "That AI player character no longer exists."})
                return
            if chat and reply_as_id not in [int(value) for value in chat["content"].get("participant_ids", []) if str(value).isdigit()]:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "That character is not part of this private chat."})
                return
            reply_as_name = reply_character["title"]
            reply_owner_id = int(reply_character["content"].get("owner_user_id") or 0) or None
        else:
            reply_as_type = "dm"
        records = []
        campaign_records = storage.list_work(campaign["user_id"])
        character_names = {record['id']: record['title'] for record in campaign_records
                           if (record.get('content') or {}).get('category') in ('character', 'npc')
                           and (record.get('content') or {}).get('campaign_id') == campaign_id}
        for item in campaign_records:
            card = item.get("content") or {}
            if card.get('category') == 'map_part' or int(card.get("campaign_id") or 0) != campaign_id:
                continue
            assigned_ids = [int(value) for value in card.get("assigned_user_ids", []) if str(value).isdigit()]
            grant_key = 'owner_ids' if card.get('category') == 'item' else 'user_ids' if card.get('category') in ('spell', 'attack') else None
            character_grants = [int(value) for value in card.get(grant_key, []) if str(value).isdigit()] if grant_key and not card.get('reference_only') else []
            if reply_as_type == "character" and not (reply_as_id in character_grants or card.get("player_visible") or card.get("category") == "character" or (reply_owner_id and reply_owner_id in assigned_ids)):
                continue
            assigned_names = [member["username"] for member in members if member["id"] in card.get("assigned_user_ids", [])]
            records.append({
                "id": item['id'], "category": card.get("category"), "title": item.get("title"),
                "summary": card.get("summary", ""), "state": card.get("state", ""),
                "notes": str(card.get("notes", ""))[:700], "important": bool(card.get("important")),
                "role": card.get("role", ""), "affiliation": card.get("affiliation", ""),
                "damage": card.get("damage", ""), "quantity": card.get("quantity", ""),
                "assigned_to": assigned_names,
                "given_to_characters": [character_names[value] for value in character_grants if value in character_names],
                "reference_only": bool(card.get("reference_only")),
                "tabletop": card.get("tabletop", {}),
                "character_sheet": {key: card[key] for key in ("character_level", "character_class", "hp_current", "hp_max", "hp_temporary", "armor_class", "initiative", "speed", "proficiency_bonus", "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma") if key in card},
            })
        history = storage.list_ai_messages(user["id"], campaign_id, addressed_only=True, chat_id=chat_id) or []
        if reply_as_type == "character":
            history = [entry for entry in history if not entry.get("audience_user_ids") or (reply_owner_id and reply_owner_id in entry.get("audience_user_ids", []))]
        chat_history = []
        for entry in history[-36:]:
            audience_names = [member["username"] for member in members if member["id"] in entry.get("audience_user_ids", [])]
            chat_history.append({
                "role": "assistant" if entry["role"] == "assistant" else "user",
                "content": ("Audience: " + (", ".join(audience_names) if audience_names else "everyone") + "\n") + (entry["message"][:2500] if entry["role"] == "assistant" else entry["persona_name"] + ": " + entry["message"][:2500]),
            })
        dm_system = """You are the AI Dungeon Master for a private tabletop fantasy campaign. Only messages in this conversation were explicitly addressed to you; never assume unaddressed table talk. Continue the scene vividly, ask for rolls when appropriate, adjudicate consequences fairly, and respect player agency. Keep secrets from players until revealed. Use asterisks only for public scene description; never expose secret thoughts in visible narration. Return one valid JSON object only with this shape:
{"reply":"what the DM says","memory":"compact memory of essential facts, under 1200 characters","story_update":"brief new story development, under 500 characters, only when useful","scene":{},"cards":[],"grants":[]}
Create cards or grant existing records when events establish something players receive or need to track. Use exact character_ids, not usernames. An empty recipient list with share_with_party false means DM-only. Do not create duplicates of existing cards. Respect the Audience label on every message: characters outside a private audience do not know its details, and you must not reveal those details to them unless they later learn them in play. The story_update field must be empty when story mode is fixed. Put reply first in the JSON so players can see it as you write."""
        player_system = """Roleplay only the selected player character named below. Answer in that character's voice, decisions, dialogue, and actions—not as the Dungeon Master. Do not narrate outcomes controlled by the DM and do not use secret information absent from this character's visible history or assigned cards. Write the character's thoughts between single asterisks, for example *I do not trust this stranger.*, and keep dialogue outside the asterisks. Return one valid JSON object only in this exact shape: {"reply":"the character's response","memory":"","story_update":"","cards":[]}."""
        system = dm_system if reply_as_type == "dm" else player_system
        if reply_as_type == "dm":
            system += ai_effects.INSTRUCTIONS
            system += '\nRequired JSON schema (use it for every field and recipient):\n' + json.dumps(ai_effects.schema())
            system += """\nWhen requesting a roll, give the player clear dice instructions in reply: name the character, purpose, exact die and count (D-20 / 1d20 for a check, save, attack, or initiative; the actual damage/healing dice such as 2d6 when established), the ability and skill or saving throw, and Normal / Advantage / Disadvantage with a reason. State the modifier and its breakdown only when the provided character sheet and rules establish it; otherwise ask for the missing bonus, never guess. Include proficiency once, expertise instead of ordinary proficiency, other recorded bonuses, and applicable exhaustion. Advantage/disadvantage rolls two D-20s and keeps the higher/lower, then adds the modifier once; opposing sources cancel and extra sources do not stack. Damage dice do not use advantage. Do not reveal hidden ACs or DCs merely to specify a roll. Ask for an attack before damage, and wait for the player's reported result before deciding the outcome.
The player's Inventory header toggles to a Dice roller in both normal and AI campaigns. In AI campaigns its sheet belongs to the character selected in player tools. For example: 'Elara, roll D-20, select Dexterity (Stealth), Normal roll, and tell me the total.' The panel lists ability checks, skills and saving throws, applies their saved sheet bonus, and supports an Other bonus / penalty field. Do not tell the player to add a sheet bonus again. For weapon/spell attacks or initiative, use D-20 with No stat bonus and enter the verified complete modifier manually. For damage/healing with multiple dice, direct them to Dice & Table Rules using the complete expression, such as 2d6 + 3, or explain how to sum separate rolls and add the modifier once. Rolls are local to the device: you cannot observe them automatically, so explicitly ask the player to report the total (and natural D-20 for attacks or death saves). Never fabricate a result or proceed as if an unreported roll succeeded. For death saves use a D-20 saving throw without an ability/proficiency bonus, applying only relevant special bonuses/penalties; explain the special natural-1/20 rules when needed."""
        system += """\nUse the campaign's ruleset and house rules. The default is revised fifth edition (2024). Never invent a player's dice results or claim to update saved HP, slots, XP or levels: those sheet resources remain manual. Only the DM's structured scene/cards/grants can change campaign records and inventory; a player-character reply cannot. Ask for a roll only when the outcome is uncertain and wait for the result before resolving it. Distinguish ability checks, attack rolls against AC, and saves against DC. Natural 20/1 attack rules do not automatically apply to ability checks. Use movement, one action, an eligible bonus action, and triggered reactions; Extra Attack is part of an Attack action. Distinguish character level, class level and spell level. Respect concentration, components, prepared spells, spell slots, attunement, charges, and feature-specific recovery. In the 2024 rules a turn permits only one spell slot spent to cast spells unless a specific exception applies. Treat reference_only cards as library entries, not possessions, learned spells, or granted features. State which resources the player must update after an adjudicated action. Never reveal secret thoughts in the public reply; asterisks are visible to readers, not private storage. Do not claim to know an unprovided spell or item rule; request its text or defer to the human DM."""
        full_story = str(content.get("ai_story", ""))
        compact_story = full_story if len(full_story) <= 14000 else full_story[:10000] + "\n[Earlier story omitted]\n" + full_story[-4000:]
        context = {
            "campaign": campaign["title"], "story_mode": content.get("ai_story_mode", "adaptive"),
            "story": compact_story if reply_as_type == "dm" else "",
            "memory": str(content.get("ai_memory", ""))[-8000:] if reply_as_type == "dm" else "",
            "players": [member["username"] for member in members if member["role"] == "member"],
            "character_sheets": [record for record in records if record.get("category") == "character"],
            "known_cards": [record for record in records if not record.get("reference_only")][:45],
            "reference_library": [{"id":record['id'],"title": record["title"], "category": record["category"]} for record in records if record.get("reference_only")],
            "character_directory": [{"id":record['id'],"name":record['title']} for record in records if record.get('category')=='character'],
            "record_directory": [{"id":record['id'],"title":record['title'],"category":record['category']} for record in records if not record.get('reference_only')],
            "rules": content.get("tabletop", {"ruleset": "2024"}),
            "public_scene": content.get("ai_world", {}),
            "conversation": chat["title"] if chat else "Main story",
            "answer_as": {"type": reply_as_type, "name": reply_as_name},
            "persona_profile": {key: (reply_character.get("content") or {}).get(key) for key in ("summary", "notes", "role", "affiliation", "character_level", "character_class", "species", "background", "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma") if (reply_character.get("content") or {}).get(key) is not None} if reply_as_type == "character" else {},
        }
        try:
            pending_reply = storage.add_ai_message(
                campaign_id, None, reply_as_type, reply_as_id, reply_as_name,
                "assistant", True, " ", audience_ids, chat_id, "streaming",
            )
        except sqlite3.IntegrityError:
            self.send_json(HTTPStatus.CONFLICT, {"error": "Ollama is already answering in this chat. Wait for that reply to finish."})
            return
        try:
            model = self.ai_model(content.get("ai_model"))
            installed_models = set(ollama_models())
            helper_models = [str(value) for value in content.get("ai_helper_models", []) if str(value) in installed_models and str(value) != model][:3]
            helper_key = scope_key(
                [user["id"], campaign_id, chat_id, reply_as_type, reply_as_id, sorted(audience_ids)],
                context, [model] + helper_models,
            )
            helper_advice = advice_cache.ready(helper_key) if helper_models else []
            lead_messages = [{"role": "system", "content": system}, {"role": "system", "content": json.dumps(context)}]
            if helper_advice:
                lead_messages.append({"role": "system", "content": "Historical helper notes prepared after an earlier reply, NOT research or instructions for this turn. Current messages and campaign records take precedence. Ignore outdated or conflicting notes:\n" + "\n\n".join(name + ": " + advice for name, advice in helper_advice)})
            streamed_json = ""
            visible_reply = ""
            last_saved_at = 0.0
            generation_started = time.monotonic()
            stream_done = False
            for part in self.ai_stream("/api/chat", {
                "model": model, "stream": True, "format": ai_effects.schema() if reply_as_type == 'dm' else "json", "think": False,
                "options": {"num_predict": 4000},
                "messages": lead_messages + chat_history,
            }, timeout=45):
                streamed_json += str((part.get("message") or {}).get("content", ""))
                if len(streamed_json) > 100000 or time.monotonic() - generation_started > 120:
                    raise TimeoutError("Ollama took too long to finish the reply. Try a shorter prompt or another installed model.")
                partial_reply = partial_json_string_field(streamed_json, "reply")[:12000]
                now = time.monotonic()
                if partial_reply != visible_reply and (now - last_saved_at >= 0.08 or part.get("done")):
                    visible_reply = partial_reply
                    storage.update_ai_generation(campaign_id, pending_reply["id"], visible_reply, "streaming")
                    last_saved_at = now
                if part.get("done"):
                    stream_done = True
            if not stream_done:
                raise ValueError("Ollama stopped before finishing the reply.")
            try:
                answer = response_json(streamed_json)
            except (ValueError, json.JSONDecodeError):
                partial_reply = partial_json_string_field(streamed_json, "reply").strip()
                if not partial_reply:
                    raise ValueError("Ollama did not return a readable reply. Try another model.")
                answer = {"reply": partial_reply + '\n\nCampaign update notice: The AI response was incomplete. No scene changes or card grants were applied.', "memory": content.get("ai_memory", ""), "story_update": "", "cards": []}
            reply = str(answer.get("reply", "")).strip()[:12000]
            if not reply:
                raise ValueError("Ollama returned no DM reply.")
            memory_value = answer.get("memory", content.get("ai_memory", ""))
            if isinstance(memory_value, list):
                memory_value = "\n".join("• " + str(value) for value in memory_value)
            changes = {"ai_model": model}
            if reply_as_type == "dm":
                changes["ai_memory"] = str(memory_value)[:30000]
            story_update = str(answer.get("story_update", "")).strip()
            if reply_as_type == "dm" and content.get("ai_story_mode", "adaptive") == "adaptive" and story_update:
                changes["ai_story"] = (full_story + "\n\nDevelopment: " + story_update[:500]).strip()[-50000:]
            storage.update_campaign_ai_state(campaign_id, changes)
            effects = ai_effects.apply(campaign_id, pending_reply['id'], answer, normalize_character_stats, is_dm=reply_as_type == 'dm')
            created_cards = effects['cards']
            if effects['warnings']:
                reply += "\n\nCampaign update notice: " + "; ".join(dict.fromkeys(effects['warnings']))
            storage.update_ai_generation(campaign_id, pending_reply["id"], reply, "complete")
            ai_post = storage.get_ai_message(campaign_id, pending_reply["id"])
            if ai_post and isinstance(ai_post.get("audience_user_ids"), str):
                ai_post["audience_user_ids"] = json.loads(ai_post["audience_user_ids"] or "[]")
            self.send_json(HTTPStatus.CREATED, {"reply": ai_post, "cards": created_cards, "helper_models": [name for name, advice in helper_advice], "ai_replied": True})
            advice_cache.prepare(helper_key, helper_models, context, chat_history, reply, self.ai_request)
        except (OSError, ValueError, TypeError, json.JSONDecodeError, urllib.error.URLError) as error:
            message = "Ollama could not answer: " + str(error)
            storage.update_ai_generation(campaign_id, pending_reply["id"], message, "error")
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": message})
        except Exception:
            logging.exception("Unexpected AI reply failure")
            message = "Ollama could not finish the reply. Check the server window and try again."
            storage.update_ai_generation(campaign_id, pending_reply["id"], message, "error")
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": message})

    def ai_regenerate(self, user: dict, campaign_id: int, data: dict) -> None:
        campaign = storage.campaign_record(user["id"], campaign_id)
        campaign_role = storage.campaign_role(user["id"], campaign_id)
        if not campaign or campaign_role not in ("creator", "member") or not campaign["content"].get("ai_dm"):
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "AI campaign access denied."})
            return
        try:
            message_id = int(data.get("message_id"))
        except (TypeError, ValueError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose an AI reply to regenerate."})
            return
        target = storage.get_ai_message(campaign_id, message_id)
        if not target or target.get("deleted_at"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "That message was not found."})
            return
        if target.get("chat_id") and not storage.campaign_chat(user["id"], campaign_id, int(target["chat_id"])):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "That message was not found."})
            return
        if campaign_role != "creator" and int(target.get("user_id") or 0) != user["id"]:
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "You cannot regenerate that message."})
            return
        guidance = str(data.get("guidance", "")).strip()[:4000]
        history = storage.list_ai_messages(user["id"], campaign_id, addressed_only=True, chat_id=target.get("chat_id")) or []
        prior = [entry for entry in history if entry["id"] < message_id][-24:]
        audience = json.loads(target.get("audience_user_ids") or "[]") if isinstance(target.get("audience_user_ids"), str) else target.get("audience_user_ids", [])
        try:
            model = self.ai_model(campaign["content"].get("ai_model"))
            messages = [{"role": "system", "content": "Rewrite the selected tabletop roleplay message. Answer only as " + target["persona_name"] + ". Return valid JSON only as {\"reply\":\"replacement text\"}. Follow the regeneration guidance and do not add commentary. Preserve private thoughts between single asterisks."}]
            messages.extend({"role": "assistant" if entry["role"] == "assistant" else "user", "content": entry["persona_name"] + ": " + entry["message"][:1500]} for entry in prior)
            messages.append({"role": "user", "content": "Original reply:\n" + target["message"][:3500] + "\n\nRegeneration guidance:\n" + (guidance or "Give a different fitting response while preserving continuity.")})
            result = self.ai_request("/api/chat", {"model": model, "stream": False, "format": "json", "think": False, "options": {"num_predict": 1200}, "messages": messages}, timeout=60)
            generated = str((result.get("message") or {}).get("content", ""))
            try:
                replacement = str(response_json(generated).get("reply", "")).strip()[:12000]
            except (ValueError, json.JSONDecodeError):
                replacement = partial_json_string_field(generated, "reply").strip()[:12000]
            if not replacement:
                raise ValueError("Ollama returned no replacement reply.")
            storage.update_ai_message(campaign_id, message_id, replacement)
            self.send_json(HTTPStatus.OK, {"id": message_id, "message": replacement, "audience_user_ids": audience})
        except (OSError, ValueError, TypeError, json.JSONDecodeError, urllib.error.URLError) as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "Ollama could not regenerate that reply: " + str(error)})

    def import_audio(self) -> None:
        if not self.require_user():
            return
        query = parse_qs(urlparse(self.path).query)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= audio_library.MAX_BYTES:
                raise ValueError('Choose an MP3 up to 100 MB.')
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('The upload was interrupted. Try again.')
            item = audio_library.save(query.get('folder', [''])[0], query.get('name', [''])[0], body)
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {'error': str(error)})
            return
        self.send_json(HTTPStatus.CREATED, item)

    def serve_audio(self) -> None:
        query = parse_qs(urlparse(self.path).query)
        folder = audio_library.folder(query.get('folder', [''])[0])
        name = query.get('name', [''])[0]
        if folder is None or not name or '/' in name or '\\' in name:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        path = folder / name
        if path.is_symlink() or not path.is_file() or path.suffix.lower() != '.mp3':
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        size = path.stat().st_size
        start, end = 0, size - 1
        requested = self.headers.get('Range')
        if requested:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
            if match and any(match.groups()):
                a, b = match.groups()
                start = int(a) if a else max(0, size - int(b))
                end = min(int(b), size - 1) if a and b else size - 1
            else:
                start = size
            if start > end or start >= size:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header('Content-Range', f'bytes */{size}')
                self.end_headers()
                return
        self.send_response(HTTPStatus.PARTIAL_CONTENT if requested else HTTPStatus.OK)
        self.send_header('Content-Type', 'audio/mpeg')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(max(0, end - start + 1)))
        if requested:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        try:
            with path.open('rb') as stream:
                stream.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = stream.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def upload_image(self) -> None:
        user = self.require_user()
        if not user:
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 5_000_000:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose an image smaller than 5 MB."})
            return
        body = self.rfile.read(length)
        formats = (
            (b"\x89PNG\r\n\x1a\n", ".png", "image/png"),
            (b"\xff\xd8\xff", ".jpg", "image/jpeg"),
            (b"GIF87a", ".gif", "image/gif"),
            (b"GIF89a", ".gif", "image/gif"),
            (b"RIFF", ".webp", "image/webp"),
        )
        match = next((value for value in formats if body.startswith(value[0])), None)
        if match and match[1] == ".webp" and (len(body) < 12 or body[8:12] != b"WEBP"):
            match = None
        if not match:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Use a PNG, JPEG, GIF, or WebP image."})
            return
        upload_id = storage.save_upload(user["id"], body, match[1], match[2])
        self.send_json(HTTPStatus.CREATED, {"image_id": upload_id, "url": f"/api/uploads/{upload_id}"})

    def register(self, data: dict) -> None:
        username = str(data.get("username", "")).strip()
        email = str(data.get("email", "")).strip() or None
        password = str(data.get("password", ""))
        if not re.fullmatch(r"[A-Za-z0-9_-]{3,30}", username):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Username must be 3–30 letters, numbers, dashes, or underscores."})
            return
        if email and (len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Enter a valid email."})
            return
        if not 8 <= len(password) <= 200:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Password must be at least 8 characters."})
            return
        try:
            user_id = storage.create_user(username, email, password)
        except sqlite3.IntegrityError:
            self.send_json(HTTPStatus.CONFLICT, {"error": "That username or email is already used."})
            return
        self.start_session(user_id)

    def login(self, data: dict) -> None:
        user_id = storage.authenticate(
            str(data.get("username", "")).strip(), str(data.get("password", ""))
        )
        if user_id is None:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Username or password is incorrect."})
            return
        self.start_session(user_id)

    def start_session(self, user_id: int) -> None:
        token, user = storage.create_session(user_id)
        user["is_host"] = self.is_host_request()
        cookie = f"lan_session={token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000"
        self.send_json(HTTPStatus.OK, {"user": user}, cookie)

    def work_id(self) -> int | None:
        match = re.fullmatch(r"/api/work/(\d+)", urlparse(self.path).path)
        return int(match.group(1)) if match else None

    def do_PUT(self) -> None:
        if not self.safe_origin():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Request origin rejected."})
            return
        user, data = self.require_user(), self.read_json()
        if not user:
            return
        if data is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid request."})
            return
        if urlparse(self.path).path == "/api/account":
            self.update_account(user, data)
            return
        if urlparse(self.path).path == "/api/invite/respond":
            try:
                campaign_id = int(data.get("campaign_id"))
            except (TypeError, ValueError):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid invitation."})
                return
            answered = storage.answer_invite(user["id"], campaign_id, bool(data.get("accept")))
            self.send_json(HTTPStatus.OK if answered else HTTPStatus.NOT_FOUND, {"ok": answered})
            return
        if urlparse(self.path).path == "/api/notifications/read":
            storage.mark_notifications_read(user["id"])
            self.send_json(HTTPStatus.OK, {"ok": True})
            return
        ai_message_match = re.fullmatch(r"/api/campaign/(\d+)/ai/message/(\d+)", urlparse(self.path).path)
        if ai_message_match:
            campaign_id, message_id = map(int, ai_message_match.groups())
            existing = storage.get_ai_message(campaign_id, message_id)
            role = storage.campaign_role(user["id"], campaign_id)
            if not existing or role not in ("creator", "member"):
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Message not found."})
                return
            if existing.get("chat_id") and not storage.campaign_chat(user["id"], campaign_id, int(existing["chat_id"])):
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Message not found."})
                return
            if data.get("action") == "restore":
                if int(existing.get("deleted_by") or 0) != user["id"]:
                    self.send_json(HTTPStatus.FORBIDDEN, {"error": "Only the person who deleted this message can undo it."})
                    return
                restored = storage.restore_ai_message(campaign_id, message_id, user["id"])
                self.send_json(HTTPStatus.OK if restored else HTTPStatus.CONFLICT, {"ok": restored, "error": None if restored else "A new message has already been posted, so this deletion can no longer be undone."})
                return
            if existing.get("deleted_at"):
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Message not found."})
                return
            if role != "creator" and int(existing.get("user_id") or 0) != user["id"]:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "You cannot edit that message."})
                return
            message = str(data.get("message", "")).strip()
            if not message or len(message) > 12000:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Write a message up to 12,000 characters."})
                return
            saved = storage.update_ai_message(campaign_id, message_id, message)
            self.send_json(HTTPStatus.OK if saved else HTTPStatus.NOT_FOUND, {"ok": saved})
            return
        if re.fullmatch(r'/api/campaign/\d+/maps/\d+(?:/(activate|visit|summon|rename|position|take|meet|trade|open))?',urlparse(self.path).path):
            self.map_request('PUT',urlparse(self.path).path,data,user); return
        position_match = re.fullmatch(r"/api/campaign/(\d+)/position", urlparse(self.path).path)
        if position_match:
            try:
                campaign_id = int(position_match.group(1)); target_id = int(data.get("user_id") or user["id"])
                x, y, z = float(data.get("x")), float(data.get("y", 0)), float(data.get("z"))
                motion = str(data.get("motion", "idle"))
                if (not math.isfinite(x) or not math.isfinite(y) or not math.isfinite(z)
                        or abs(x) > 50 or abs(y) > 100 or abs(z) > 50
                        or motion not in ("idle", "walk", "swim", "climb", "fall")):
                    raise ValueError
            except (TypeError, ValueError):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid map position."}); return
            moved = storage.move_campaign_player(user["id"], campaign_id, target_id, x, y, z, motion)
            self.send_json(HTTPStatus.OK if moved else HTTPStatus.FORBIDDEN, {"ok": moved}); return
        note_match = re.fullmatch(r"/api/notes/(\d+)", urlparse(self.path).path)
        if note_match:
            note = str(data.get("note", ""))
            if len(note) > 50_000:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Personal notes are too long."})
                return
            saved = storage.save_personal_note(user["id"], int(note_match.group(1)), note)
            self.send_json(HTTPStatus.OK if saved else HTTPStatus.NOT_FOUND, {"ok": saved})
            return
        item_id = self.work_id()
        if item_id is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid request."})
            return
        title = str(data.get("title", "")).strip()
        if not title or len(title) > 120:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Title must be 1–120 characters."})
            return
        content = data.get("content", {})
        if not isinstance(content, dict):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid campaign record."})
            return
        normalize_character_stats(content)
        try:
            from map_part_catalog import validate
            validate(content)
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        try:
            campaign_id = int(content.get("campaign_id"))
        except (TypeError, ValueError):
            campaign_id = 0
        if campaign_id and storage.has_campaign_access(user["id"], campaign_id):
            valid_members = {member["id"] for member in storage.campaign_members(campaign_id) if member["role"] == "member"}
            requested_assignments = content.get("assigned_user_ids", []) if isinstance(content.get("assigned_user_ids", []), list) else []
            content["assigned_user_ids"] = [int(value) for value in requested_assignments if str(value).isdigit() and int(value) in valid_members]
            if content.get("category") == "chat":
                requested_characters = content.get("participant_ids", []) if isinstance(content.get("participant_ids", []), list) else []
                participants = []
                for value in requested_characters:
                    if not str(value).isdigit():
                        continue
                    character = storage.campaign_character(campaign_id, int(value))
                    if not character:
                        continue
                    participants.append(character["id"])
                    owner_id = int(character["content"].get("owner_user_id") or 0)
                    if owner_id in valid_members and owner_id not in content["assigned_user_ids"]:
                        content["assigned_user_ids"].append(owner_id)
                content["participant_ids"] = participants
        saved = storage.update_work(user["id"], item_id, title, content)
        self.send_json(HTTPStatus.OK if saved else HTTPStatus.NOT_FOUND, {"ok": saved})

    def update_account(self, user: dict, data: dict) -> None:
        username = str(data.get("username", "")).strip()
        email = str(data.get("email", "")).strip() or None
        translation_enabled = data.get("translation_enabled", bool(user.get("translation_enabled", False)))
        if type(translation_enabled) is not bool:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Choose whether browser translation is enabled."})
            return
        ui_language = data.get('ui_language', user.get('ui_language', 'auto'))
        if ui_language not in ('auto','en','fr'):
            self.send_json(HTTPStatus.BAD_REQUEST, {'error':'Choose a supported interface language.'})
            return
        current_password = str(data.get("current_password", ""))
        new_password = str(data.get("new_password", ""))
        confirm_password = str(data.get("confirm_password", ""))
        try:
            avatar_id = int(data.get("avatar_id") or 0) or None
        except (TypeError, ValueError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The selected profile image is invalid."})
            return
        if not re.fullmatch(r"[A-Za-z0-9_-]{3,30}", username):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Username must be 3–30 letters, numbers, dashes, or underscores."})
            return
        if email and (len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Enter a valid email."})
            return
        if not current_password:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Enter your current password to confirm changes."})
            return
        if new_password and not 8 <= len(new_password) <= 200:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The new password must be at least 8 characters."})
            return
        if new_password != confirm_password:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "The new passwords do not match."})
            return
        if avatar_id and not storage.get_upload(user["id"], avatar_id):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "That profile image is unavailable."})
            return
        try:
            updated = storage.update_account(
                user["id"], current_password, username, email, new_password or None, avatar_id, translation_enabled, ui_language
            )
        except sqlite3.IntegrityError:
            self.send_json(HTTPStatus.CONFLICT, {"error": "That username or email is already used."})
            return
        if updated is None:
            self.send_json(HTTPStatus.UNAUTHORIZED, {"error": "Your current password is incorrect."})
            return
        self.send_json(HTTPStatus.OK, {"user": updated})

    def do_DELETE(self) -> None:
        if not self.safe_origin():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "Request origin rejected."})
            return
        user = self.require_user()
        if not user:
            return
        host_campaign = re.fullmatch(r"/api/host/campaign/(\d+)", urlparse(self.path).path)
        if host_campaign:
            if not self.is_host_request():
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "Only the server computer can delete campaigns."})
                return
            deleted = storage.delete_campaign_as_host(int(host_campaign.group(1)))
            self.send_json(HTTPStatus.OK if deleted else HTTPStatus.NOT_FOUND, {"ok": deleted})
            return
        ai_message_match = re.fullmatch(r"/api/campaign/(\d+)/ai/message/(\d+)", urlparse(self.path).path)
        if ai_message_match:
            campaign_id, message_id = map(int, ai_message_match.groups())
            existing = storage.get_ai_message(campaign_id, message_id)
            role = storage.campaign_role(user["id"], campaign_id)
            if not existing or role not in ("creator", "member"):
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Message not found."})
                return
            if existing.get("chat_id") and not storage.campaign_chat(user["id"], campaign_id, int(existing["chat_id"])):
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Message not found."})
                return
            if role != "creator" and int(existing.get("user_id") or 0) != user["id"]:
                self.send_json(HTTPStatus.FORBIDDEN, {"error": "You cannot delete that message."})
                return
            guard_id = storage.delete_ai_message(campaign_id, message_id, user["id"])
            self.send_json(HTTPStatus.OK if guard_id is not None else HTTPStatus.NOT_FOUND, {"ok": guard_id is not None, "guard_id": guard_id})
            return
        item_id = self.work_id()
        if item_id is None:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid request."})
            return
        deleted = storage.delete_work(user["id"], item_id)
        self.send_json(HTTPStatus.OK if deleted else HTTPStatus.NOT_FOUND, {"ok": deleted})


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve this site over HTTPS on your LAN")
    parser.add_argument("--port", type=int, default=8443)
    args = parser.parse_args()
    storage.initialize()
    lan_ip = best_lan_ip()
    cert_path, key_path = ensure_certificate(lan_ip)

    try:
        server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE and getattr(exc, "winerror", None) != 10048:
            raise
        print(f"\nPort {args.port} is already in use. Another copy of the site may be running.")
        print(f"Try opening https://localhost:{args.port} in your browser.")
        print("To restart the site, stop the existing server first, then launch again.")
        raise SystemExit(2) from None
    server.lan_ip = lan_ip
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=cert_path, keyfile=key_path)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print("\n  LAN HTTPS site is running")
    print(f"  This computer: https://localhost:{args.port}")
    print(f"  Other devices: https://{lan_ip}:{args.port}")
    print(f"  Database: {storage.DB_PATH}")
    print("\n  Keep this window open. Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
