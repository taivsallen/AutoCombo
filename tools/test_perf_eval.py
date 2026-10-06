"""Regression tests for evaluator claims; no solver correctness is assumed."""

import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import perf_eval as perf


def make_case(case_id="case", board_index=0, important=True):
    return perf.EvaluationCase(case_id, board_index, "ordinary", "ordinary", important,
                               [[0] * 6 for _ in range(6)], {}, 42)


def result(solver, combo=8, steps=20, wall=100, repeat=0, signature=(7, 1), case=None, **overrides):
    response = {
        "legal": True, "requirements_satisfied": True, "special_satisfied": True,
        "initial_satisfied": True, "success": True, "combo": combo, "steps": steps,
        "path": [[1, index % 2] for index in range(max(0, int(steps)) + 1)],
    }
    if signature is not None:
        response.update(initialCombos=signature[0], skyfallCombos=signature[1])
    response.update(overrides)
    return perf.normalize_result(response, None, wall, case or make_case(), solver, repeat)


class ProtocolTests(unittest.TestCase):
    def test_missing_path_cannot_report_success(self):
        row = result("candidate", path=None)
        self.assertTrue(row["invalid_response"])
        self.assertTrue(row["false_success"])
        self.assertFalse(row["usable"])

    def test_coordinates_are_exact_integers(self):
        for path in ([], [[1.2, 0]], [[True, 0]], [["1", 0]], [[1, 0, 9]], [[6, 0]], [[1, 0], [3, 0]]):
            with self.subTest(path=path):
                self.assertFalse(perf.validate_path_shape(path))
        self.assertTrue(perf.validate_path_shape([[1, 0], [1, 1], [1, 0]]))
        self.assertTrue(perf.validate_path_shape([{"r": 1, "c": 0}]))

    def test_steps_must_match_path_and_not_round(self):
        for steps in (19, 20.5, True, -1):
            row = result("candidate", path=[[1, 0], [1, 1]], steps=steps)
            self.assertTrue(row["invalid_response"])
        self.assertFalse(result("candidate", steps=0)["invalid_response"])

    def test_error_response_is_not_success(self):
        row = result("candidate", error="solver crashed")
        self.assertTrue(row["process_error"])
        self.assertFalse(row["hard_success"])
        self.assertTrue(row["false_success"])

    def test_no_candidate_is_explicit_valid_failure(self):
        row = perf.normalize_result({"status": "no_candidate", "found": False, "success": False},
                                    None, 160, make_case(), "candidate", 0)
        self.assertFalse(row["invalid_response"])
        self.assertFalse(row["illegal"])
        self.assertFalse(row["hard_success"])
        self.assertTrue(row["no_candidate"])
        contradictory = perf.normalize_result({"found": False, "success": True}, None, 160,
                                              make_case(), "candidate", 0)
        self.assertTrue(contradictory["false_success"])

    def test_signature_consistency(self):
        self.assertTrue(result("candidate", combo=8, signature=(6, 1))["invalid_response"])
        self.assertTrue(result("candidate", combo=8.5)["invalid_response"])

    def test_raw_fields_survive(self):
        row = result("candidate", stats={"expanded": 123})
        self.assertEqual(row["raw"]["stats"], {"expanded": 123})
        self.assertFalse(row["independent_rules_verified"])


class ComparisonTests(unittest.TestCase):
    def test_lower_combo_shorter_path_never_passes_even_faster(self):
        for candidate_wall in (100, 10):
            rows = [result("baseline"), result("candidate", combo=6, steps=10,
                                               signature=(5, 1), wall=candidate_wall)]
            comparison = perf.compare_reports(rows)
            self.assertEqual(comparison["decision"], "FAIL")
            self.assertEqual(comparison["paired_mean_combo_delta"], -2)
            self.assertIsNone(comparison["paired_mean_steps_same_signature_delta"])
            self.assertFalse(comparison["improvement_flags"]["steps"])

    def test_best_repeat_is_diagnostic_only(self):
        rows = [result("baseline", repeat=0), result("baseline", repeat=1),
                result("candidate", combo=9, signature=(8, 1), repeat=0),
                result("candidate", combo=6, signature=(5, 1), repeat=1)]
        comparison = perf.compare_reports(rows)
        self.assertEqual(comparison["mean_max_combo_delta"], 1)
        self.assertEqual(comparison["paired_mean_combo_delta"], -0.5)
        self.assertEqual(comparison["paired_trial_count"], 2)
        self.assertEqual(comparison["decision"], "FAIL")

    def test_equal_total_different_split_is_not_step_gain(self):
        comparison = perf.compare_reports([result("baseline"),
                                           result("candidate", steps=10, signature=(6, 2))])
        self.assertFalse(comparison["improvement_flags"]["steps"])
        self.assertIsNone(comparison["paired_mean_steps_same_signature_delta"])
        self.assertEqual(comparison["paired_trials"][0]["steps_same_total_diagnostic_delta"], -10)
        self.assertEqual(comparison["decision"], "INCONCLUSIVE")

    def test_missing_signature_is_not_step_gain(self):
        comparison = perf.compare_reports([result("baseline", signature=None),
                                           result("candidate", steps=10, signature=None)])
        self.assertFalse(comparison["improvement_flags"]["steps"])
        self.assertIsNone(comparison["mean_steps_at_max_combo_delta"])
        self.assertEqual(comparison["decision"], "INCONCLUSIVE")

    def test_same_signature_step_gain_can_pass_protocol_gates(self):
        comparison = perf.compare_reports([result("baseline"), result("candidate", steps=18)])
        self.assertEqual(comparison["decision"], "PASS")
        self.assertEqual(comparison["paired_mean_steps_same_signature_delta"], -2)
        self.assertIn("NOT_VERIFIED", comparison["verification_level"])

    def test_one_board_loss_cannot_hide_in_positive_average(self):
        rows = [result("baseline"), result("candidate", combo=7, signature=(6, 1)),
                result("baseline", case=make_case("other", 1)),
                result("candidate", case=make_case("other", 1), combo=10, signature=(9, 1))]
        comparison = perf.compare_reports(rows)
        self.assertGreater(comparison["paired_mean_combo_delta"], 0)
        self.assertEqual(comparison["decision"], "FAIL")
        self.assertEqual(comparison["strata"]["ordinary"]["quality_regressions"], 1)

    def test_higher_priority_condition_loss_blocks_speed_gain(self):
        comparison = perf.compare_reports([result("baseline"),
                                           result("candidate", wall=10, success=False,
                                                  requirements_satisfied=False)])
        self.assertEqual(comparison["decision"], "FAIL")

    def test_unknown_partial_requirements_cannot_support_combo_promotion(self):
        case = perf.EvaluationCase("req", 0, "req", "req", True,
                                   [[0] * 6 for _ in range(6)], {"requirements": [{"orb": 0}]}, 42)
        rows = [result("baseline", case=case, requirements_satisfied=False, success=False),
                result("candidate", case=case, requirements_satisfied=False, success=False,
                       combo=9, signature=(8, 1), wall=10)]
        comparison = perf.compare_reports(rows)
        self.assertIsNone(comparison["paired_mean_combo_delta"])
        self.assertEqual(comparison["decision"], "INCONCLUSIVE")

    def test_unmatched_trial_cannot_pass(self):
        comparison = perf.compare_reports([result("baseline"), result("candidate", repeat=1, steps=18)])
        self.assertEqual(comparison["decision"], "FAIL")

    def test_invalid_baseline_cannot_support_promotion(self):
        comparison = perf.compare_reports([result("baseline", path=None),
                                           result("candidate", steps=18, wall=10)])
        self.assertEqual(comparison["decision"], "INCONCLUSIVE")

    def test_faster_empty_results_are_not_a_quality_promotion(self):
        rows = [perf.normalize_result({"found": False, "success": False}, None, wall,
                                      make_case(), solver, 0)
                for solver, wall in (("baseline", 100), ("candidate", 1))]
        self.assertEqual(perf.compare_reports(rows)["decision"], "INCONCLUSIVE")

    def test_repeat_success_loss_is_not_hidden_by_first_repeat(self):
        rows = [result("baseline", repeat=0), result("baseline", repeat=1),
                result("candidate", repeat=0),
                result("candidate", repeat=1, success=False, special_satisfied=False)]
        comparison = perf.compare_reports(rows)
        self.assertEqual(comparison["success_delta_pp"], -50)
        self.assertEqual(comparison["decision"], "FAIL")

    def test_bootstrap_clusters_repeats_and_scenarios_by_board(self):
        pairs = [{"board_index": 0, "delta": 1}, {"board_index": 0, "delta": 3},
                 {"board_index": 1, "delta": 6}]
        self.assertEqual(perf.paired_board_values(pairs, "delta"), [2, 6])


class TimingTests(unittest.TestCase):
    def test_core_and_adapter_and_process_wall_are_separate(self):
        row = result("candidate", wall=220, runtime_ms=150, adapter_wall_ms=170)
        timings = perf.summarize_rows([row])["latency"]
        self.assertEqual(timings["reported_core"]["success_at_160ms_pct"], 100)
        self.assertEqual(timings["adapter_wall"]["success_at_160ms_pct"], 0)
        self.assertEqual(timings["process_wall"]["success_at_160ms_pct"], 0)
        self.assertIn("self_reported", timings["reported_core"]["trust"])

    def test_missing_core_times_do_not_become_zero(self):
        summary = perf.summarize_rows([result("candidate")])
        self.assertIsNone(summary["latency"]["reported_core"]["success_at_160ms_pct"])
        rows = [result("candidate", runtime_ms=150), result("candidate", repeat=1)]
        core = perf.summarize_rows(rows)["latency"]["reported_core"]
        self.assertEqual(core["coverage_pct"], 50)
        self.assertEqual(core["success_at_160ms_pct"], 50)

    @unittest.skipUnless(shutil.which("node"), "Node required for adapter warmup integration")
    def test_node_warmup_calls_solver_and_never_fabricates_core_runtime(self):
        with tempfile.TemporaryDirectory(prefix="comboauto-perf-test-") as directory:
            module = Path(directory) / "fixture.mjs"
            module.write_text("let calls=0; export function solveCase(request) { return {calls: ++calls, stats: {warm: request.warmup}}; }", encoding="utf-8")
            requests = [{"case_id": "warm", "warmup": True}, {"case_id": "measure", "warmup": False}]
            process = subprocess.run([shutil.which("node"), str(Path(__file__).with_name("perf_eval_adapter.mjs")),
                                      "--module", str(module)], input="".join(json.dumps(row) + "\n" for row in requests),
                                     text=True, capture_output=True, check=True, timeout=10)
        responses = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual([row["calls"] for row in responses], [1, 2])
        self.assertTrue(responses[0]["warmup"])
        for row in responses:
            self.assertIn("adapter_wall_ms", row)
            self.assertNotIn("runtime_ms", row)


if __name__ == "__main__":
    unittest.main()
