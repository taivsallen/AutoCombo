#!/usr/bin/env python3
"""Small deterministic adapter used only to smoke-test perf_eval.py.

It is intentionally not a ComboAuto solver. Replace this command with a real
adapter when evaluating an algorithm:

    python tools/perf_eval_demo_adapter.py --variant baseline
    python tools/perf_eval_demo_adapter.py --variant candidate
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time


def stable_int(value: object) -> int:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return int.from_bytes(hashlib.blake2s(raw, digest_size=4).digest(), "little")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=("baseline", "candidate"), default="baseline")
    args = parser.parse_args()

    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get("warmup"):
                print(json.dumps({"case_id": request.get("case_id"), "warmup": True}), flush=True)
                continue

            scenario = request.get("scenario") or {}
            hard = bool(
                scenario.get("requirements")
                or scenario.get("specials")
                or scenario.get("marks")
                or scenario.get("rule_profile")
                or scenario.get("init_target_combo") is not None
                or scenario.get("max_steps") is not None
            )
            salt = stable_int({"board": request.get("board"), "scenario": scenario, "seed": request.get("seed")})
            combo = 6 + salt % 3
            if args.variant == "candidate":
                combo += 1 if salt % 5 != 0 else 0
            steps = 15 + salt % 8
            if args.variant == "candidate":
                steps = max(1, steps - (1 if salt % 3 == 0 else 0))
            max_steps = scenario.get("max_steps")
            if max_steps is not None:
                steps = min(steps, int(max_steps))
            target = scenario.get("target")
            target_ok = target is None or combo >= int(target)

            # This deliberate adapter reports all hard fields so the evaluator
            # can exercise its strict protocol and gate logic.
            result = {
                "case_id": request.get("case_id"),
                "legal": True,
                "requirements_satisfied": True,
                "special_satisfied": True,
                "initial_satisfied": True,
                "combo": combo,
                "steps": steps,
                "nodes": 12000 if args.variant == "baseline" else 10500,
                "success": bool(target_ok),
                "runtime_ms": 3.0 if args.variant == "baseline" else 2.5,
                "adapter_note": "demo only; not a real solver",
                "hard_case": hard,
            }
            print(json.dumps(result, ensure_ascii=False), flush=True)
        except Exception as exc:  # protocol errors are visible to the evaluator
            print(json.dumps({"case_id": None, "error": str(exc)}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
