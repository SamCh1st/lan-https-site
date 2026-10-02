"""Bounded recovery for a reply stream, before any campaign effects are applied.

See [README: chat response flow](../README.md#chat-response-flow)."""
import time
import chat_format


def history_role(entry, persona_type, persona_id=None):
    """Only the selected persona's own generated turns are assistant examples.

    See [README: chat response flow](../README.md#chat-response-flow)."""
    same_persona = entry.get('persona_type') == persona_type
    if persona_type == 'character':
        same_persona = same_persona and str(entry.get('persona_id')) == str(persona_id)
    return 'assistant' if same_persona and entry.get('role') == 'assistant' else 'user'


def speaker_instructions(name, persona_type='character'):
    if persona_type != 'character':
        return ''
    return ('\nCURRENT SPEAKER: ' + name + '. Write only this person’s next turn. '
        'Other named speakers in history are other participants, even when their text was AI-generated. '
        'Respond to their meaning; do not repeat their dialogue as your own or inherit their gestures, '
        'possessions, gender, memories or first-person identity. Narrate only your own actions and thoughts. '
        'Do not invent prior conversations or things you previously told someone to fill out the reply. '
        'Other people’s written inner thoughts are not audible information your character can answer. '
        'Advance one conversational beat without scripting the other participant’s response.\n')


class StreamInterrupted(ValueError):
    pass


def character_reply_schema():
    """Characters only produce prose; they cannot apply DM effects."""
    return {'type':'object','properties':{'reply':chat_format.reply_value_schema()},
            'required':['reply'],'additionalProperties':False}


def stream_reply(stream, payload, progress, read_reply, budget=180):
    """Stream a reply with bounded recovery, reporting progress before campaign effects are applied.

    See [README: chat response flow](../README.md#chat-response-flow)."""
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
