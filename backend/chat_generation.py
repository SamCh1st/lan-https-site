"""Bounded recovery for a reply stream, before any campaign effects are applied."""
import time
import chat_format


class StreamInterrupted(ValueError):
    pass


def character_reply_schema():
    """Characters only produce prose; they cannot apply DM effects."""
    return {'type':'object','properties':{'reply':chat_format.reply_value_schema()},
            'required':['reply'],'additionalProperties':False}


def stream_reply(stream, payload, progress, read_reply, budget=180):
    started = time.monotonic()
    last_partial = ''
    for attempt in range(2):
        raw = ''
        visible = ''
        saved_at = 0
        parts = None
        try:
            parts = stream('/api/chat', payload, timeout=45)
            for part in parts:
                if part.get('error'):
                    raise StreamInterrupted('Ollama reported: ' + str(part['error'])[:500])
                raw += str((part.get('message') or {}).get('content', ''))
                now = time.monotonic()
                if len(raw) > 100000 or now - started > budget:
                    raise TimeoutError('Ollama took too long to finish the reply. Try again or choose another installed model.')
                partial = read_reply(raw, 'reply')[:12000]
                if partial:last_partial = partial
                if partial != visible and (now - saved_at >= .2 or part.get('done')):
                    visible = partial
                    progress(partial)
                    saved_at = now
                if part.get('done'):
                    return raw
            raise StreamInterrupted('Ollama disconnected before finishing the reply.')
        except (StreamInterrupted, OSError):
            if attempt or time.monotonic() - started >= budget:
                if last_partial:progress(last_partial)
                raise
            # Replace the same pending message; never append a second reply or replay effects.
            progress('')
        finally:
            if parts is not None and hasattr(parts, 'close'):
                parts.close()
