"""Bounded, best-effort continuity notes prepared after a completed reply."""
import hashlib
import json
import threading
import time
from collections import OrderedDict


def scope_key(scope, context, models):
    # Story and memory advance each turn; all visibility/card/profile changes
    # invalidate notes. Caller also supplies account, audience and persona IDs.
    stable = {k: v for k, v in context.items() if k not in ("story", "memory")}
    return hashlib.sha256(json.dumps([scope, stable, models], sort_keys=True).encode()).hexdigest()


class HelperAdvice:
    def __init__(self):
        self.lock = threading.Lock()
        self.busy = False
        self.cache = OrderedDict()
        self.rotation = 0

    def ready(self, key):
        with self.lock:
            entry = self.cache.get(key)
            if entry and time.monotonic() - entry[0] < 300:
                return [(entry[1], entry[2])]
            self.cache.pop(key, None)
            return []

    def prepare(self, key, models, context, history, reply, request, instruction=None):
        if not models:
            return
        with self.lock:
            if self.busy:
                return  # Never accumulate a queue behind the local GPU.
            self.busy = True
            model = models[self.rotation % len(models)]
            self.rotation += 1

        def work():
            try:
                result = request("/api/chat", {
                    "model": model, "stream": False, "format": "json", "think": False,
                    "options": {"num_predict": 180},
                    "messages": [
                        {"role": "system", "content": instruction or 'Prepare continuity notes for a FUTURE turn of this private campaign. Flag established facts, character knowledge, secrets and unresolved consequences. Do not predict new events or write a roleplay reply. Return JSON only: {"advice":"brief notes"}.'},
                        {"role": "user", "content": json.dumps({
                            "campaign_context": context,
                            "recent_addressed_messages": history[-8:],
                            "completed_reply": reply,
                        })},
                    ],
                }, timeout=20)
                answer = json.loads((result.get("message") or {}).get("content", ""))
                advice = answer.get("advice") if isinstance(answer, dict) else None
                if isinstance(advice, str) and advice.strip():
                    with self.lock:
                        self.cache[key] = (time.monotonic(), model, advice.strip()[:2000])
                        self.cache.move_to_end(key)
                        while len(self.cache) > 64:
                            self.cache.popitem(last=False)
            except Exception:
                # Optional notes must never fail a completed player reply.
                pass
            finally:
                with self.lock:
                    self.busy = False

        try:
            threading.Thread(target=work, name="campaign-helper", daemon=True).start()
        except Exception:
            with self.lock:
                self.busy = False


advice_cache = HelperAdvice()
