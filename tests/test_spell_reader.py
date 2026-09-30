import _bootstrap  # Shared backend import path for tests and previews.
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import spell_reader as R
import server


def drawing():
    return [dict(id="sring", type="ring", x=0, y=0, w=320, h=320, rotation=0),
            dict(id="sfire", type="fire", x=0, y=0, w=60, h=60, rotation=0),
            dict(id="sfloat", type="levitation", x=0, y=-110, w=40, h=40, rotation=180)]


class SpellReaderTests(unittest.TestCase):
    def test_reading_without_effects_keeps_the_interpretation(self):
        result = R.clean_result({"name": "Complex seal", "description": "An interpreted combination.", "functional": True, "effects": []}, R.geometry(drawing()))
        self.assertTrue(result["functional"])
        self.assertEqual(result["effects"], [])
        self.assertTrue(any("illustrative" in issue for issue in result["issues"]))

    def test_expanded_symbols_and_unresolved_mechanics(self):
        for kind, entry in R.EXTENDED_SYMBOLS.items():
            nodes = drawing()
            nodes[2]["type"] = kind
            measured = R.geometry(nodes)
            self.assertEqual(measured["nodes"][2]["group"], entry["group"])
        nodes = drawing()
        nodes[2]["type"] = "detection"
        result = R.clean_result({"name": "Trigger", "description": "Unverified", "functional": True}, R.geometry(nodes))
        self.assertIsNone(result["functional"])
        self.assertEqual(result["effects"], [])

    def test_geometry_is_computed_from_drawing(self):
        g = R.geometry(drawing())
        self.assertEqual(g["structural_issues"], [])
        sign = g["nodes"][2]
        self.assertEqual(sign["nearest_ring"], "sring")
        self.assertEqual(sign["distance_from_center"], 110)
        self.assertEqual(sign["angle_from_inward_degrees"], 0)
        self.assertEqual(g["seals"][0]["direction_vector"], [0, 40])

    def test_malformed_input(self):
        for field, value in [("x", float("nan")), ("w", 0), ("rotation", float("inf")), ("x", True), ("id", "<x>"), ("type", "execute")]:
            n = drawing()
            n[0][field] = value
            with self.assertRaises(ValueError):
                R.geometry(n)
        with self.assertRaises(ValueError):
            R.geometry(drawing() * 2)

    def test_open_and_uncontained_geometry(self):
        n = drawing()
        n[0]["type"] = "openRing"
        n[1]["x"] = 170
        g = R.geometry(n)
        self.assertEqual(len(g["structural_issues"]), 2)
        r = R.clean_result({"name": "Wrong", "description": "Should be blocked", "functional": True, "effects": []}, g)
        self.assertFalse(r["functional"])
        self.assertEqual(r["effects"], [])

    def test_model_output_is_bounded_and_sources_are_allowlisted(self):
        value = {"name": "Fireball", "description": "A floating flame", "functional": True,
                 "sources": [{"url": "javascript:alert(1)"}],
                 "effects": [{"ring_id": "sring", "element": "fire", "behavior": "orb", "power": 100, "spin": float("nan")} ]}
        r = R.clean_result(value, R.geometry(drawing()))
        self.assertEqual(r["effects"][0]["power"], 2)
        self.assertEqual(r["effects"][0]["spin"], 0)
        self.assertTrue(all(s["url"].startswith("https://witchhatatelier.telepedia.net/") for s in r["sources"]))

    def test_interpret_sends_measured_geometry_and_evidence(self):
        seen = {}
        def mock_ai(path, payload, timeout):
            seen.update(payload)
            return {"message": {"content": json.dumps({"name": "Fireball", "description": "Floating flame", "functional": True, "effects": [{"ring_id": "sring", "element": "fire", "behavior": "orb"}]})}}
        with patch.object(R, "references", return_value=(R.BASE_REFERENCE, "saved notes")):
            r = R.interpret(R.geometry(drawing()), "test-model", mock_ai)
        self.assertTrue(r["functional"])
        context = json.loads(seen["messages"][1]["content"])
        self.assertIn("relative_area", context["drawing"]["node_columns"])
        node = dict(zip(context["drawing"]["node_columns"], context["drawing"]["nodes"][1]))
        self.assertEqual(node["relative_area"], R.geometry(drawing())["nodes"][1]["relative_area"])
        self.assertIsInstance(seen["format"], dict)
        self.assertIn("floating ball of flame", context["reference_evidence"])

    def test_dense_layout_retains_every_component_in_compact_reading(self):
        import spell_designer as D
        nodes = []
        for step in D.expand_step(dict(action="seal", core="crystalize", bands=[dict(type=t) for t in ["convergence", "regions", "expansion", "crushing"]])):
            D.apply_step(step, nodes)
        measured = R.geometry(nodes)
        compact = R.reading_input(measured)
        self.assertEqual(len(compact["nodes"]), 77)
        for source, row in zip(measured["nodes"], compact["nodes"]):
            self.assertEqual(dict(zip(compact["node_columns"], row)), {k: source.get(k) for k in compact["node_columns"]})
        self.assertLess(len(json.dumps(compact)), len(json.dumps(measured)) / 3)

    def test_truncated_reading_reports_response_limit(self):
        with patch.object(R, "references", return_value=("", "cached")):
            with self.assertRaisesRegex(ValueError, "response limit"):
                R.interpret(R.geometry(drawing()), "test", lambda *a, **k: {"done_reason": "length", "message": {"content": "{}"}})

    def test_reference_failure_uses_explicit_saved_notes(self):
        with patch.object(R, "_fetch_reference", return_value=("", "offline")):
            evidence, status = R.references({"fire"})
        self.assertIn("unavailable", status)
        self.assertIn("Pyreball", evidence)

    def test_endpoint_denies_nonmembers_before_using_ai(self):
        handler = object.__new__(server.Handler)
        responses = []
        handler.send_json = lambda status, data: responses.append((status, data))
        with patch.object(server.storage, "campaign_record", return_value=None), patch.object(server, "ollama_request") as ai:
            handler.interpret_spell({"id": 99}, 12, {"nodes": drawing()})
        self.assertEqual(responses[0][0], 403)
        ai.assert_not_called()

    def test_endpoint_checks_input_and_returns_reader_output(self):
        handler = object.__new__(server.Handler)
        responses = []
        handler.send_json = lambda status, data: responses.append((status, data))
        handler.ai_model = lambda model: "qa-model"
        with patch.object(server.storage, "campaign_record", return_value={"content": {}}), patch.object(server.storage, "campaign_role", return_value="member"), patch.object(R, "interpret", return_value={"name": "Fireball"}) as interpret:
            handler.interpret_spell({"id": 2}, 12, {"nodes": []})
            self.assertEqual(responses[-1][0], 400)
            interpret.assert_not_called()
            handler.interpret_spell({"id": 2}, 12, {"nodes": drawing()})
            self.assertEqual(responses[-1][0], 200)
            self.assertIn("seals", interpret.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
