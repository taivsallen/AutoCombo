"""Train the Phase 1 policy/value/target model.

The dataset is produced by ``generate_teacher_dataset.mjs``.  The model is
deliberately small and exports a single ONNX graph so the Web solver can use
one forward pass for policy priors, value estimates, and an auxiliary target
board prediction.

Example:

    python train_policy_value_target.py \
      --train teacher_data_full/full200k.train.jsonl \
      --valid teacher_data_full/full200k.valid.jsonl \
      --test teacher_data_full/full200k.test.jsonl \
      --checkpoint training_runs/policy_value_target.pt \
      --onnx public/policy_value_target.onnx
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
from collections import Counter
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler


ACTION_COUNT = 8
PLAY_ROWS = 5
COLS = 6
PLAY_CELLS = PLAY_ROWS * COLS
INPUT_DIM = 397
SPECIAL_TYPE_NAMES = [
    "none",
    "cross",
    "l",
    "t",
    "rect",
    "clearCount",
    "equalFirst",
    "same",
    "unknown",
]


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def orb_of(value: int) -> int:
    if value < 0:
        return -1
    orb = value % 10
    return orb if 0 <= orb < 6 else -1


def one_hot(index: int, size: int) -> np.ndarray:
    out = np.zeros(size, dtype=np.float32)
    if 0 <= index < size:
        out[index] = 1.0
    return out


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def mode_to_one_hot(mode: str) -> List[float]:
    mode = (mode or "combo").lower()
    return [
        1.0 if mode == "combo" else 0.0,
        1.0 if mode == "vertical" else 0.0,
        1.0 if mode == "horizontal" else 0.0,
    ]


def encode_specials(sample: Dict) -> np.ndarray:
    out = np.zeros(3 * 18, dtype=np.float32)
    specials = sample.get("specials")
    if not isinstance(specials, list):
        specials = []

    for slot in range(3):
        special = specials[slot] if slot < len(specials) else {}
        if not isinstance(special, dict):
            special = {}

        base = slot * 18
        name = str(special.get("type", "none"))
        type_index = SPECIAL_TYPE_NAMES.index(name) if name in SPECIAL_TYPE_NAMES else 8
        out[base + type_index] = 1.0

        orb = int(special.get("orb", special.get("rectOrb", -1)) or -1)
        orb_index = orb if 0 <= orb < 6 else 6
        out[base + 9 + orb_index] = 1.0

        p1 = special.get("rectM", special.get("clearCount", special.get("count", 0)))
        p2 = special.get("rectN", len(special.get("equalOrbs", [])))
        try:
            p1 = float(p1)
        except (TypeError, ValueError):
            p1 = 0.0
        try:
            p2 = float(p2)
        except (TypeError, ValueError):
            p2 = 0.0
        out[base + 16] = clamp(p1 / 30.0, 0.0, 1.0)
        out[base + 17] = clamp(p2 / 6.0, 0.0, 1.0)

    return out


def encode_rules(sample: Dict) -> np.ndarray:
    """Encode rule semantics in the same order used by the Web runtime."""

    out = np.zeros(6 + 6 + 60, dtype=np.float32)
    profile = sample.get("rule_profile")
    if not isinstance(profile, dict):
        profile = {}

    orb_rules = profile.get("orbRules")
    if not isinstance(orb_rules, list):
        orb_rules = []
    for orb in range(6):
        rule = orb_rules[orb] if orb < len(orb_rules) else {}
        if not isinstance(rule, dict):
            rule = {}
        try:
            min_clear = float(rule.get("minClear", 3))
        except (TypeError, ValueError):
            min_clear = 3.0
        out[orb] = clamp(min_clear / 5.0, 0.0, 1.0)
        out[6 + orb] = 1.0 if rule.get("clearMode") == "connected" else 0.0

    requirements = sample.get("requirements")
    if not isinstance(requirements, list):
        requirements = profile.get("requirements", [])
    if not isinstance(requirements, list):
        requirements = []

    for requirement in requirements:
        if not isinstance(requirement, dict):
            continue
        try:
            orb = int(requirement.get("orb", -1))
            size = int(requirement.get("size", -1))
            count = float(requirement.get("count", 0))
        except (TypeError, ValueError):
            continue
        if not (0 <= orb < 6 and 1 <= size <= 5):
            continue
        index = 12 + orb * 10 + (size - 1) * 2
        out[index] = clamp(count / 3.0, 0.0, 1.0)
        out[index + 1] = 1.0 if requirement.get("match") == "atLeast" else 0.0

    return out


def encode_state(sample: Dict, max_steps_norm: float) -> np.ndarray:
    board = sample.get("board_with_hole") or sample.get("board_filled")
    if not isinstance(board, list) or len(board) != 36:
        raise ValueError("board_with_hole/board_filled must contain 36 cells")

    features: List[float] = []
    for value in board:
        bucket = orb_of(int(value))
        features.extend(one_hot(bucket if bucket >= 0 else 6, 7).tolist())

    held = int(sample.get("held", -1))
    features.extend(one_hot(held if 0 <= held < 6 else -1, 6).tolist())

    cursor = sample.get("cursor") or [-1, -1]
    hole = sample.get("hole") or [-1, -1]
    for point in (cursor, hole):
        if isinstance(point, list) and len(point) == 2:
            features.extend(
                [
                    clamp(float(point[0]) / 5.0, -1.0, 1.0),
                    clamp(float(point[1]) / 5.0, -1.0, 1.0),
                ]
            )
        else:
            features.extend([-0.2, -0.2])

    features.extend(
        [
            clamp(float(sample.get("steps_left", 0.0)) / max_steps_norm, 0.0, 4.0),
            clamp(float(sample.get("steps_used", 0.0)) / max_steps_norm, 0.0, 4.0),
            clamp(float(sample.get("target", 0.0)) / 20.0, 0.0, 2.0),
        ]
    )
    features.extend(mode_to_one_hot(str(sample.get("mode", "combo"))))
    features.extend(
        [
            1.0 if sample.get("skyfall", False) else 0.0,
            1.0 if sample.get("diagonal", False) else 0.0,
            1.0 if sample.get("row0", False) else 0.0,
        ]
    )
    features.extend(encode_rules(sample).tolist())
    features.extend(encode_specials(sample).tolist())

    result = np.asarray(features, dtype=np.float32)
    if result.shape != (INPUT_DIM,):
        raise ValueError(f"feature dimension mismatch: {result.shape} != {(INPUT_DIM,)}")
    return result


def parse_policy_target(sample: Dict) -> Tuple[np.ndarray, float]:
    target = sample.get("policy_target")
    if not isinstance(target, list) or len(target) != ACTION_COUNT:
        target = np.zeros(ACTION_COUNT, dtype=np.float32)
    else:
        target = np.asarray(
            [max(0.0, float(value)) for value in target], dtype=np.float32
        )
    total = float(target.sum())
    if total > 1e-8:
        target /= total
        return target, 1.0

    action = int(sample.get("action_target", -1))
    if 0 <= action < ACTION_COUNT:
        target[action] = 1.0
        return target, 1.0
    return target, 0.0


def parse_value_target(sample: Dict, max_steps_norm: float) -> np.ndarray:
    value = sample.get("value_target")
    if not isinstance(value, dict):
        label = sample.get("label") if isinstance(sample.get("label"), dict) else {}
        value = {
            "final_combo": label.get("combos", 0),
            "initial_combo": 0,
            "cleared_count": label.get("cleared_count", 0),
            "solved": False,
            "remaining_steps": label.get("best_steps_used", 0),
        }

    return np.asarray(
        [
            clamp(float(value.get("final_combo", 0)) / 20.0, 0.0, 2.0),
            clamp(float(value.get("initial_combo", 0)) / 12.0, 0.0, 2.0),
            clamp(float(value.get("cleared_count", 0)) / 30.0, 0.0, 2.0),
            clamp(float(value.get("remaining_steps", 0)) / max_steps_norm, 0.0, 4.0),
        ],
        dtype=np.float32,
    )


def parse_target_labels(sample: Dict) -> Tuple[np.ndarray, np.ndarray]:
    terminal = sample.get("terminal")
    if not isinstance(terminal, dict):
        terminal = {}
    board = terminal.get("board") or sample.get("board_filled")
    if not isinstance(board, list) or len(board) != 36:
        board = [-1] * 36

    target_board = np.zeros((PLAY_CELLS, 6), dtype=np.float32)
    for out_index, board_index in enumerate(range(6, 36)):
        orb = orb_of(int(board[board_index]))
        target_board[out_index, orb if orb >= 0 else 0] = 1.0

    clear_mask = np.zeros(PLAY_CELLS, dtype=np.float32)
    raw_mask = terminal.get("initialClearMask")
    if isinstance(raw_mask, list) and len(raw_mask) == 36:
        for out_index, board_index in enumerate(range(6, 36)):
            clear_mask[out_index] = 1.0 if raw_mask[board_index] else 0.0

    return target_board, clear_mask


class TeacherDataset(Dataset):
    def __init__(self, path: str, max_steps_norm: float = 30.0):
        if not os.path.exists(path):
            raise FileNotFoundError(path)

        xs: List[np.ndarray] = []
        policies: List[np.ndarray] = []
        policy_masks: List[float] = []
        values: List[np.ndarray] = []
        target_boards: List[np.ndarray] = []
        target_clear: List[np.ndarray] = []
        scenario_ids: List[str] = []

        with open(path, "r", encoding="utf-8") as stream:
            for line_no, line in enumerate(stream, start=1):
                if not line.strip():
                    continue
                try:
                    sample = json.loads(line)
                    xs.append(encode_state(sample, max_steps_norm))
                    policy, policy_mask = parse_policy_target(sample)
                    policies.append(policy)
                    policy_masks.append(policy_mask)
                    values.append(parse_value_target(sample, max_steps_norm))
                    board, clear = parse_target_labels(sample)
                    target_boards.append(board)
                    target_clear.append(clear)
                    scenario_id = sample.get("scenario_id")
                    scenario_ids.append(
                        str(scenario_id) if scenario_id else "__legacy__"
                    )
                except Exception as error:
                    raise ValueError(f"bad sample at {path}:{line_no}: {error}") from error

        if not xs:
            raise ValueError(f"dataset is empty: {path}")

        self.x = np.stack(xs).astype(np.float32)
        self.policy = np.stack(policies).astype(np.float32)
        self.policy_mask = np.asarray(policy_masks, dtype=np.float32)
        self.value = np.stack(values).astype(np.float32)
        self.target_board = np.stack(target_boards).astype(np.float32)
        self.target_clear = np.stack(target_clear).astype(np.float32)
        self.scenario_ids = scenario_ids
        self.scenario_counts = dict(sorted(Counter(scenario_ids).items()))

    def __len__(self) -> int:
        return int(self.x.shape[0])

    def __getitem__(self, index: int):
        return (
            torch.from_numpy(self.x[index]),
            torch.from_numpy(self.policy[index]),
            torch.tensor(self.policy_mask[index], dtype=torch.float32),
            torch.from_numpy(self.value[index]),
            torch.from_numpy(self.target_board[index]),
            torch.from_numpy(self.target_clear[index]),
            torch.tensor(index, dtype=torch.long),
        )


class PolicyValueTargetNet(nn.Module):
    def __init__(self, input_dim: int = INPUT_DIM):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Linear(256, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
        )
        self.policy_head = nn.Sequential(
            nn.Linear(256, 128), nn.SiLU(), nn.Linear(128, ACTION_COUNT)
        )
        self.value_head = nn.Sequential(
            nn.Linear(256, 128), nn.SiLU(), nn.Linear(128, 4)
        )
        self.target_board_head = nn.Sequential(
            nn.Linear(256, 180)
        )
        self.target_clear_head = nn.Sequential(
            nn.Linear(256, PLAY_CELLS)
        )

    def forward(self, x: torch.Tensor):
        hidden = self.trunk(x)
        return (
            self.policy_head(hidden),
            self.value_head(hidden),
            self.target_board_head(hidden).reshape(-1, PLAY_CELLS, 6),
            self.target_clear_head(hidden),
        )


@dataclass
class Metrics:
    loss: float
    policy_top1: float
    policy_top3: float
    value_mae: float
    target_accuracy: float
    by_scenario: Dict[str, Dict[str, float]]


def dataset_summary(dataset: TeacherDataset) -> Dict[str, object]:
    return {
        "items": len(dataset),
        "scenario_counts": dataset.scenario_counts,
    }


def make_scenario_sampling_weights(
    dataset: TeacherDataset, power: float
) -> Tuple[torch.Tensor, Dict[str, float]]:
    """Return inverse-frequency weights for optional balanced sampling."""

    counts = dataset.scenario_counts
    weights_by_scenario = {
        scenario_id: float(count ** (-power))
        for scenario_id, count in counts.items()
    }
    weights = torch.tensor(
        [weights_by_scenario[scenario_id] for scenario_id in dataset.scenario_ids],
        dtype=torch.double,
    )
    return weights, weights_by_scenario


def make_train_loader(
    dataset: TeacherDataset, args: argparse.Namespace
) -> Tuple[DataLoader, Dict[str, object]]:
    generator = torch.Generator()
    generator.manual_seed(args.seed)

    if args.scenario_sampling == "balanced":
        weights, weights_by_scenario = make_scenario_sampling_weights(
            dataset, args.scenario_balance_power
        )
        sampler = WeightedRandomSampler(
            weights,
            num_samples=len(dataset),
            replacement=True,
            generator=generator,
        )
        return (
            DataLoader(
                dataset,
                batch_size=args.batch_size,
                sampler=sampler,
                shuffle=False,
            ),
            {
                "mode": "balanced",
                "power": args.scenario_balance_power,
                "weights_by_scenario": weights_by_scenario,
            },
        )

    return (
        DataLoader(
            dataset,
            batch_size=args.batch_size,
            shuffle=True,
            generator=generator,
        ),
        {"mode": "none"},
    )


def compute_losses(
    outputs,
    policy: torch.Tensor,
    policy_mask: torch.Tensor,
    value: torch.Tensor,
    target_board: torch.Tensor,
    target_clear: torch.Tensor,
    args: argparse.Namespace,
):
    policy_logits, value_pred, board_logits, clear_logits = outputs
    log_probs = F.log_softmax(policy_logits, dim=-1)
    policy_loss_per = -(policy * log_probs).sum(dim=-1)
    active = policy_mask > 0.5
    policy_loss = (
        policy_loss_per[active].mean()
        if torch.any(active)
        else policy_loss_per.mean() * 0.0
    )
    value_loss = F.smooth_l1_loss(value_pred, value)
    board_target = target_board.argmax(dim=-1)
    board_loss = F.cross_entropy(
        board_logits.reshape(-1, 6), board_target.reshape(-1)
    )
    clear_loss = F.binary_cross_entropy_with_logits(clear_logits, target_clear)
    total = (
        args.policy_weight * policy_loss
        + args.value_weight * value_loss
        + args.target_board_weight * board_loss
        + args.target_clear_weight * clear_loss
    )
    return total, policy_loss, value_loss, board_loss, clear_loss


def evaluate(
    model: nn.Module,
    loader: DataLoader,
    dataset: TeacherDataset,
    device: torch.device,
    args: argparse.Namespace,
) -> Metrics:
    model.eval()
    total_loss = 0.0
    total_items = 0
    top1 = 0
    top3 = 0
    active_total = 0
    value_abs = 0.0
    board_correct = 0
    board_total = 0
    scenario_buckets: Dict[str, Dict[str, float]] = {}

    with torch.no_grad():
        for batch in loader:
            x, policy, policy_mask, value, target_board, target_clear = [
                item.to(device) for item in batch[:-1]
            ]
            sample_indices = batch[-1].tolist()
            outputs = model(x)
            loss, *_ = compute_losses(
                outputs, policy, policy_mask, value, target_board, target_clear, args
            )
            batch_size = x.shape[0]
            total_loss += float(loss.item()) * batch_size
            total_items += batch_size

            predicted = outputs[0].argmax(dim=-1)
            expected = policy.argmax(dim=-1)
            active = policy_mask > 0.5
            active_total += int(active.sum().item())
            top1 += int(((predicted == expected) & active).sum().item())
            top3 += int(
                (
                    outputs[0].topk(k=min(3, ACTION_COUNT), dim=-1).indices
                    == expected.unsqueeze(-1)
                ).any(dim=-1)[active].sum().item()
            )
            value_abs += float(torch.abs(outputs[1] - value).sum().item())
            board_pred = outputs[2].argmax(dim=-1)
            board_expected = target_board.argmax(dim=-1)
            board_correct += int((board_pred == board_expected).sum().item())
            board_total += int(board_pred.numel())

            top3_hits = (
                outputs[0].topk(k=min(3, ACTION_COUNT), dim=-1).indices
                == expected.unsqueeze(-1)
            ).any(dim=-1)
            value_abs_per = torch.abs(outputs[1] - value).sum(dim=-1)
            board_correct_per = (board_pred == board_expected).sum(dim=-1)
            board_total_per = torch.full_like(
                board_correct_per, board_pred.shape[-1], dtype=torch.long
            )
            for local_index, sample_index in enumerate(sample_indices):
                scenario_id = dataset.scenario_ids[int(sample_index)]
                bucket = scenario_buckets.setdefault(
                    scenario_id,
                    {
                        "items": 0.0,
                        "active_items": 0.0,
                        "policy_top1_hits": 0.0,
                        "policy_top3_hits": 0.0,
                        "value_abs": 0.0,
                        "target_correct": 0.0,
                        "target_total": 0.0,
                    },
                )
                bucket["items"] += 1.0
                if bool(active[local_index].item()):
                    bucket["active_items"] += 1.0
                    bucket["policy_top1_hits"] += float(
                        (predicted[local_index] == expected[local_index]).item()
                    )
                    bucket["policy_top3_hits"] += float(top3_hits[local_index].item())
                bucket["value_abs"] += float(value_abs_per[local_index].item())
                bucket["target_correct"] += float(board_correct_per[local_index].item())
                bucket["target_total"] += float(board_total_per[local_index].item())

    by_scenario = {}
    for scenario_id in sorted(scenario_buckets):
        bucket = scenario_buckets[scenario_id]
        by_scenario[scenario_id] = {
            "items": int(bucket["items"]),
            "active_items": int(bucket["active_items"]),
            "policy_top1": bucket["policy_top1_hits"]
            / max(1.0, bucket["active_items"]),
            "policy_top3": bucket["policy_top3_hits"]
            / max(1.0, bucket["active_items"]),
            "value_mae": bucket["value_abs"] / max(1.0, bucket["items"] * 4.0),
            "target_accuracy": bucket["target_correct"]
            / max(1.0, bucket["target_total"]),
        }

    denom = max(1, total_items)
    return Metrics(
        loss=total_loss / denom,
        policy_top1=top1 / max(1, active_total),
        policy_top3=top3 / max(1, active_total),
        value_mae=value_abs / max(1, total_items * 4),
        target_accuracy=board_correct / max(1, board_total),
        by_scenario=by_scenario,
    )


def export_onnx(model: nn.Module, output_path: str) -> None:
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    model.eval().cpu()
    dummy = torch.zeros((1, INPUT_DIM), dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        output_path,
        input_names=["state_features"],
        output_names=[
            "policy_logits",
            "value_vector",
            "target_board_logits",
            "target_clear_logits",
        ],
        dynamic_axes={
            "state_features": {0: "batch"},
            "policy_logits": {0: "batch"},
            "value_vector": {0: "batch"},
            "target_board_logits": {0: "batch"},
            "target_clear_logits": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
    )


def train(args: argparse.Namespace) -> None:
    set_seed(args.seed)
    device = (
        torch.device("cuda")
        if args.device == "auto" and torch.cuda.is_available()
        else torch.device("cpu" if args.device == "auto" else args.device)
    )

    train_ds = TeacherDataset(args.train, args.max_steps_norm)
    valid_ds = TeacherDataset(args.valid, args.max_steps_norm)
    test_ds = TeacherDataset(args.test, args.max_steps_norm)
    train_loader, sampling = make_train_loader(train_ds, args)
    valid_loader = DataLoader(valid_ds, batch_size=args.batch_size, shuffle=False)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False)

    model = PolicyValueTargetNet().to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay
    )
    best_score = -math.inf
    history = []

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        train_count = 0
        for batch in train_loader:
            batch = [item.to(device) for item in batch]
            optimizer.zero_grad()
            outputs = model(batch[0])
            loss, *_ = compute_losses(outputs, *batch[1:-1], args)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += float(loss.item()) * batch[0].shape[0]
            train_count += batch[0].shape[0]

        valid = evaluate(model, valid_loader, valid_ds, device, args)
        record = {
            "epoch": epoch,
            "train_loss": train_loss / max(1, train_count),
            "valid_loss": valid.loss,
            "valid_policy_top1": valid.policy_top1,
            "valid_policy_top3": valid.policy_top3,
            "valid_value_mae": valid.value_mae,
            "valid_target_accuracy": valid.target_accuracy,
            "valid_by_scenario": valid.by_scenario,
        }
        history.append(record)
        print(json.dumps(record, ensure_ascii=False))

        score = valid.policy_top3 + valid.target_accuracy * 0.25
        if score > best_score:
            best_score = score
            os.makedirs(os.path.dirname(args.checkpoint) or ".", exist_ok=True)
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "input_dim": INPUT_DIM,
                    "schema": "comboauto.teacher.policy-value-target.v1",
                    "history": history,
                    "args": vars(args),
                },
                args.checkpoint,
            )

    checkpoint = torch.load(args.checkpoint, map_location=device)
    model.load_state_dict(checkpoint["model_state"])
    valid = evaluate(model, valid_loader, valid_ds, device, args)
    test = evaluate(model, test_loader, test_ds, device, args)
    export_onnx(model, args.onnx)

    summary = {
        "schema": "comboauto.teacher.policy-value-target.v1",
        "input_dim": INPUT_DIM,
        "checkpoint": args.checkpoint,
        "onnx": args.onnx,
        "sampling": sampling,
        "datasets": {
            "train": dataset_summary(train_ds),
            "valid": dataset_summary(valid_ds),
            "test": dataset_summary(test_ds),
        },
        "valid": vars(valid),
        "test": vars(test),
        "history": history,
    }
    summary_path = os.path.splitext(args.checkpoint)[0] + ".summary.json"
    with open(summary_path, "w", encoding="utf-8") as stream:
        json.dump(summary, stream, ensure_ascii=False, indent=2)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", required=True)
    parser.add_argument("--valid", required=True)
    parser.add_argument("--test", required=True)
    parser.add_argument("--checkpoint", default="training_runs/policy_value_target.pt")
    parser.add_argument("--onnx", default="public/policy_value_target.onnx")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument(
        "--scenario-sampling",
        choices=["none", "balanced"],
        default="none",
        help="sampling policy for the training split",
    )
    parser.add_argument(
        "--scenario-balance-power",
        type=float,
        default=1.0,
        help="inverse-frequency exponent used by balanced scenario sampling",
    )
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--max-steps-norm", type=float, default=30.0)
    parser.add_argument("--policy-weight", type=float, default=1.0)
    parser.add_argument("--value-weight", type=float, default=1.0)
    parser.add_argument("--target-board-weight", type=float, default=0.35)
    parser.add_argument("--target-clear-weight", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    return parser


if __name__ == "__main__":
    train(build_parser().parse_args())
