import _bootstrap  # Shared backend import path for tests and previews.
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import spell_designer as D
import spell_reader as R
import server


def plan(concept=False):
    steps = [dict(action="add", id="s1", type="openRing", x=0, y=0, w=600, h=600, rotation=0, explanation='Open the {ring}; preserve "a gap".'),
             dict(action="add", id="s2", type="light", x=0, y=0, w=60, h=60, rotation=0, explanation="Light.")]
    if concept:
        steps.append(dict(action="add", id="s3", type="concept", x=0, y=-180, w=50, h=50, rotation=0, label="Contact trigger", meaning="Proposed: activates on contact.", explanation="A proposed trigger."))
    steps.append(dict(action="close", id="s1", explanation="Close the circle."))
    return dict(steps=steps, name="Test design", description="A useful draft", canon="Light", inference="Proposed trigger", matches_request="supported", limitations=[])


class DesignerTests(unittest.TestCase):
    def test_detailed_seal_has_nested_boundaries_and_individual_symbols(self):
        for kinds, expected in [(["expansion", "convergence", "regions"], 52), (["expansion", "convergence", "regions", "stability"], 77)]:
            step = dict(action="seal", core="repetition", bands=[dict(type=t) for t in kinds])
            nodes = []
            for operation in D.expand_step(step):
                D.apply_step(operation, nodes)
            self.assertEqual(len(nodes), expected)
            self.assertEqual(len({n["id"] for n in nodes}), expected)
            self.assertFalse(any(n["type"] == "openRing" for n in nodes))
            self.assertEqual(R.geometry(nodes)["structural_issues"], [])
        blueprint = {**plan(), "steps": [step]}
        def model(path, payload, timeout):
            self.assertIsInstance(payload["format"], dict)
            self.assertNotIn('Each step is either:', payload["messages"][0]["content"])
            yield {"message": {"content": json.dumps(blueprint)}, "done": True}
        with patch.object(R, "references", return_value=("Reference", "cached")):
            events = list(D.design("Detailed spell", "test", model, detail="detailed"))
        self.assertEqual(len(events[-1]["nodes"]), 77)
        self.assertEqual(events[-1]["summary"]["matches_request"], "conceptual")

    def test_radial_operation_expands_into_individually_editable_signs(self):
        band = dict(action="radial", id="sband", type="regions", radius=230,
                    count=12, w=25, h=30, rotation_offset=180)
        steps = list(D.expand_step(band))
        self.assertEqual(len(steps), 12)
        self.assertEqual((steps[0]["x"], steps[0]["y"]), (0, -230))
        self.assertEqual((steps[3]["x"], steps[3]["y"]), (230, 0))
        self.assertEqual(steps[3]["rotation"], 270)
        nodes = []
        D.apply_step(plan()["steps"][0], nodes)
        for step in steps:
            D.apply_step(step, nodes)
        D.apply_step(plan()["steps"][-1], nodes)
        self.assertEqual(R.geometry(nodes)["structural_issues"], [])
        self.assertEqual(len({n["id"] for n in nodes}), 13)
        for bad in ({"count": 99}, {"radius": float("nan")}, {"type": "concept"}, {"count": True}):
            with self.assertRaises(ValueError):
                list(D.expand_step({**band, **bad}))
        blueprint = plan()
        blueprint["steps"].insert(-1, band)
        def model(*args, **kwargs):
            yield {"message": {"content": json.dumps(blueprint)}, "done": True}
        with patch.object(R, "references", return_value=("Evidence", "cached")):
            events = list(D.design("A ring of signs", "test", model))
        self.assertEqual(sum(e["event"] == "step" for e in events), 15)
        self.assertEqual(len(events[-1]["nodes"]), 14)

    def test_missing_layout_uses_editor_defaults_but_invalid_values_fail(self):
        event = D.apply_step(dict(action="add", id="stest", type="water"), [])
        self.assertEqual((event["node"]["x"], event["node"]["w"]), (0, 60))
        with self.assertRaises(ValueError):
            D.apply_step(dict(action="add", id="stest", type="water", w=None), [])

    def test_parser_every_character_boundary_and_quoted_braces(self):
        expected = plan(True)
        parser = D.StepParser()
        steps = []
        for char in json.dumps(expected):
            steps += parser.feed(char)
        self.assertEqual(steps, expected["steps"])
        self.assertEqual(parser.final(), expected)

    def test_partial_and_oversize_stream_are_not_accepted(self):
        p = D.StepParser()
        self.assertEqual(p.feed('{"steps":[{"action":"add"'), [])
        with self.assertRaises(ValueError):
            p.final()
        with self.assertRaises(ValueError):
            D.StepParser().feed("x" * 80001)

    def test_operations_preserve_proposal_and_reject_untrusted_types(self):
        nodes = []
        for s in plan(True)["steps"]:
            D.apply_step(s, nodes)
        self.assertEqual(nodes[0]["type"], "ring")
        self.assertEqual(nodes[-1]["label"], "Contact trigger")
        self.assertEqual(nodes[-1]["meaning"], "Proposed: activates on contact.")
        for step in [dict(action="close", id="missing"), {**plan()["steps"][0], "x": float("nan")}, plan()["steps"][1]]:
            with self.assertRaises(ValueError):
                D.apply_step(step, nodes)

    def test_invented_model_symbol_becomes_an_explicit_proposal(self):
        n = {**plan()["steps"][1], "type": "blindness", "explanation": "Permanent loss of sight."}
        event = D.apply_step(n, [])
        self.assertEqual(event["node"]["type"], "concept")
        self.assertEqual(event["node"]["label"], "blindness")
        self.assertEqual(event["node"]["meaning"], "Permanent loss of sight.")
        generic = {**plan()["steps"][1], "type": "sigil", "symbol": "Light"}
        self.assertEqual(D.apply_step(generic, [])["node"]["type"], "light")

    def test_generated_parts_are_spaced_inside_the_ring(self):
        nodes = []
        D.apply_step(plan()["steps"][0], nodes)
        D.apply_step(plan()["steps"][1], nodes)
        collided = {**plan()["steps"][1], "id": "s3", "type": "concealment"}
        event = D.apply_step(collided, nodes)
        self.assertNotEqual((event["node"]["x"], event["node"]["y"]), (0, 0))
        D.apply_step({**collided, "id": "s4", "x": 280, "y": 280}, nodes)
        D.apply_step(plan()["steps"][-1], nodes)
        self.assertEqual(R.geometry(nodes)["structural_issues"], [])

    def test_first_step_emits_before_the_model_finishes(self):
        finished = []
        text = json.dumps(plan(True))
        boundary = text.index('}, {') + 1
        def model(*args, **kwargs):
            yield {"message": {"content": text[:boundary]}}
            finished.append(True)
            yield {"message": {"content": text[boundary:]}, "done": True}
        with patch.object(R, "references", return_value=("research", "QA references")):
            stream = D.design("a fictional spell", "QA", model)
            self.assertEqual(next(stream)["event"], "status")
            self.assertEqual(next(stream)["event"], "status")
            self.assertEqual(next(stream)["event"], "step")
            self.assertEqual(finished, [])
            rest = list(stream)
        self.assertEqual(rest[-1]["event"], "done")
        self.assertEqual(rest[-1]["summary"]["matches_request"], "conceptual")
        self.assertEqual(rest[-1]["nodes"][0]["type"], "ring")

    def test_closing_stream_releases_model_and_busy_slot(self):
        closed = []
        def model(*args, **kwargs):
            try:
                yield {"message": {"content": '{"steps":[' + json.dumps(plan()["steps"][0])}}
                yield {"message": {"content": "never consumed"}}
            finally:
                closed.append(True)
        with patch.object(R, "references", return_value=("research", "QA")):
            stream = D.design("a spell", "QA", model)
            next(stream); next(stream); next(stream)
            stream.close()
        self.assertEqual(closed, [True])
        self.assertTrue(R._busy.acquire(blocking=False))
        R._busy.release()

    def test_endpoint_checks_access_and_flushes_each_event(self):
        handler = object.__new__(server.Handler)
        responses = []
        handler.send_json = lambda status, data: responses.append(status)
        with patch.object(server.storage, "campaign_record", return_value=None):
            handler.design_spell({"id": 2}, 1, {"prompt": "a spell"})
        self.assertEqual(responses, [403])
        handler.ai_model = lambda model: "QA"
        handler.send_response = lambda status: None
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        handler.wfile = io.BytesIO()
        with patch.object(server.storage, "campaign_record", return_value={"content": {}}), patch.object(server.storage, "campaign_role", return_value="member"), patch.object(D, "design", return_value=iter(())):
            handler.design_spell({"id": 2}, 1, {"prompt": ""})
        self.assertEqual(responses[-1], 400)
        class Sink(io.BytesIO):
            flushes = 0
            def flush(self):
                self.flushes += 1
        handler.wfile = Sink()
        def events(*args, **kwargs):
            yield {"event": "status", "message": "Starting"}
            yield {"event": "step", "node": {"id": "s1"}}
        with patch.object(server.storage, "campaign_record", return_value={"content": {}}), patch.object(server.storage, "campaign_role", return_value="member"), patch.object(D, "design", events):
            handler.design_spell({"id": 2}, 1, {"prompt": "a spell"})
        self.assertEqual(handler.wfile.flushes, 2)
        self.assertEqual(len(handler.wfile.getvalue().splitlines()), 2)

    def test_concepts_are_not_certified_by_reader(self):
        nodes = []
        for step in plan(True)["steps"]:
            D.apply_step(step, nodes)
        result = R.clean_result({"name": "Blindness", "description": "A proposal", "functional": True, "effects": []}, R.geometry(nodes))
        self.assertIsNone(result["functional"])
        self.assertFalse(result["effects"])


if __name__ == "__main__":
    unittest.main()
