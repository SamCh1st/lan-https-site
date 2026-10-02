import _bootstrap
import unittest
from portrayal_fixtures import portrayal
import character_portrayal
from record_identity import generated_name


class PortrayalTests(unittest.TestCase):
    def test_named_sections_and_five_examples_are_rendered_consistently(self):
        text = character_portrayal.render(portrayal(), 'Eira Karlsson')
        for heading in ('Visual Description', 'Personality', 'Roleplay Behavior Examples'):
            self.assertIn('# Eira Karlsson ' + heading + ':\n', text)
        self.assertEqual(sum(line[:1].isdigit() for line in text.splitlines()), 5)
        self.assertIn('1. *I set a cup beside the visitor.* "You look cold. Sit here."', text)
        self.assertNotIn('{{', text)

    def test_incomplete_copied_or_unstructured_profiles_are_rejected(self):
        base = portrayal()
        for value in ('A generic run-on paragraph.', {},
                      dict(base, behavior_examples=base['behavior_examples'][:4]),
                      dict(base, behavior_examples=[base['behavior_examples'][0]] * 5),
                      dict(base, visual_description='{{char}} is tall.')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                character_portrayal.render(value, 'Eira')

    def test_profile_examples_become_actions_in_chat_without_changing_saved_profile(self):
        saved = character_portrayal.render(portrayal(), 'Eira')
        context = character_portrayal.for_chat(saved)
        self.assertIn('1. #I set a cup beside the visitor.# "You look cold. Sit here."', context)
        self.assertIn('1. *I set a cup beside the visitor.*', saved)
        self.assertEqual(character_portrayal.for_chat('She is calm. *A private thought.*'),
                         'She is calm. *A private thought.*')

    def test_third_person_example_requires_regeneration_not_pronoun_replacement(self):
        for action in ('Eira Karlsson is sketching.', 'Eira adjusts her tablet.', 'She shields her sketchbook.'):
            profile = portrayal()
            profile['behavior_examples'][0]['action'] = action
            with self.assertRaisesRegex(ValueError, 'first-person'):
                character_portrayal.render(profile, 'Eira Karlsson')
        profile = portrayal()
        profile['behavior_examples'][0]['action'] = "I'm crouched by the fountain. Rain is falling, and I'm shielding my sketchbook."
        text = character_portrayal.render(profile, 'Eira Karlsson')
        self.assertIn('*I\'m crouched', text)
        self.assertIn('"You look cold. Sit here."', text)

    def test_model_field_labels_do_not_become_character_names(self):
        for value in ('Character Reference: Silas Blackwood', '**Character Name: Silas Blackwood**',
                      'Name: Silas Blackwood', 'Silas Blackwood'):
            self.assertEqual(generated_name(value), 'Silas Blackwood')
        self.assertEqual(generated_name('Dr. Rowan Vale'), 'Dr. Rowan Vale')
        for value in ('Character Reference:', '{{char}}', 'Mira\nPersonality: quiet', 'Personality: patient'):
            with self.assertRaises(ValueError): generated_name(value)

    def test_shared_first_person_language_is_preserved(self):
        for action in ('I unfold our map on the table.', 'Our map is damp, so I spread it near the fire.',
                       'We have a shared notebook; I add my sketch beside our earlier notes.',
                       'I leave enough room for us to write our names.'):
            profile = portrayal()
            profile['behavior_examples'][0]['action'] = action
            text = character_portrayal.render(profile, 'Eira')
            self.assertIn('1. *' + action + '*', text)
            self.assertIn('1. #' + action + '#', character_portrayal.for_chat(text))


if __name__ == '__main__': unittest.main()
