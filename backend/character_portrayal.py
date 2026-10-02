"""Generate structured portrayal data and present it as an editable character profile.

See [README: character creation flow](../README.md#character-creation-flow)."""
import re


INSTRUCTIONS = '''
Write core (or content.portrayal for a D&D sheet) as a structured object:
visual_description, personality, and behavior_examples (exactly five objects, each with action and speech).
Visual description: concrete build, posture, face, hair, clothing and distinctive possessions;
preserve established appearance. Personality: connected prose covering temperament, the difference
between public and private behavior, motives, values, fears, strengths, flaws, likes, dislikes and
distinctive speech. Fit this particular person; do not impose an anime archetype, trauma or secret.
The five roleplay examples must show different situations and facets of this personality, with a
specific visible action and a line of their own dialogue in each. Include contrasting reactions,
not five restatements of their job or the same gesture. Write every example's action from the
character's FIRST-PERSON viewpoint: I, I'm, my, me, mine, myself, and when appropriate
we, us, our, ours, ourselves (or equivalents in the requested language). These are examples,
not a restricted vocabulary. Use plural forms for a genuinely shared group, possession or experience;
do not invent shared ownership, relationships or agreement, or decide another participant's actions.
For example: "I'm crouched beside the fountain, shielding my sketchbook from the rain."
Never narrate the character as "Elara is", "she is" or "he is" in these actions. Keep all subsequent
self-references in first person too; surroundings may still be described naturally in third person.
Speech is the character's own direct dialogue. Visual description and personality may remain in
third person; the site uses the actual character name in section headings, never template tokens.
Examples are hypothetical demonstrations, not shared memories or established
events. Do not control another participant. Action and speech fields contain plain prose without
headings, numbering, surrounding asterisks or quotation marks; the site formats those consistently.
Do not copy any reference character or example. Preserve explicit user choices and existing facts.
'''


def schema():
    """Describe structured appearance, personality and five first-person action/dialogue examples for generation.

    See [README: character creation flow](../README.md#character-creation-flow)."""
    text = lambda limit: {'type':'string', 'minLength':1, 'maxLength':limit}
    example = {'type':'object', 'properties':{'action':text(450), 'speech':text(450)},
               'required':['action','speech'], 'additionalProperties':False}
    example['properties']['action']['description'] = (
        'Visible action narrated by the character in FIRST PERSON: I, my, me, I am or I’m; '
        'we, us, our, ours and ourselves are natural for established shared context, without '
        'inventing shared possessions or controlling other participants '
        '(equivalent first-person forms in other languages). Keep this viewpoint throughout. '
        'Do not describe the character as their name, he, she or they.')
    example['properties']['speech']['description'] = (
        'Only the words the character actually says aloud. Put gestures and narration such as '
        'I mutter or I adjust my jacket in action, not speech. No enclosing quotation marks.')
    return {'type':'object', 'properties':{'visual_description':text(2200),
        'personality':text(3600), 'behavior_examples':{'type':'array', 'minItems':5,
        'maxItems':5, 'items':example}},
        'required':['visual_description','personality','behavior_examples'], 'additionalProperties':False}


def prose(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError('Incomplete character portrayal')
    if value.lstrip().startswith(('{', '[', '#')) or '{{' in value or '}}' in value:
        raise ValueError('Character portrayal contains a template instead of prose')
    return value.strip()


def render(profile, name):
    """Validate structured portrayal and format named Markdown sections; reject incomplete or template-like profiles.

    See [README: character creation flow](../README.md#character-creation-flow)."""
    if not isinstance(profile, dict) or not isinstance(name, str) or not name.strip():
        raise ValueError('Missing structured character portrayal')
    name = ' '.join(name.split())[:120]
    appearance = prose(profile.get('visual_description'), 2200)
    personality = prose(profile.get('personality'), 3600)
    examples = profile.get('behavior_examples')
    if not isinstance(examples, list) or len(examples) != 5:
        raise ValueError('Character portrayal needs five roleplay examples')
    lines = []
    for index, example in enumerate(examples, 1):
        if not isinstance(example, dict):
            raise ValueError('Incomplete roleplay example')
        action = ' '.join(prose(example.get('action'), 450).split()).strip('*# ')
        speech = ' '.join(prose(example.get('speech'), 450).split()).strip('"“” ')
        if not action or not speech:
            raise ValueError('Each example needs an action and dialogue')
        subjects = '|'.join(re.escape(part) for part in (name, name.split()[0], 'he', 'she', 'they', 'il', 'elle', 'ils', 'elles'))
        if re.match(r'^(?:' + subjects + r')\b', action, re.I):
            raise ValueError('Roleplay example actions must use the character’s first-person viewpoint')
        lines.append(f'{index}. *{action}* "{speech}"')
    if len(set(lines[i].split('. ', 1)[1].casefold() for i in range(5))) != 5:
        raise ValueError('Roleplay examples must be distinct')
    return (f'# {name} Visual Description:\n{appearance}\n\n'
            f'# {name} Personality:\n{personality}\n\n'
            f'# {name} Roleplay Behavior Examples:\n' + '\n'.join(lines))


def for_chat(text):
    """Translate profile-example actions to the site's action markup for model context only.

    See [README: chat response flow](../README.md#chat-response-flow)."""
    sections = re.split(r'(?m)(^# [^\n]+ Roleplay Behavior Examples:\s*\n)', text, maxsplit=1)
    if len(sections) == 3:
        sections[2] = re.sub(r'(?m)^(\d+\. )\*([^*\n]+)\*(?=\s|$)', r'\1#\2#', sections[2])
    return ''.join(sections)
