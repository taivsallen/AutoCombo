#!/usr/bin/env python3
"""Paired, stratified performance evaluator for ComboAuto solvers.

The evaluator deliberately does not reduce correctness, quality, and latency
to one magic weighted score. It runs the same case/seed against a baseline and
candidate solver, verifies the reported hard fields, computes paired deltas,
and applies conservative regression gates.

Protocol
--------
Each solver command is a long-lived process. One JSON request is written to
stdin per case and one JSON response must be written to stdout. Solver logs
must go to stderr.

Request keys include: protocol, case_id, board, scenario, config, seed, and
warmup. A response must include at least:

    {"case_id": "...", "legal": true,
     "requirements_satisfied": true, "special_satisfied": true,
     "combo": 1, "steps": 1, "path": [[1, 0], [1, 1]],
     "initialCombos": 1, "skyfallCombos": 0, "success": true}

Missing hard fields are treated as unknown/failed, never as success. Checks
cover protocol consistency and path shape, NOT independent rule replay.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import os
import platform
import queue
import random
import shlex
import statistics
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SUITE = ROOT / "fixed_test_suite.json"
DEFAULT_SCENARIOS = Path(__file__).with_name("perf_eval_scenarios.json")
DEFAULT_REPORT = ROOT / "reports" / "perf_eval_latest.json"
PROTOCOL = "comboauto-perf-v1"


DEFAULT_GATES = {
    "success_regression_pp": 0.0,
    "important_stratum_regression_pp": 0.0,
    "p95_latency_regression_pct": 10.0,
    "min_success_gain_pp": 1.0,
    "min_combo_gain": 0.25,
    "min_step_reduction": 1.0,
    "min_latency_reduction_pct": 10.0,
    "bootstrap_samples": 1000,
    "bootstrap_seed": 20260712,
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def finite_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def int_number(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    number = finite_number(value)
    return int(number) if number is not None and number.is_integer() else None


def bool_field(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in {"true", "1", "yes", "ok", "pass"}:
            return True
        if text in {"false", "0", "no", "fail"}:
            return False
    return None


def first_value(obj: dict[str, Any], keys: Iterable[str]) -> Any:
    for key in keys:
        if key in obj:
            return obj[key]
    return None


def quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * max(0.0, min(1.0, q))
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def mean(values: Iterable[float]) -> float | None:
    values = list(values)
    return statistics.fmean(values) if values else None


def median(values: Iterable[float]) -> float | None:
    values = list(values)
    return statistics.median(values) if values else None


def normalize_board(raw: Any) -> list[list[int]] | None:
    if not isinstance(raw, list) or len(raw) != 6:
        return None
    board: list[list[int]] = []
    for row in raw:
        if not isinstance(row, list) or len(row) != 6:
            return None
        normalized_row: list[int] = []
        for cell in row:
            if isinstance(cell, bool) or not isinstance(cell, (int, float)):
                return None
            normalized_row.append(int(cell))
        board.append(normalized_row)
    return board


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_boards(path: Path) -> list[list[list[int]]]:
    raw = load_json(path)
    if isinstance(raw, dict):
        raw = raw.get("boards", raw.get("cases", raw.get("suite", [])))
    if not isinstance(raw, list):
        raise ValueError(f"Suite must be a JSON array or contain boards: {path}")

    boards: list[list[list[int]]] = []
    for index, item in enumerate(raw):
        candidate = item.get("board") if isinstance(item, dict) else item
        board = normalize_board(candidate)
        if board is None:
            raise ValueError(f"Invalid 6x6 board at suite index {index}")
        boards.append(board)
    if not boards:
        raise ValueError(f"Suite contains no boards: {path}")
    return boards


ACTIVE_SHIELD_TYPES = (
    "clearCount",
    "equalFirst",
    "rect",
    "cross",
    "l",
    "t",
)


def build_multi_shield_specials(types: tuple[str, ...]) -> list[dict[str, Any]]:
    specials: list[dict[str, Any]] = []
    minimum_cleared = sum(
        9
        if special_type == "rect"
        else 5
        if special_type in {"cross", "l", "t"}
        else 6
        if special_type == "equalFirst"
        else 0
        for special_type in types
    )
    clear_count_target = minimum_cleared if minimum_cleared > 0 else 9
    geometric_orb = 0
    for special_type in types:
        if special_type == "clearCount":
            specials.append(
                {"type": special_type, "clearCount": clear_count_target}
            )
        elif special_type == "equalFirst":
            specials.append({"type": special_type, "equalOrbs": [4, 5]})
        elif special_type == "rect":
            specials.append(
                {
                    "type": special_type,
                    "rectM": 3,
                    "rectN": 3,
                    "rectOrb": geometric_orb,
                }
            )
            geometric_orb += 1
        else:
            specials.append(
                {"type": special_type, "count": 1, "orb": geometric_orb}
            )
            geometric_orb += 1
    return specials


def build_multi_shield_scenarios() -> list[dict[str, Any]]:
    scenarios: list[dict[str, Any]] = []
    for shield_count in (2, 3):
        for types in itertools.combinations(ACTIVE_SHIELD_TYPES, shield_count):
            label = "+".join(types)
            scenarios.append(
                {
                    "id": f"multi_shield_{shield_count}_{label}",
                    "stratum": f"multi-shield-{shield_count}-{label}",
                    "important": True,
                    "target": 4,
                    "priority": "combo",
                    "mode": "free",
                    "skyfall": True,
                    "diagonal": True,
                    "autoRow0Expanded": False,
                    "requirements": [],
                    "specials": build_multi_shield_specials(types),
                    "shield_count": shield_count,
                    "feasible_shield_fixture": True,
                }
            )
    return scenarios


def load_scenarios(path: Path | None) -> list[dict[str, Any]]:
    if path is None:
        return []
    raw = load_json(path)
    if isinstance(raw, dict):
        raw = raw.get("scenarios", [])
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"Scenario matrix must be a non-empty JSON array: {path}")
    scenarios: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict) or not item.get("id"):
            raise ValueError(f"Scenario {index} needs an id")
        scenario = dict(item)
        specials = scenario.get("specials", [])
        if specials:
            scenario.setdefault("shield_count", len(specials))
            scenario.setdefault("feasible_shield_fixture", True)
        scenarios.append(scenario)
    existing_ids = {str(item["id"]) for item in scenarios}
    for generated in build_multi_shield_scenarios():
        if generated["id"] not in existing_ids:
            scenarios.append(generated)
    return scenarios


def set_mark(cell: int, kind: str) -> int:
    orb = cell % 10
    if kind == "x1":
        return orb + 10
    if kind == "x2":
        return orb + 20
    if kind == "q1":
        return orb + 100
    if kind == "q2":
        return orb + 200
    if kind == "n1":
        return orb + 1000
    if kind == "n2":
        return orb + 2000
    raise ValueError(f"Unknown mark kind: {kind}")


def make_feasible_shield_board(
    board: list[list[int]], scenario: dict[str, Any]
) -> list[list[int]]:
    result = [row[:] for row in board]
    if not scenario.get("feasible_shield_fixture"):
        return result

    quotas = [0] * 6
    for special in scenario.get("specials", []):
        special_type = str(special.get("type", ""))
        if special_type == "rect":
            orb = int(special.get("rectOrb", -1))
            if 0 <= orb < 6:
                quotas[orb] += int(special.get("rectM", 3)) * int(
                    special.get("rectN", 3)
                )
        elif special_type in {"cross", "l", "t"}:
            orb = int(special.get("orb", -1))
            if 0 <= orb < 6:
                quotas[orb] += 5 * int(special.get("count", 1))
        elif special_type == "equalFirst":
            for orb_value in special.get("equalOrbs", []):
                orb = int(orb_value)
                if 0 <= orb < 6:
                    quotas[orb] += 3

    cells: list[int] = []
    for orb, quota in enumerate(quotas):
        cells.extend([orb] * quota)
    if len(cells) > 30:
        raise ValueError(f"Infeasible shield fixture: {scenario.get('id')}")

    fill_counts = quotas[:]
    while len(cells) < 30:
        orb = min(range(6), key=lambda index: (fill_counts[index], index))
        cells.append(orb)
        fill_counts[orb] += 1

    fixture_seed = hash_string(f"{scenario.get('id')}:{json_hash(board)}")
    random.Random(fixture_seed).shuffle(cells)
    for index, orb in enumerate(cells):
        row = 1 + index // 6
        col = index % 6
        result[row][col] = orb
    return result


def materialize_scenario(board: list[list[int]], scenario: dict[str, Any]) -> list[list[int]]:
    result = make_feasible_shield_board(board, scenario)
    for mark in scenario.get("marks", []):
        if not isinstance(mark, dict):
            continue
        position = mark.get("position", [1, 0])
        if not isinstance(position, list) or len(position) != 2:
            raise ValueError(f"Invalid mark position in scenario {scenario['id']}")
        row, col = int(position[0]), int(position[1])
        if not (0 <= row < 6 and 0 <= col < 6):
            raise ValueError(f"Mark out of bounds in scenario {scenario['id']}")
        result[row][col] = set_mark(result[row][col], str(mark["kind"]))
    return result


@dataclass(frozen=True)
class EvaluationCase:
    case_id: str
    board_index: int
    scenario_id: str
    stratum: str
    important: bool
    board: list[list[int]]
    scenario: dict[str, Any]
    seed: int

    @property
    def target(self) -> int | None:
        value = self.scenario.get("target")
        return int_number(value)

    @property
    def max_nodes(self) -> int | None:
        value = self.scenario.get("max_nodes", self.scenario.get("maxNodes"))
        return int_number(value)

    @property
    def max_steps(self) -> int | None:
        value = self.scenario.get("max_steps", self.scenario.get("maxSteps"))
        return int_number(value)

    @property
    def init_target_combo(self) -> int | None:
        value = self.scenario.get(
            "init_target_combo",
            self.scenario.get("initTargetCombo"),
        )
        return int_number(value)

    @property
    def has_hard_conditions(self) -> bool:
        return bool(
            self.scenario.get("requirements")
            or self.scenario.get("specials")
            or self.scenario.get("marks")
            or self.scenario.get("rule_profile")
            or self.init_target_combo is not None
            or self.max_steps is not None
        )


def build_cases(
    boards: list[list[list[int]]],
    scenarios: list[dict[str, Any]],
    max_boards: int,
    repeats: int,
    seed: int,
) -> list[EvaluationCase]:
    if max_boards <= 0 or max_boards >= len(boards):
        indices = list(range(len(boards)))
    else:
        rng = random.Random(seed)
        indices = sorted(rng.sample(range(len(boards)), max_boards))

    cases: list[EvaluationCase] = []
    for board_index in indices:
        for scenario in scenarios:
            materialized = materialize_scenario(boards[board_index], scenario)
            scenario_copy = json.loads(json.dumps(scenario))
            scenario_copy["board_fingerprint"] = json_hash(materialized)
            case_id = f"b{board_index:04d}:{scenario['id']}"
            stratum = str(scenario.get("stratum", scenario["id"]))
            important = bool(scenario.get("important", False))
            case_seed = (seed ^ (board_index * 0x9E3779B1) ^ hash_string(scenario["id"])) & 0xFFFFFFFF
            cases.append(
                EvaluationCase(
                    case_id=case_id,
                    board_index=board_index,
                    scenario_id=str(scenario["id"]),
                    stratum=stratum,
                    important=important,
                    board=materialized,
                    scenario=scenario_copy,
                    seed=case_seed,
                )
            )
    if repeats < 1:
        raise ValueError("repeats must be at least 1")
    return cases


def hash_string(value: str) -> int:
    digest = hashlib.blake2s(value.encode("utf-8"), digest_size=4).digest()
    return int.from_bytes(digest, "little")


def scenario_payload(case: EvaluationCase, repeat: int, warmup: bool = False) -> dict[str, Any]:
    return {
        "protocol": PROTOCOL,
        "case_id": case.case_id,
        "repeat": repeat,
        "warmup": warmup,
        "board": case.board,
        "scenario": case.scenario,
        "config": {
            "target": case.target,
            "max_nodes": case.max_nodes,
            "max_steps": case.max_steps,
            "init_target_combo": case.init_target_combo,
            "seed": case.seed,
        },
        "seed": case.seed,
    }


class SolverProcess:
    def __init__(self, name: str, command: str, timeout_seconds: float):
        self.name = name
        self.command = command
        self.timeout_seconds = timeout_seconds
        self.process: subprocess.Popen[str] | None = None
        self.lines: queue.Queue[str] = queue.Queue()
        self.stderr_lines: queue.Queue[str] = queue.Queue()
        self.reader: threading.Thread | None = None
        self.stderr_reader: threading.Thread | None = None
        self.start_error: str | None = None

    def start(self) -> None:
        if not self.command.strip():
            raise ValueError(f"{self.name} command is empty")
        try:
            self.process = subprocess.Popen(
                self.command,
                cwd=str(ROOT),
                shell=True,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            self.start_error = str(exc)
            raise

        self.reader = threading.Thread(target=self._read_stdout, daemon=True)
        self.stderr_reader = threading.Thread(target=self._read_stderr, daemon=True)
        self.reader.start()
        self.stderr_reader.start()

    def _read_stdout(self) -> None:
        if not self.process or not self.process.stdout:
            return
        for line in self.process.stdout:
            self.lines.put(line)

    def _read_stderr(self) -> None:
        if not self.process or not self.process.stderr:
            return
        for line in self.process.stderr:
            self.stderr_lines.put(line.rstrip())

    def request(self, payload: dict[str, Any]) -> tuple[dict[str, Any] | None, float, str | None]:
        if not self.process or self.process.poll() is not None or not self.process.stdin:
            return None, 0.0, "solver process is not running"

        started = time.perf_counter()
        try:
            self.process.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            return None, elapsed_ms(started), f"write failed: {exc}"

        deadline = time.monotonic() + self.timeout_seconds
        diagnostics: list[str] = []
        while time.monotonic() < deadline:
            remaining = max(0.01, deadline - time.monotonic())
            try:
                line = self.lines.get(timeout=min(0.1, remaining))
            except queue.Empty:
                if self.process.poll() is not None:
                    return None, elapsed_ms(started), "solver exited before response"
                continue

            text = line.strip()
            if not text:
                continue
            try:
                value = json.loads(text)
            except json.JSONDecodeError:
                diagnostics.append(text[:240])
                continue
            if not isinstance(value, dict):
                diagnostics.append("non-object response")
                continue
            response_case_id = value.get("case_id", value.get("caseId"))
            if response_case_id is not None and response_case_id != payload.get("case_id"):
                diagnostics.append(f"unexpected case_id={response_case_id}")
                continue
            return value, elapsed_ms(started), None

        detail = "timeout"
        if diagnostics:
            detail += "; stdout diagnostics: " + " | ".join(diagnostics[-3:])
        return None, elapsed_ms(started), detail

    def stderr_tail(self, limit: int = 8) -> list[str]:
        values: list[str] = []
        while True:
            try:
                values.append(self.stderr_lines.get_nowait())
            except queue.Empty:
                break
        return values[-limit:]

    def stop(self) -> None:
        if not self.process:
            return
        if self.process.poll() is None:
            try:
                self.process.terminate()
                self.process.wait(timeout=1.0)
            except (subprocess.TimeoutExpired, OSError):
                try:
                    self.process.kill()
                except OSError:
                    pass
        self.process = None


def elapsed_ms(started: float) -> float:
    return (time.perf_counter() - started) * 1000.0


def validate_path_shape(path: Any) -> bool | None:
    if path is None:
        return None
    if not isinstance(path, list) or not path:
        return False
    previous: tuple[int, int] | None = None
    for point in path:
        if isinstance(point, dict):
            row = int_number(point.get("r"))
            col = int_number(point.get("c"))
        elif isinstance(point, list) and len(point) == 2:
            row = int_number(point[0])
            col = int_number(point[1])
        else:
            return False
        coordinates = [point.get("r"), point.get("c")] if isinstance(point, dict) else point
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in coordinates):
            return False
        if row is None or col is None or not (0 <= row < 6 and 0 <= col < 6):
            return False
        if previous is not None:
            dr = abs(row - previous[0])
            dc = abs(col - previous[1])
            if dr > 1 or dc > 1 or (dr == 0 and dc == 0):
                return False
        previous = (row, col)
    return True


def normalize_result(
    response: dict[str, Any] | None,
    error: str | None,
    wall_ms: float,
    case: EvaluationCase,
    solver_name: str,
    repeat: int,
    reported_runtime_ms: float | None = None,
) -> dict[str, Any]:
    response = response if isinstance(response, dict) else {}
    if response.get("error"):
        error = error or f"solver response error: {response['error']}"
    missing: list[str] = []
    no_candidate = response.get("found") is False or response.get("status") == "no_candidate"

    legal = bool_field(first_value(response, ["legal", "path_legal"]))
    requirements = bool_field(
        first_value(response, ["requirements_satisfied", "requirementSatisfied", "rule_satisfied"])
    )
    special = bool_field(first_value(response, ["special_satisfied", "specialSatisfied"]))
    initial = bool_field(
        first_value(response, ["initial_satisfied", "initialSatisfied", "init_target_satisfied"])
    )
    success_reported = bool_field(first_value(response, ["success", "solved"]))
    combo = int_number(first_value(response, ["combo", "combos", "total_combo", "totalCombos"]))
    steps = int_number(first_value(response, ["steps", "path_steps"]))
    nodes = int_number(first_value(response, ["nodes", "nodes_expanded", "nodesExpanded"]))
    path = first_value(response, ["path"])
    initial_combo = int_number(first_value(response, ["initialCombos", "initial_combos", "initial_combo"]))
    skyfall_combo = int_number(first_value(response, ["skyfallCombos", "skyfall_combos", "skyfall_combo"]))
    signature = [initial_combo, skyfall_combo] if initial_combo is not None and skyfall_combo is not None else None

    for name, value in (("legal", legal), ("requirements_satisfied", requirements), ("special_satisfied", special), ("combo", combo), ("steps", steps)):
        if value is None:
            missing.append(name)

    if case.init_target_combo is None:
        initial = True if initial is None else initial
    elif initial is None:
        missing.append("initial_satisfied")

    path_shape_valid = validate_path_shape(path)
    if path_shape_valid is None:
        missing.append("path")
    elif path_shape_valid is False:
        missing.append("path_shape")
    if steps is not None and isinstance(path, list) and steps != len(path) - 1:
        missing.append("steps_path_mismatch")
    if combo is not None and combo < 0:
        missing.append("negative_combo")
    if steps is not None and steps < 0:
        missing.append("negative_steps")
    if signature is not None and (min(signature) < 0 or combo != sum(signature)):
        missing.append("combo_signature_mismatch")
    if no_candidate:
        # An explicit exhausted/deadline result is a valid unsuccessful response.
        missing = [] if path is None or path == [] else ["no_candidate_with_path"]

    timeout = error == "timeout" or (error and error.startswith("timeout;"))
    process_error = bool(error and not timeout)
    invalid_response = bool(missing) or (not no_candidate and (combo is None or steps is None))
    target_satisfied = False if combo is None else case.target is None or combo >= case.target
    step_limit_satisfied = bool(
        steps is not None and (case.max_steps is None or steps <= case.max_steps)
    )
    feasible = bool(
        legal is True
        and requirements is True
        and special is True
        and initial is True
        and step_limit_satisfied
        and not invalid_response
        and not error
        and not no_candidate
    )
    hard_success = bool(feasible and target_satisfied)
    false_success = bool(success_reported is True and not hard_success)
    illegal = bool(not no_candidate and (legal is False or path_shape_valid is False))

    budget_violation = False
    if case.max_nodes is not None and nodes is not None and nodes > case.max_nodes:
        budget_violation = True
    if case.max_steps is not None and steps is not None and steps > case.max_steps:
        budget_violation = True

    usable = bool(legal is True and not invalid_response and not error and not no_candidate)
    if reported_runtime_ms is None:
        reported_runtime_ms = finite_number(first_value(response, ["core_runtime_ms", "runtime_ms", "elapsed_ms", "elapsedMs"]))
    if reported_runtime_ms is not None and reported_runtime_ms < 0:
        reported_runtime_ms = None
    adapter_wall_ms = finite_number(response.get("adapter_wall_ms"))
    if adapter_wall_ms is not None and adapter_wall_ms < 0:
        adapter_wall_ms = None
    return {
        "solver": solver_name,
        "case_id": case.case_id,
        "board_index": case.board_index,
        "scenario_id": case.scenario_id,
        "stratum": case.stratum,
        "important": case.important,
        "shield_count": int(
            case.scenario.get(
                "shield_count", len(case.scenario.get("specials", []))
            )
        ),
        "hard_conditions": case.has_hard_conditions,
        "repeat": repeat,
        "seed": case.seed,
        "wall_ms": wall_ms,
        "reported_runtime_ms": reported_runtime_ms,
        "adapter_wall_ms": adapter_wall_ms,
        "runtime_trust": "solver_self_reported" if reported_runtime_ms is not None else "unavailable",
        "verification_level": "protocol_and_path_shape_only",
        "independent_rules_verified": False,
        "no_candidate": no_candidate,
        "legal": legal,
        "requirements_satisfied": requirements,
        "special_satisfied": special,
        "initial_satisfied": initial,
        "step_limit_satisfied": step_limit_satisfied,
        "feasible": feasible,
        "target_satisfied": target_satisfied,
        "hard_success": hard_success,
        "success_reported": success_reported,
        "false_success": false_success,
        "illegal": illegal,
        "invalid_response": invalid_response,
        "missing_fields": missing,
        "timeout": bool(timeout),
        "process_error": process_error,
        "error": error,
        "budget_violation": budget_violation,
        "usable": usable,
        "combo": combo,
        "initial_combo": initial_combo,
        "skyfall_combo": skyfall_combo,
        "combo_signature": signature,
        "steps": steps,
        "nodes": nodes,
        "path_shape_valid": path_shape_valid,
        "raw": response,
    }


def run_evaluation(
    baseline_command: str,
    candidate_command: str,
    cases: list[EvaluationCase],
    repeats: int,
    warmup_cases: int,
    timeout_seconds: float,
    seed: int,
    stop_event: threading.Event | None = None,
    progress: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    baseline = SolverProcess("baseline", baseline_command, timeout_seconds)
    candidate = SolverProcess("candidate", candidate_command, timeout_seconds)
    rows: list[dict[str, Any]] = []
    total_requests = len(cases) * repeats * 2
    completed = 0
    started = time.perf_counter()
    run_seed = seed & 0xFFFFFFFF

    try:
        baseline.start()
        candidate.start()

        for index, case in enumerate(cases[: max(0, warmup_cases)]):
            payload = scenario_payload(case, -1, warmup=True)
            for process in (baseline, candidate):
                response, _, warmup_error = process.request(payload)
                if warmup_error or (response or {}).get("error"):
                    raise RuntimeError(f"{process.name} warmup failed: {warmup_error or response['error']}")
            if progress:
                progress(completed, total_requests, f"warmup {index + 1}/{min(warmup_cases, len(cases))}")

        for repeat in range(repeats):
            for case_index, case in enumerate(cases):
                if stop_event and stop_event.is_set():
                    raise RuntimeError("evaluation stopped")
                payload = scenario_payload(case, repeat, warmup=False)
                order = [baseline, candidate] if ((repeat + case_index + run_seed) % 2 == 0) else [candidate, baseline]

                for process in order:
                    response, wall_ms, error = process.request(payload)
                    reported = finite_number(
                        first_value(response or {}, ["core_runtime_ms", "runtime_ms", "elapsed_ms", "elapsedMs"])
                    )
                    rows.append(
                        normalize_result(
                            response,
                            error,
                            wall_ms,
                            case,
                            process.name,
                            repeat,
                            reported,
                        )
                    )
                    completed += 1
                    if progress:
                        progress(completed, total_requests, f"{completed}/{total_requests} {case.case_id}")
    finally:
        baseline_stderr = baseline.stderr_tail()
        candidate_stderr = candidate.stderr_tail()
        baseline.stop()
        candidate.stop()

    report = build_report(
        rows=rows,
        cases=cases,
        repeats=repeats,
        warmup_cases=warmup_cases,
        timeout_seconds=timeout_seconds,
        seed=seed,
        baseline_command=baseline_command,
        candidate_command=candidate_command,
        elapsed_ms=elapsed_ms(started),
        process_stderr={"baseline": baseline_stderr, "candidate": candidate_stderr},
    )
    return report


def group_rows(rows: list[dict[str, Any]], solver: str | None = None) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if solver and row["solver"] != solver:
            continue
        grouped.setdefault(row["case_id"], []).append(row)
    return grouped


def representative_case(row_list: list[dict[str, Any]]) -> dict[str, Any]:
    hard_conditions = bool(row_list[0].get("hard_conditions"))
    usable = [
        row
        for row in row_list
        if (row.get("feasible") if hard_conditions else row.get("usable"))
    ]
    success_values = [bool(row.get("hard_success")) for row in row_list]
    combo_values = [row["combo"] for row in usable if row.get("combo") is not None]
    step_values = [row["steps"] for row in usable if row.get("steps") is not None]
    if usable:
        max_combo = max(combo_values) if combo_values else None
        max_combo_steps = min(
            row["steps"] for row in usable if row.get("combo") == max_combo and row.get("steps") is not None
        ) if max_combo is not None else None
    else:
        max_combo = None
        max_combo_steps = None
    best_signature = next((row.get("combo_signature") for row in usable
                           if row.get("combo") == max_combo and row.get("steps") == max_combo_steps), None)
    return {
        "case_id": row_list[0]["case_id"],
        "stratum": row_list[0]["stratum"],
        "important": row_list[0]["important"],
        "first_success": bool(row_list[0].get("hard_success")),
        "all_success": bool(row_list) and all(success_values),
        "any_success": any(success_values),
        "majority_success": sum(success_values) >= math.ceil(len(success_values) / 2),
        "stable_outcome": len({
            (row.get("hard_success"), row.get("combo"), row.get("steps"), row.get("error"))
            for row in row_list
        }) <= 1,
        "median_combo": median(combo_values),
        "median_steps": median(step_values),
        "max_combo": max_combo,
        "steps_at_max_combo": max_combo_steps,
        "best_combo_signature": best_signature,
        "median_wall_ms": median(row["wall_ms"] for row in row_list),
        "rows": row_list,
    }


def latency_summary(rows: list[dict[str, Any]], field: str, trust: str) -> dict[str, Any]:
    measured = [row for row in rows if row.get(field) is not None]
    values = [row[field] for row in measured]
    on_time = [row for row in measured if row[field] <= 160]
    delivered = [row for row in on_time if not row.get("invalid_response") and not row.get("error")]
    return {
        "trust": trust,
        "samples": len(measured),
        "missing_samples": len(rows) - len(measured),
        "coverage_pct": percentage(len(measured), len(rows)),
        "mean_ms": mean(values),
        "p50_ms": median(values),
        "p95_ms": quantile(values, 0.95),
        "p99_ms": quantile(values, 0.99),
        "max_ms": max(values) if values else None,
        # Every trial remains in the denominator. Missing timings cannot pass.
        "delivery_at_160ms_pct": percentage(len(delivered), len(rows)) if measured else None,
        "result_at_160ms_pct": percentage(sum(bool(row.get("usable")) for row in on_time), len(rows)) if measured else None,
        "success_at_160ms_pct": percentage(sum(bool(row.get("hard_success")) for row in on_time), len(rows)) if measured else None,
    }


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"cases": 0, "trials": 0}
    case_groups = group_rows(rows)
    representatives = [representative_case(values) for values in case_groups.values()]
    quality_usable = [
        row
        for row in rows
        if (row.get("feasible") if row.get("hard_conditions") else row.get("usable"))
    ]
    usable = [row for row in rows if row.get("usable")]
    usable_case = [item for item in representatives if item["max_combo"] is not None]
    hard_success = [bool(row.get("hard_success")) for row in rows]
    case_success = [item["first_success"] for item in representatives]
    return {
        "cases": len(representatives),
        "trials": len(rows),
        "trial_success_rate": percentage(sum(hard_success), len(hard_success)),
        "case_first_success_rate": percentage(sum(case_success), len(case_success)),
        "case_all_repeat_success_rate": percentage(sum(item["all_success"] for item in representatives), len(representatives)),
        "case_any_repeat_success_rate": percentage(sum(item["any_success"] for item in representatives), len(representatives)),
        "feasible_rate": percentage(sum(bool(row.get("feasible")) for row in rows), len(rows)),
        "target_rate": percentage(sum(bool(row.get("target_satisfied")) for row in rows), len(rows)),
        "errors": sum(bool(row.get("process_error")) for row in rows),
        "timeouts": sum(bool(row.get("timeout")) for row in rows),
        "invalid_responses": sum(bool(row.get("invalid_response")) for row in rows),
        "illegal_returns": sum(bool(row.get("illegal")) for row in rows),
        "false_successes": sum(bool(row.get("false_success")) for row in rows),
        "no_candidates": sum(bool(row.get("no_candidate")) for row in rows),
        "budget_violations": sum(bool(row.get("budget_violation")) for row in rows),
        "unstable_case_rate": percentage(sum(not item["stable_outcome"] for item in representatives), len(representatives)),
        "wall_ms_mean": mean(row["wall_ms"] for row in rows),
        "wall_ms_median": median(row["wall_ms"] for row in rows),
        "wall_ms_p95": quantile([row["wall_ms"] for row in rows], 0.95),
        "wall_ms_p99": quantile([row["wall_ms"] for row in rows], 0.99),
        "latency": {
            "process_wall": latency_summary(rows, "wall_ms", "evaluator_measured_including_IPC; not_browser_end_to_end"),
            "adapter_wall": latency_summary(rows, "adapter_wall_ms", "adapter_measured_solveCase_wall; not_browser_end_to_end"),
            "reported_core": latency_summary(rows, "reported_runtime_ms", "solver_self_reported; not_independently_verified"),
        },
        "combo_median_usable": median(row["combo"] for row in quality_usable if row.get("combo") is not None),
        "combo_mean_usable": mean(row["combo"] for row in quality_usable if row.get("combo") is not None),
        "case_median_of_max_combo": median(item["max_combo"] for item in usable_case),
        "steps_at_max_combo_median": median(item["steps_at_max_combo"] for item in usable_case if item["steps_at_max_combo"] is not None),
        "steps_at_max_combo_mean": mean(item["steps_at_max_combo"] for item in usable_case if item["steps_at_max_combo"] is not None),
    }


def percentage(numerator: int | float, denominator: int | float) -> float:
    return (float(numerator) / float(denominator) * 100.0) if denominator else 0.0


def paired_case_deltas(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_solver = {name: group_rows(rows, name) for name in ("baseline", "candidate")}
    case_ids = sorted(set(by_solver["baseline"]) | set(by_solver["candidate"]))
    deltas: list[dict[str, Any]] = []
    for case_id in case_ids:
        base = representative_case(by_solver["baseline"][case_id]) if case_id in by_solver["baseline"] else None
        cand = representative_case(by_solver["candidate"][case_id]) if case_id in by_solver["candidate"] else None
        if not base or not cand:
            continue
        def delta(a: Any, b: Any) -> float | None:
            if a is None or b is None:
                return None
            return float(b) - float(a)
        deltas.append({
            "case_id": case_id,
            "stratum": cand["stratum"],
            "important": cand["important"],
            "baseline_success": base["first_success"],
            "candidate_success": cand["first_success"],
            "success_delta": int(cand["first_success"]) - int(base["first_success"]),
            "wall_ms_delta": delta(base["median_wall_ms"], cand["median_wall_ms"]),
            "wall_ms_ratio_pct": (
                (cand["median_wall_ms"] / base["median_wall_ms"] - 1.0) * 100.0
                if base["median_wall_ms"] and cand["median_wall_ms"] is not None else None
            ),
            "combo_delta": delta(base["median_combo"], cand["median_combo"]),
            "max_combo_delta": delta(base["max_combo"], cand["max_combo"]),
            "steps_at_max_combo_delta": (
                delta(base["steps_at_max_combo"], cand["steps_at_max_combo"])
                if base["best_combo_signature"] is not None
                and base["best_combo_signature"] == cand["best_combo_signature"] else None
            ),
            "same_total_best_steps_diagnostic_delta": (
                delta(base["steps_at_max_combo"], cand["steps_at_max_combo"])
                if base["max_combo"] == cand["max_combo"] else None
            ),
            "diagnostic_only": True,
            "baseline": base,
            "candidate": cand,
        })
    return deltas


def paired_trial_deltas(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pair actual attempts before averaging; repeated best results are diagnostic only."""
    grouped: dict[tuple[str, int, int], dict[str, dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault((row["case_id"], row["repeat"], row["seed"]), {})[row["solver"]] = row
    pairs: list[dict[str, Any]] = []
    for (case_id, repeat, seed), values in sorted(grouped.items()):
        if "baseline" not in values or "candidate" not in values:
            continue
        base, cand = values["baseline"], values["candidate"]
        same_conditions = all(base.get(key) == cand.get(key) for key in (
            "requirements_satisfied", "special_satisfied", "initial_satisfied", "step_limit_satisfied",
        ))
        both_usable = bool(base.get("usable") and cand.get("usable"))
        quality_comparable = bool(both_usable and same_conditions
                                  and (not base.get("hard_conditions")
                                       or (base.get("feasible") and cand.get("feasible"))))
        same_signature = bool(quality_comparable and base.get("combo_signature") is not None
                              and base.get("combo_signature") == cand.get("combo_signature"))
        combo_delta = cand["combo"] - base["combo"] if quality_comparable else None
        steps_delta = cand["steps"] - base["steps"] if same_signature else None
        # Conservative promotion: any observed loss is reviewable, never hidden
        # by another trial's gain or by a lower-priority objective.
        regressions = [key for key in ("usable", "requirements_satisfied", "special_satisfied", "initial_satisfied", "hard_success")
                       if base.get(key) is True and cand.get(key) is not True]
        if combo_delta is not None and combo_delta < 0:
            regressions.append("combo")
        if steps_delta is not None and steps_delta > 0:
            regressions.append("steps_same_signature")
        pairs.append({
            "case_id": case_id, "board_index": cand["board_index"], "stratum": cand["stratum"],
            "important": cand["important"], "repeat": repeat, "seed": seed,
            "success_delta": int(bool(cand.get("hard_success"))) - int(bool(base.get("hard_success"))),
            "feasible_delta": int(bool(cand.get("feasible"))) - int(bool(base.get("feasible"))),
            "wall_ms_delta": cand["wall_ms"] - base["wall_ms"],
            "combo_delta": combo_delta, "same_signature": same_signature,
            "steps_same_signature_delta": steps_delta,
            "steps_same_total_diagnostic_delta": (cand["steps"] - base["steps"] if quality_comparable and combo_delta == 0 else None),
            "quality_regressions": regressions,
        })
    return pairs


def paired_board_values(pairs: list[dict[str, Any]], key: str) -> list[float]:
    """Cluster repeats and scenarios from the same source board for the CI."""
    grouped: dict[int, list[float]] = {}
    for item in pairs:
        if item.get(key) is not None:
            grouped.setdefault(item["board_index"], []).append(float(item[key]))
    return [statistics.fmean(values) for values in grouped.values()]


def bootstrap_ci(values: list[float], samples: int, seed: int) -> list[float | None]:
    if not values:
        return [None, None]
    if len(values) == 1:
        return [values[0], values[0]]
    rng = random.Random(seed)
    estimates: list[float] = []
    for _ in range(max(100, samples)):
        draw = [values[rng.randrange(len(values))] for _ in values]
        estimates.append(statistics.fmean(draw))
    return [quantile(estimates, 0.025), quantile(estimates, 0.975)]


def compare_reports(rows: list[dict[str, Any]], gates: dict[str, Any] | None = None) -> dict[str, Any]:
    gates = {**DEFAULT_GATES, **(gates or {})}
    deltas = paired_case_deltas(rows)
    pairs = paired_trial_deltas(rows)
    success_values = paired_board_values(pairs, "success_delta")
    time_values = paired_board_values(pairs, "wall_ms_delta")
    combo_values = paired_board_values(pairs, "combo_delta")
    step_values = paired_board_values(pairs, "steps_same_signature_delta")

    by_stratum: dict[str, list[dict[str, Any]]] = {}
    for item in pairs:
        by_stratum.setdefault(item["stratum"], []).append(item)
    stratum_compare: dict[str, Any] = {}
    for stratum, items in sorted(by_stratum.items()):
        stratum_compare[stratum] = {
            "cases": len({item["case_id"] for item in items}),
            "paired_trials": len(items),
            "success_delta_pp": percentage(sum(item["success_delta"] for item in items), len(items)),
            "time_delta_mean_ms": mean(item["wall_ms_delta"] for item in items if item["wall_ms_delta"] is not None),
            "paired_combo_delta_mean": mean(item["combo_delta"] for item in items if item["combo_delta"] is not None),
            "paired_steps_same_signature_delta_mean": mean(item["steps_same_signature_delta"] for item in items if item["steps_same_signature_delta"] is not None),
            "max_combo_delta_mean": mean(item["max_combo_delta"] for item in deltas if item["stratum"] == stratum and item["max_combo_delta"] is not None),
            "steps_at_max_combo_delta_mean": mean(item["steps_at_max_combo_delta"] for item in deltas if item["stratum"] == stratum and item["steps_at_max_combo_delta"] is not None),
            "regressions": sum(item["success_delta"] < 0 for item in items),
            "quality_regressions": sum(bool(item["quality_regressions"]) for item in items),
        }

    baseline_rows = [row for row in rows if row["solver"] == "baseline"]
    candidate_rows = [row for row in rows if row["solver"] == "candidate"]
    baseline_summary = summarize_rows(baseline_rows)
    candidate_summary = summarize_rows(candidate_rows)
    success_delta_pp = percentage(sum(item["success_delta"] for item in pairs), len(pairs))
    time_delta_pct = (
        (candidate_summary.get("wall_ms_p95", 0) / baseline_summary.get("wall_ms_p95", 1) - 1.0) * 100.0
        if baseline_summary.get("wall_ms_p95") else None
    )

    hard_failures: list[str] = []
    warnings: list[str] = [
        "Independent path replay and elimination/shield verification NOT VERIFIED; PASS covers protocol/regression gates only.",
        "Core latency is solver self-report; process/adapter wall measurements do not certify browser end-to-end 160ms.",
    ]
    if not pairs or len(pairs) * 2 != len(rows):
        hard_failures.append("incomplete, duplicate, or unmatched paired trials")
    quality_regressions = [item for item in pairs if item["quality_regressions"]]
    if quality_regressions:
        hard_failures.append(f"candidate has {len(quality_regressions)} paired trial quality regressions; lower-priority gains cannot offset them")
    if candidate_summary.get("errors", 0) > 0 or candidate_summary.get("timeouts", 0) > 0:
        hard_failures.append("candidate has process errors or timeouts")
    if candidate_summary.get("invalid_responses", 0) > 0:
        hard_failures.append("candidate has invalid or incomplete protocol responses")
    if candidate_summary.get("illegal_returns", 0) > 0:
        hard_failures.append("candidate returned illegal/path-invalid results")
    if candidate_summary.get("false_successes", 0) > 0:
        hard_failures.append("candidate reported success that failed hard-field verification")
    if candidate_summary.get("budget_violations", 0) > 0:
        hard_failures.append("candidate exceeded a declared node or step budget")
    if success_delta_pp < -float(gates["success_regression_pp"]):
        hard_failures.append(f"overall success regression {success_delta_pp:.2f}pp exceeds gate")

    important_regressions: list[str] = []
    for stratum, item in stratum_compare.items():
        # The scenario matrix marks constraint/special/mark strata important.
        corresponding = next((case for case in pairs if case["stratum"] == stratum and case["important"]), None)
        if corresponding and (item["quality_regressions"] or item["success_delta_pp"] < -float(gates["important_stratum_regression_pp"])):
            important_regressions.append(f"important stratum {stratum} has quality regressions (success delta {item['success_delta_pp']:.2f}pp)")
    hard_failures.extend(important_regressions)

    if time_delta_pct is not None and time_delta_pct > float(gates["p95_latency_regression_pct"]):
        warnings.append(f"p95 latency regressed {time_delta_pct:.2f}%")
    if candidate_summary.get("unstable_case_rate", 0) > 0:
        warnings.append("candidate is nondeterministic on at least one repeated case")
    if baseline_summary.get("unstable_case_rate", 0) > 0:
        warnings.append("baseline is nondeterministic; quality comparisons pair each repeat before aggregating by board")
    if not step_values:
        warnings.append("no comparable initial+skyfall signatures; same-group step improvement is unavailable")

    success_gain = success_delta_pp >= float(gates["min_success_gain_pp"])
    combo_gain = (mean(combo_values) or 0) >= float(gates["min_combo_gain"])
    step_gain = (mean(step_values) or 0) <= -float(gates["min_step_reduction"])
    time_gain = bool(combo_values) and time_delta_pct is not None and time_delta_pct <= -float(gates["min_latency_reduction_pct"])
    if not combo_values:
        warnings.append("no paired usable results with comparable condition outcomes; latency alone cannot establish improvement")
    meaningful = success_gain or combo_gain or step_gain or time_gain

    latency_tradeoff = bool(
        time_delta_pct is not None
        and time_delta_pct > float(gates["p95_latency_regression_pct"])
        and (success_gain or combo_gain or step_gain)
    )
    if latency_tradeoff:
        warnings.append(
            "candidate improved a higher-priority quality objective but regressed p95 latency; review as a tradeoff"
        )

    baseline_invalid = any(baseline_summary.get(key, 0) for key in ("errors", "timeouts", "invalid_responses", "illegal_returns", "false_successes", "budget_violations"))
    if baseline_invalid:
        warnings.append("baseline is invalid; repair it before claiming an improvement")
    if hard_failures:
        decision = "FAIL"
    elif baseline_invalid:
        decision = "INCONCLUSIVE"
    elif not meaningful:
        decision = "INCONCLUSIVE"
        warnings.append("no objective improved by the configured practical threshold")
    elif latency_tradeoff:
        decision = "PASS_WITH_TRADEOFF"
    else:
        decision = "PASS"

    return {
        "decision": decision,
        "success_delta_pp": success_delta_pp,
        "p95_latency_delta_pct": time_delta_pct,
        "mean_max_combo_delta": mean(item["max_combo_delta"] for item in deltas if item["max_combo_delta"] is not None),
        "mean_steps_at_max_combo_delta": mean(item["steps_at_max_combo_delta"] for item in deltas if item["steps_at_max_combo_delta"] is not None),
        "comparison_basis": "paired_trials; CI clusters by source board; best-of-R fields are diagnostic only",
        "verification_level": "protocol_and_path_shape_only; independent_rules_NOT_VERIFIED",
        "paired_trial_count": len(pairs),
        "paired_combo_trial_count": sum(item["combo_delta"] is not None for item in pairs),
        "paired_same_signature_trial_count": sum(item["same_signature"] for item in pairs),
        "paired_mean_combo_delta": mean(combo_values),
        "paired_mean_steps_same_signature_delta": mean(step_values),
        "quality_regression_count": len(quality_regressions),
        "hard_failures": hard_failures,
        "warnings": warnings,
        "improvement_flags": {
            "success": success_gain,
            "combo": combo_gain,
            "steps": step_gain,
            "latency": time_gain,
        },
        "bootstrap_ci": {
            "success_delta_trial": bootstrap_ci(success_values, int(gates["bootstrap_samples"]), int(gates["bootstrap_seed"])),
            "wall_ms_delta": bootstrap_ci(time_values, int(gates["bootstrap_samples"]), int(gates["bootstrap_seed"]) + 1),
            "paired_combo_delta": bootstrap_ci(combo_values, int(gates["bootstrap_samples"]), int(gates["bootstrap_seed"]) + 2),
            "paired_steps_same_signature_delta": bootstrap_ci(step_values, int(gates["bootstrap_samples"]), int(gates["bootstrap_seed"]) + 3),
            "max_combo_delta": bootstrap_ci([float(item["max_combo_delta"]) for item in deltas if item["max_combo_delta"] is not None], int(gates["bootstrap_samples"]), int(gates["bootstrap_seed"]) + 2),
            "steps_at_max_combo_delta": bootstrap_ci([float(item["steps_at_max_combo_delta"]) for item in deltas if item["steps_at_max_combo_delta"] is not None], int(gates["bootstrap_samples"]), int(gates["bootstrap_seed"]) + 3),
        },
        "strata": stratum_compare,
        "paired_cases": deltas,
        "paired_trials": pairs,
        "gates": gates,
    }


def build_report(
    rows: list[dict[str, Any]],
    cases: list[EvaluationCase],
    repeats: int,
    warmup_cases: int,
    timeout_seconds: float,
    seed: int,
    baseline_command: str,
    candidate_command: str,
    elapsed_ms: float,
    process_stderr: dict[str, list[str]],
) -> dict[str, Any]:
    baseline_rows = [row for row in rows if row["solver"] == "baseline"]
    candidate_rows = [row for row in rows if row["solver"] == "candidate"]
    strata = sorted({case.stratum for case in cases})
    by_stratum: dict[str, Any] = {}
    for stratum in strata:
        by_stratum[stratum] = {
            "important": any(case.stratum == stratum and case.important for case in cases),
            "baseline": summarize_rows([row for row in baseline_rows if row["stratum"] == stratum]),
            "candidate": summarize_rows([row for row in candidate_rows if row["stratum"] == stratum]),
        }
    shield_cardinality: dict[str, Any] = {}
    shield_counts = sorted(
        {
            int(row.get("shield_count", 0))
            for row in rows
            if int(row.get("shield_count", 0)) > 0
        }
    )
    for shield_count in shield_counts:
        shield_cardinality[str(shield_count)] = {
            "baseline": summarize_rows(
                [
                    row
                    for row in baseline_rows
                    if int(row.get("shield_count", 0)) == shield_count
                ]
            ),
            "candidate": summarize_rows(
                [
                    row
                    for row in candidate_rows
                    if int(row.get("shield_count", 0)) == shield_count
                ]
            ),
        }
    return {
        "protocol": PROTOCOL,
        "verification": {
            "verified": ["response field consistency", "integer adjacent path coordinates", "steps equal path length minus one"],
            "not_verified": ["independent path replay", "row0 and marked-cell rules", "elimination and shields", "Top10 grouping and optimality", "browser end-to-end latency"],
            "reported_core_timing_trust": "solver self-report; no fallback from adapter wall",
        },
        "generated_at": now_iso(),
        "root": str(ROOT),
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor(),
        },
        "config": {
            "repeats": repeats,
            "warmup_cases": warmup_cases,
            "timeout_seconds": timeout_seconds,
            "seed": seed,
            "case_count": len(cases),
            "case_fingerprint": json_hash([asdict(case) for case in cases]),
            "baseline_command": baseline_command,
            "candidate_command": candidate_command,
        },
        "elapsed_ms": elapsed_ms,
        "commands_stderr_tail": process_stderr,
        "overall": {
            "baseline": summarize_rows(baseline_rows),
            "candidate": summarize_rows(candidate_rows),
        },
        "strata": by_stratum,
        "shield_cardinality": shield_cardinality,
        "comparison": compare_reports(rows),
        "rows": rows,
    }


def save_report(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)


def format_value(value: Any, suffix: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.2f}{suffix}"
    return f"{value}{suffix}"


def print_report(report: dict[str, Any]) -> None:
    comparison = report.get("comparison", {})
    overall = report.get("overall", {})
    print(f"Decision: {comparison.get('decision', 'UNKNOWN')}")
    for solver in ("baseline", "candidate"):
        summary = overall.get(solver, {})
        print(
            f"{solver:9s} trial_success={format_value(summary.get('trial_success_rate'), '%'):>9s} "
            f"p95={format_value(summary.get('wall_ms_p95'), ' ms'):>12s} "
            f"diagnostic_best_combo={format_value(summary.get('case_median_of_max_combo')):>8s} "
            f"diagnostic_steps@best={format_value(summary.get('steps_at_max_combo_median')):>8s}"
        )
    print(f"delta     success={format_value(comparison.get('success_delta_pp'), ' pp'):>10s} "
          f"p95={format_value(comparison.get('p95_latency_delta_pct'), '%'):>10s} "
          f"paired_combo={format_value(comparison.get('paired_mean_combo_delta')):>8s} "
          f"paired_steps_same_group={format_value(comparison.get('paired_mean_steps_same_signature_delta')):>8s}")
    for failure in comparison.get("hard_failures", []):
        print(f"FAIL: {failure}")
    for warning in comparison.get("warnings", []):
        print(f"WARN: {warning}")


def run_cli(args: argparse.Namespace) -> int:
    suite_path = Path(args.suite).resolve()
    scenario_path = Path(args.scenarios).resolve() if args.scenarios else None
    boards = load_boards(suite_path)
    scenarios = load_scenarios(scenario_path)
    cases = build_cases(boards, scenarios, args.boards, args.repeats, args.seed)
    print(f"Evaluating {len(cases)} cases x {args.repeats} repeats against two persistent solver processes...")

    def on_progress(done: int, total: int, message: str) -> None:
        if total:
            print(f"\r{done}/{total} {message:<48s}", end="", flush=True)

    try:
        report = run_evaluation(
            baseline_command=args.baseline,
            candidate_command=args.candidate,
            cases=cases,
            repeats=args.repeats,
            warmup_cases=args.warmup,
            timeout_seconds=args.timeout,
            seed=args.seed,
            progress=on_progress,
        )
    except KeyboardInterrupt:
        print("\nStopped.")
        return 130
    except Exception as exc:
        print(f"\nEvaluation failed: {exc}", file=sys.stderr)
        return 2
    print()
    output = Path(args.out).resolve()
    save_report(report, output)
    print_report(report)
    print(f"Report: {output}")
    return 0 if report["comparison"]["decision"] != "FAIL" else 1


def make_default_args() -> dict[str, str]:
    return {
        "suite": str(DEFAULT_SUITE),
        "scenarios": str(DEFAULT_SCENARIOS),
        "out": str(DEFAULT_REPORT),
    }


class EvaluatorGui:
    def __init__(self, root: Any, initial: argparse.Namespace):
        import tkinter as tk
        from tkinter import ttk

        self.tk = tk
        self.ttk = ttk
        self.root = root
        self.root.title("ComboAuto Performance Evaluator")
        self.root.geometry("1180x760")
        self.stop_event = threading.Event()
        self.report: dict[str, Any] | None = None
        self.worker: threading.Thread | None = None

        self.vars: dict[str, Any] = {
            "suite": tk.StringVar(value=initial.suite),
            "scenarios": tk.StringVar(value=initial.scenarios),
            "baseline": tk.StringVar(value=initial.baseline or ""),
            "candidate": tk.StringVar(value=initial.candidate or ""),
            "out": tk.StringVar(value=initial.out),
            "boards": tk.StringVar(value=str(initial.boards)),
            "repeats": tk.StringVar(value=str(initial.repeats)),
            "warmup": tk.StringVar(value=str(initial.warmup)),
            "timeout": tk.StringVar(value=str(initial.timeout)),
            "seed": tk.StringVar(value=str(initial.seed)),
            "status": tk.StringVar(value="Ready"),
        }
        self._build()

    def _build(self) -> None:
        tk, ttk = self.tk, self.ttk
        root_frame = ttk.Frame(self.root, padding=10)
        root_frame.pack(fill="both", expand=True)

        controls = ttk.LabelFrame(root_frame, text="評估設定", padding=8)
        controls.pack(fill="x")
        fields = [
            ("Suite", "suite", True),
            ("Scenarios", "scenarios", True),
            ("Baseline command", "baseline", False),
            ("Candidate command", "candidate", False),
            ("Output", "out", True),
        ]
        for row, (label, key, browse) in enumerate(fields):
            ttk.Label(controls, text=label).grid(row=row, column=0, sticky="w", padx=(0, 6), pady=3)
            ttk.Entry(controls, textvariable=self.vars[key], width=100).grid(row=row, column=1, sticky="ew", pady=3)
            if browse:
                ttk.Button(controls, text="Browse", command=lambda k=key: self._browse(k)).grid(row=row, column=2, padx=(6, 0))
        controls.columnconfigure(1, weight=1)

        numeric = ttk.Frame(controls)
        numeric.grid(row=0, column=3, rowspan=5, sticky="ns", padx=(12, 0))
        for row, (label, key) in enumerate((("Boards", "boards"), ("Repeats", "repeats"), ("Warmup", "warmup"), ("Timeout s", "timeout"), ("Seed", "seed"))):
            ttk.Label(numeric, text=label).grid(row=row, column=0, sticky="w", padx=(0, 6), pady=3)
            ttk.Entry(numeric, textvariable=self.vars[key], width=12).grid(row=row, column=1, pady=3)

        actions = ttk.Frame(root_frame)
        actions.pack(fill="x", pady=(8, 8))
        ttk.Button(actions, text="Run paired evaluation", command=self.run).pack(side="left")
        ttk.Button(actions, text="Stop", command=self.stop).pack(side="left", padx=6)
        ttk.Button(actions, text="Load report", command=self.load_report).pack(side="left")
        ttk.Label(actions, textvariable=self.vars["status"]).pack(side="right")

        notebook = ttk.Notebook(root_frame)
        notebook.pack(fill="both", expand=True)
        self.summary_tree = self._make_tree(notebook, ("metric", "baseline", "candidate", "delta"), (320, 170, 170, 170))
        self.strata_tree = self._make_tree(notebook, ("stratum", "baseline_success", "candidate_success", "time_delta", "combo_delta", "steps_delta", "status"), (210, 120, 120, 110, 110, 110, 120))
        self.failures_text = tk.Text(notebook, wrap="word", height=12)
        self.chart = tk.Canvas(notebook, background="white", highlightthickness=1, highlightbackground="#cccccc")
        notebook.add(self.summary_tree.master, text="Summary")
        notebook.add(self.strata_tree.master, text="Strata")
        notebook.add(self.failures_text, text="Failures / Warnings")
        notebook.add(self.chart, text="Charts")

    def _make_tree(self, parent: Any, columns: tuple[str, ...], widths: tuple[int, ...]) -> Any:
        import tkinter as tk
        frame = self.ttk.Frame(parent)
        tree = self.ttk.Treeview(frame, columns=columns, show="headings")
        for column, width in zip(columns, widths):
            tree.heading(column, text=column)
            tree.column(column, width=width, anchor="center")
        scroll = self.ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=scroll.set)
        tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        return tree

    def _browse(self, key: str) -> None:
        from tkinter import filedialog
        if key == "out":
            path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON", "*.json")])
        else:
            path = filedialog.askopenfilename(filetypes=[("JSON", "*.json"), ("All files", "*.*")])
        if path:
            self.vars[key].set(path)

    def _parse_args(self) -> argparse.Namespace:
        return argparse.Namespace(
            suite=self.vars["suite"].get(),
            scenarios=self.vars["scenarios"].get(),
            baseline=self.vars["baseline"].get(),
            candidate=self.vars["candidate"].get(),
            out=self.vars["out"].get(),
            boards=int(self.vars["boards"].get()),
            repeats=int(self.vars["repeats"].get()),
            warmup=int(self.vars["warmup"].get()),
            timeout=float(self.vars["timeout"].get()),
            seed=int(self.vars["seed"].get()),
        )

    def run(self) -> None:
        from tkinter import messagebox
        try:
            args = self._parse_args()
            if not args.baseline or not args.candidate:
                raise ValueError("Both baseline and candidate commands are required")
            boards = load_boards(Path(args.suite))
            scenarios = load_scenarios(Path(args.scenarios))
            cases = build_cases(boards, scenarios, args.boards, args.repeats, args.seed)
        except Exception as exc:
            messagebox.showerror("Invalid settings", str(exc))
            return

        self.stop_event.clear()
        self.vars["status"].set(f"Running {len(cases)} cases...")
        self.worker = threading.Thread(target=self._run_background, args=(args, cases), daemon=True)
        self.worker.start()

    def _run_background(self, args: argparse.Namespace, cases: list[EvaluationCase]) -> None:
        try:
            report = run_evaluation(
                args.baseline,
                args.candidate,
                cases,
                args.repeats,
                args.warmup,
                args.timeout,
                args.seed,
                self.stop_event,
                lambda done, total, message: self.root.after(0, self.vars["status"].set, f"{done}/{total} {message}"),
            )
            save_report(report, Path(args.out))
            self.root.after(0, self.show_report, report)
        except Exception as exc:
            self.root.after(0, self.vars["status"].set, f"Failed: {exc}")

    def stop(self) -> None:
        self.stop_event.set()
        self.vars["status"].set("Stopping...")

    def load_report(self) -> None:
        from tkinter import filedialog, messagebox
        path = filedialog.askopenfilename(filetypes=[("JSON report", "*.json")])
        if not path:
            return
        try:
            report = load_json(Path(path))
            self.show_report(report)
        except Exception as exc:
            messagebox.showerror("Load failed", str(exc))

    def show_report(self, report: dict[str, Any]) -> None:
        self.report = report
        self.vars["status"].set(f"{report.get('comparison', {}).get('decision', 'UNKNOWN')} — report loaded")
        self._show_summary(report)
        self._show_strata(report)
        self._show_failures(report)
        self._draw_chart(report)

    def _clear_tree(self, tree: Any) -> None:
        for item in tree.get_children():
            tree.delete(item)

    def _show_summary(self, report: dict[str, Any]) -> None:
        self._clear_tree(self.summary_tree)
        base = report.get("overall", {}).get("baseline", {})
        cand = report.get("overall", {}).get("candidate", {})
        metrics = [
            ("trial success %", "trial_success_rate", "%"),
            ("feasible %", "feasible_rate", "%"),
            ("p95 wall time", "wall_ms_p95", " ms"),
            ("diagnostic best-of-R combo", "case_median_of_max_combo", ""),
            ("diagnostic best-of-R steps", "steps_at_max_combo_median", ""),
            ("errors", "errors", ""),
            ("timeouts", "timeouts", ""),
            ("illegal returns", "illegal_returns", ""),
            ("false successes", "false_successes", ""),
            ("budget violations", "budget_violations", ""),
        ]
        comparison = report.get("comparison", {})
        for label, key, suffix in metrics:
            b, c = base.get(key), cand.get(key)
            delta = None if b is None or c is None else c - b
            self.summary_tree.insert("", "end", values=(label, format_value(b, suffix), format_value(c, suffix), format_value(delta, suffix)))
        for label, key in (("paired combo delta", "paired_mean_combo_delta"),
                           ("paired same-group step delta", "paired_mean_steps_same_signature_delta")):
            self.summary_tree.insert("", "end", values=(label, "", "", format_value(comparison.get(key))))
        for layer in ("process_wall", "adapter_wall", "reported_core"):
            b = base.get("latency", {}).get(layer, {}).get("success_at_160ms_pct")
            c = cand.get("latency", {}).get(layer, {}).get("success_at_160ms_pct")
            self.summary_tree.insert("", "end", values=(f"{layer} success @160ms", format_value(b, "%"), format_value(c, "%"),
                                                         format_value(None if b is None or c is None else c - b, "pp")))
        self.summary_tree.insert("", "end", values=("DECISION", "", comparison.get("decision", "UNKNOWN"), ""))

    def _show_strata(self, report: dict[str, Any]) -> None:
        self._clear_tree(self.strata_tree)
        for shield_count, entry in sorted(
            report.get("shield_cardinality", {}).items(),
            key=lambda item: int(item[0]),
        ):
            base = entry.get("baseline", {})
            cand = entry.get("candidate", {})
            success_delta = (cand.get("case_first_success_rate", 0) or 0) - (
                base.get("case_first_success_rate", 0) or 0
            )
            self.strata_tree.insert(
                "",
                "end",
                values=(
                    f"diagnostic ALL {shield_count}-shield cases",
                    format_value(base.get("case_first_success_rate"), "%"),
                    format_value(cand.get("case_first_success_rate"), "%"),
                    format_value(
                        (cand.get("wall_ms_p95") or 0)
                        - (base.get("wall_ms_p95") or 0),
                        " ms",
                    ),
                    format_value(
                        (cand.get("case_median_of_max_combo") or 0)
                        - (base.get("case_median_of_max_combo") or 0)
                    ),
                    format_value(
                        (cand.get("steps_at_max_combo_median") or 0)
                        - (base.get("steps_at_max_combo_median") or 0)
                    ),
                    "REGRESSION" if success_delta < 0 else "OK",
                ),
            )
        for stratum, entry in sorted(report.get("strata", {}).items()):
            base = entry.get("baseline", {})
            cand = entry.get("candidate", {})
            paired = report.get("comparison", {}).get("strata", {}).get(stratum, {})
            status = "REGRESSION" if paired.get("quality_regressions", 0) else "OK"
            self.strata_tree.insert("", "end", values=(
                f"{stratum}{' *' if entry.get('important') else ''}",
                format_value(base.get("trial_success_rate"), "%"),
                format_value(cand.get("trial_success_rate"), "%"),
                format_value((cand.get("wall_ms_p95") or 0) - (base.get("wall_ms_p95") or 0), " ms"),
                format_value(paired.get("paired_combo_delta_mean")),
                format_value(paired.get("paired_steps_same_signature_delta_mean")),
                status,
            ))

    def _show_failures(self, report: dict[str, Any]) -> None:
        self.failures_text.delete("1.0", "end")
        comparison = report.get("comparison", {})
        self.failures_text.insert("end", f"Decision: {comparison.get('decision', 'UNKNOWN')}\n\n")
        for item in comparison.get("hard_failures", []):
            self.failures_text.insert("end", f"FAIL  {item}\n")
        for item in comparison.get("warnings", []):
            self.failures_text.insert("end", f"WARN  {item}\n")
        regressions = [item for item in comparison.get("paired_trials", []) if item.get("quality_regressions")]
        self.failures_text.insert("end", f"\nPaired trial quality regressions: {len(regressions)}\n")
        for item in regressions[:80]:
            self.failures_text.insert("end", f"  {item['case_id']} / repeat {item['repeat']} / {', '.join(item['quality_regressions'])}\n")

    def _draw_chart(self, report: dict[str, Any]) -> None:
        canvas = self.chart
        canvas.delete("all")
        canvas.update_idletasks()
        width = max(760, canvas.winfo_width())
        height = max(460, canvas.winfo_height())
        base = report.get("overall", {}).get("baseline", {})
        cand = report.get("overall", {}).get("candidate", {})
        charts = [
            ("Success %", "case_first_success_rate", 100.0, False),
            ("p95 time (ms)", "wall_ms_p95", None, True),
            ("Diagnostic best-of-R Combo", "case_median_of_max_combo", None, False),
            ("Diagnostic steps at best Combo", "steps_at_max_combo_median", None, True),
        ]
        margin_x, margin_y = 64, 42
        gap = 28
        chart_width = (width - margin_x * 2 - gap) / 2
        chart_height = (height - margin_y * 2 - gap) / 2
        for index, (title, key, ceiling, lower_is_better) in enumerate(charts):
            col, row = index % 2, index // 2
            x0 = margin_x + col * (chart_width + gap)
            y0 = margin_y + row * (chart_height + gap)
            x1, y1 = x0 + chart_width, y0 + chart_height
            canvas.create_text(x0, y0 - 16, anchor="w", text=title, font=("TkDefaultFont", 10, "bold"))
            values = [base.get(key), cand.get(key)]
            numeric = [float(value) for value in values if value is not None]
            scale = ceiling or (max(numeric) * 1.15 if numeric and max(numeric) > 0 else 1.0)
            for tick in range(5):
                value = scale * tick / 4
                y = y1 - (y1 - y0) * tick / 4
                canvas.create_line(x0, y, x1, y, fill="#e5e7eb")
                canvas.create_text(x0 - 6, y, anchor="e", text=f"{value:.1f}", fill="#6b7280")
            bar_width = min(70, chart_width / 5)
            for bar_index, (label, value, color) in enumerate((("baseline", values[0], "#64748b"), ("candidate", values[1], "#2563eb"))):
                if value is None:
                    continue
                height_value = max(0.0, min(1.0, float(value) / scale)) * (y1 - y0)
                bx = x0 + chart_width * (0.30 + bar_index * 0.34) - bar_width / 2
                canvas.create_rectangle(bx, y1 - height_value, bx + bar_width, y1, fill=color, outline="")
                canvas.create_text(bx + bar_width / 2, y1 + 14, text=label, fill="#374151")
                canvas.create_text(bx + bar_width / 2, y1 - height_value - 10, text=f"{float(value):.2f}", fill="#111827")
            if lower_is_better:
                canvas.create_text(x1, y0 - 16, anchor="e", text="lower is better", fill="#6b7280")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    defaults = make_default_args()
    parser = argparse.ArgumentParser(description="Paired, stratified ComboAuto performance evaluator")
    parser.add_argument("--run", action="store_true", help="run CLI evaluation instead of opening the GUI")
    parser.add_argument("--suite", default=defaults["suite"])
    parser.add_argument("--scenarios", default=defaults["scenarios"])
    parser.add_argument("--baseline", default="", help="long-lived solver adapter command")
    parser.add_argument("--candidate", default="", help="long-lived solver adapter command")
    parser.add_argument("--out", default=defaults["out"])
    parser.add_argument("--boards", type=int, default=48, help="0 means all boards")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--warmup", type=int, default=2)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--seed", type=int, default=20260712)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.run:
        if not args.baseline or not args.candidate:
            print("--baseline and --candidate are required with --run", file=sys.stderr)
            return 2
        return run_cli(args)

    try:
        import tkinter as tk
    except ImportError as exc:
        print(f"Tkinter is unavailable: {exc}", file=sys.stderr)
        print("Use --run for the CLI evaluator.", file=sys.stderr)
        return 2
    root = tk.Tk()
    EvaluatorGui(root, args)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
