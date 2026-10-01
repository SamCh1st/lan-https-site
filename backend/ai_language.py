"""Language guidance scoped to one AI request; machine-readable fields stay stable."""
import re

def preferred_language(value):
    candidates=[]
    for index,part in enumerate(str(value or '')[:512].split(',')):
        pieces=part.strip().split(';')
        tag=pieces[0].strip()
        if not re.fullmatch(r'[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}',tag):
            continue
        quality=1.0
        for parameter in pieces[1:]:
            if parameter.strip().startswith('q='):
                try: quality=float(parameter.strip()[2:])
                except ValueError: quality=0
        if 0 < quality <= 1:
            candidates.append((quality,-index,tag))
    return max(candidates)[2] if candidates else 'en'

def localized_payload(payload, language):
    if not payload or not isinstance(payload.get('messages'),list):
        return payload
    tag=preferred_language(language)
    instruction=(
        f'The requesting player prefers language {tag}. Understand requests in any language '
        'you support; do not require English. '
        'The human text may be inside a request, prompt, concept or message JSON field; '
        'ignore surrounding field names when identifying its language. Write player-facing '
        'narration, explanations, descriptions and newly generated prose in the language of the latest human request. '
        f'If that request has no clear language, use {tag}. An explicit request for a particular '
        'response language takes priority. Follow this even when instructions, history or reference '
        'material use English. Preserve proper names unless asked to translate them. '
        'Keep all JSON keys, IDs, code, units, schema enum values, internal category names, '
        'canonical class names and symbol identifiers exactly as required by the schema. '
        'Translate prose values only, never the data contract. Do not add prose outside required JSON.'
    )
    # Some installed chat templates (including llama3.2) only render the initial
    # system block. Later system turns can lose reminders and even omit the final
    # assistant header. Preserve every instruction in one initial block instead.
    systems=[str(message.get('content','')) for message in payload['messages'] if message.get('role')=='system']
    turns=[dict(message) for message in payload['messages'] if message.get('role')!='system']
    # Copy instead of mutating: helpers and retries may reuse the original payload.
    return {**payload,'messages':[{'role':'system','content':'\n\n'.join([instruction,*systems])},*turns]}
