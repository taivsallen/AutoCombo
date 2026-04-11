import argparse
import json
import math
import os
import random
from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def orb_of(v: int) -> int:
    if v < 0:
        return -1
    return v % 10


def mode_to_one_hot(mode: str) -> List[float]:
    mode = (mode or "combo").lower()
    return [
        1.0 if mode == "combo" else 0.0,
        1.0 if mode == "vertical" else 0.0,
        1.0 if mode == "horizontal" else 0.0,
    ]


def cell_to_bucket(v: int) -> int:
    if v < 0:
        return 6  # hole
    o = orb_of(v)
    if 0 <= o <= 5:
        return o
    return 6


def one_hot(index: int, size: int) -> np.ndarray:
    out = np.zeros(size, dtype=np.float32)
    if 0 <= index < size:
        out[index] = 1.0
    return out


def encode_sample(sample: Dict, max_steps_norm: float) -> np.ndarray:
    board = sample.get("board_with_hole") or sample.get("board_filled")
    if not isinstance(board, list) or len(board) != 36:
        raise ValueError("board_with_hole/board_filled must be length 36")

    board_feat = np.zeros((36, 7), dtype=np.float32)
    for i, v in enumerate(board):
        bucket = cell_to_bucket(int(v))
        board_feat[i, bucket] = 1.0
    board_feat = board_feat.reshape(-1)

    held = int(sample.get("held", -1))
    held_feat = one_hot(held if 0 <= held <= 5 else -1, 6)

    cursor = sample.get("cursor") or [-1, -1]
    hole = sample.get("hole") or [-1, -1]
    cursor_r = float(cursor[0]) / 5.0 if isinstance(cursor, list) and len(cursor) == 2 else -0.2
    cursor_c = float(cursor[1]) / 5.0 if isinstance(cursor, list) and len(cursor) == 2 else -0.2
    hole_r = float(hole[0]) / 5.0 if isinstance(hole, list) and len(hole) == 2 else -0.2
    hole_c = float(hole[1]) / 5.0 if isinstance(hole, list) and len(hole) == 2 else -0.2

    steps_left = float(sample.get("steps_left", 0.0)) / max_steps_norm
    steps_used = float(sample.get("steps_used", 0.0)) / max_steps_norm
    target = float(sample.get("target", 0.0)) / 20.0
    mode_feat = np.array(mode_to_one_hot(sample.get("mode", "combo")), dtype=np.float32)
    flags = np.array(
        [
            1.0 if sample.get("skyfall", False) else 0.0,
            1.0 if sample.get("diagonal", False) else 0.0,
        ],
        dtype=np.float32,
    )

    extra = np.array(
        [
            cursor_r,
            cursor_c,
            hole_r,
            hole_c,
            steps_left,
            steps_used,
            target,
        ],
        dtype=np.float32,
    )

    return np.concatenate([board_feat, held_feat, mode_feat, flags, extra]).astype(
        np.float32
    )


def parse_label_score(sample: Dict, label_scale: float) -> float:
    if isinstance(sample.get("label"), dict):
        score = float(sample["label"].get("score", 0.0))
    else:
        score = float(sample.get("label_score", 0.0))
    return score / label_scale


class TeacherValueDataset(Dataset):
    def __init__(
        self,
        jsonl_path: str,
        max_steps_norm: float = 30.0,
        label_scale: float = 1_000_000.0,
    ):
        if not os.path.exists(jsonl_path):
            raise FileNotFoundError(f"dataset not found: {jsonl_path}")

        xs: List[np.ndarray] = []
        ys: List[float] = []
        with open(jsonl_path, "r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    xs.append(encode_sample(obj, max_steps_norm=max_steps_norm))
                    ys.append(parse_label_score(obj, label_scale=label_scale))
                except Exception as err:
                    raise ValueError(f"bad sample at {jsonl_path}:{line_no}: {err}") from err

        self.x = np.stack(xs).astype(np.float32)
        self.y = np.array(ys, dtype=np.float32).reshape(-1, 1)

    def __len__(self) -> int:
        return int(self.x.shape[0])

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return torch.from_numpy(self.x[idx]), torch.from_numpy(self.y[idx])


class ValueMLP(nn.Module):
    def __init__(self, input_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(0.1),
            nn.Linear(256, 256),
            nn.LayerNorm(256),
            nn.SiLU(),
            nn.Dropout(0.1),
            nn.Linear(256, 128),
            nn.SiLU(),
            nn.Linear(128, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def rankdata(x: np.ndarray) -> np.ndarray:
    order = np.argsort(x, kind="mergesort")
    ranks = np.empty_like(order, dtype=np.float64)
    ranks[order] = np.arange(len(x), dtype=np.float64)

    sorted_x = x[order]
    i = 0
    while i < len(sorted_x):
        j = i + 1
        while j < len(sorted_x) and sorted_x[j] == sorted_x[i]:
            j += 1
        if j - i > 1:
            avg = (i + j - 1) / 2.0
            ranks[order[i:j]] = avg
        i = j
    return ranks


def pearson_corr(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) == 0:
        return 0.0
    a = a.astype(np.float64)
    b = b.astype(np.float64)
    am = a.mean()
    bm = b.mean()
    av = a - am
    bv = b - bm
    den = math.sqrt(float((av * av).sum() * (bv * bv).sum()))
    if den <= 1e-12:
        return 0.0
    return float((av * bv).sum() / den)


def spearman_corr(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return pearson_corr(rankdata(y_true), rankdata(y_pred))


def kendall_tau_b(y_true: np.ndarray, y_pred: np.ndarray, max_samples: int = 2000) -> float:
    n = len(y_true)
    if n <= 1:
        return 0.0

    if n > max_samples:
        rng = np.random.default_rng(123)
        idx = rng.choice(n, size=max_samples, replace=False)
        y_true = y_true[idx]
        y_pred = y_pred[idx]
        n = max_samples

    concordant = 0
    discordant = 0
    tie_x = 0
    tie_y = 0

    for i in range(n - 1):
        dx = y_true[i] - y_true[i + 1 :]
        dy = y_pred[i] - y_pred[i + 1 :]

        sx = np.sign(dx)
        sy = np.sign(dy)
        prod = sx * sy

        concordant += int(np.sum(prod > 0))
        discordant += int(np.sum(prod < 0))
        tie_x += int(np.sum((sx == 0) & (sy != 0)))
        tie_y += int(np.sum((sy == 0) & (sx != 0)))

    num = concordant - discordant
    den = math.sqrt((concordant + discordant + tie_x) * (concordant + discordant + tie_y))
    if den <= 1e-12:
        return 0.0
    return float(num / den)


@dataclass
class EvalMetrics:
    loss: float
    mse: float
    mae: float
    spearman: float
    kendall: float


def evaluate_model(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    max_rank_samples: int,
) -> EvalMetrics:
    model.eval()
    total_loss = 0.0
    total_mse = 0.0
    total_mae = 0.0
    total_count = 0

    preds_all: List[np.ndarray] = []
    labels_all: List[np.ndarray] = []

    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            y = y.to(device)
            pred = model(x)
            loss = criterion(pred, y)

            bs = x.shape[0]
            total_loss += float(loss.item()) * bs
            total_mse += float(torch.mean((pred - y) ** 2).item()) * bs
            total_mae += float(torch.mean(torch.abs(pred - y)).item()) * bs
            total_count += bs

            preds_all.append(pred.detach().cpu().numpy().reshape(-1))
            labels_all.append(y.detach().cpu().numpy().reshape(-1))

    preds = np.concatenate(preds_all) if preds_all else np.zeros(0, dtype=np.float32)
    labels = np.concatenate(labels_all) if labels_all else np.zeros(0, dtype=np.float32)

    if len(preds) > max_rank_samples:
        idx = np.random.default_rng(123).choice(len(preds), size=max_rank_samples, replace=False)
        rank_preds = preds[idx]
        rank_labels = labels[idx]
    else:
        rank_preds = preds
        rank_labels = labels

    spearman = spearman_corr(rank_labels, rank_preds)
    kendall = kendall_tau_b(rank_labels, rank_preds, max_samples=max_rank_samples)

    denom = max(1, total_count)
    return EvalMetrics(
        loss=total_loss / denom,
        mse=total_mse / denom,
        mae=total_mae / denom,
        spearman=spearman,
        kendall=kendall,
    )


def train(args: argparse.Namespace) -> None:
    set_seed(args.seed)
    device = (
        torch.device("cuda")
        if torch.cuda.is_available() and args.device == "auto"
        else torch.device(args.device if args.device != "auto" else "cpu")
    )

    train_ds = TeacherValueDataset(
        args.train,
        max_steps_norm=args.max_steps_norm,
        label_scale=args.label_scale,
    )
    valid_ds = TeacherValueDataset(
        args.valid,
        max_steps_norm=args.max_steps_norm,
        label_scale=args.label_scale,
    )
    test_ds = TeacherValueDataset(
        args.test,
        max_steps_norm=args.max_steps_norm,
        label_scale=args.label_scale,
    )

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
        drop_last=False,
    )
    valid_loader = DataLoader(
        valid_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
        drop_last=False,
    )
    test_loader = DataLoader(
        test_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
        drop_last=False,
    )

    input_dim = int(train_ds.x.shape[1])
    model = ValueMLP(input_dim).to(device)
    criterion = nn.SmoothL1Loss(beta=args.huber_beta)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )

    best_spearman = -1e9
    best_epoch = -1
    bad_epochs = 0
    history = []

    print(f"[train] device={device}, input_dim={input_dim}")
    print(
        f"[train] train={len(train_ds)} valid={len(valid_ds)} test={len(test_ds)} "
        f"batch={args.batch_size}"
    )

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_train_loss = 0.0
        total_count = 0

        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)
            optimizer.zero_grad()
            pred = model(x)
            loss = criterion(pred, y)
            loss.backward()
            optimizer.step()

            bs = x.shape[0]
            total_train_loss += float(loss.item()) * bs
            total_count += bs

        train_loss = total_train_loss / max(1, total_count)
        val = evaluate_model(
            model=model,
            loader=valid_loader,
            criterion=criterion,
            device=device,
            max_rank_samples=args.max_rank_samples,
        )

        rec = {
            "epoch": epoch,
            "train_loss": train_loss,
            "val_loss": val.loss,
            "val_mse": val.mse,
            "val_mae": val.mae,
            "val_spearman": val.spearman,
            "val_kendall": val.kendall,
        }
        history.append(rec)

        print(
            f"[epoch {epoch:03d}] train_loss={train_loss:.6f} "
            f"val_loss={val.loss:.6f} val_spear={val.spearman:.4f} val_kend={val.kendall:.4f}"
        )

        if val.spearman > best_spearman:
            best_spearman = val.spearman
            best_epoch = epoch
            bad_epochs = 0
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "input_dim": input_dim,
                    "args": vars(args),
                    "best_epoch": best_epoch,
                    "best_val_spearman": best_spearman,
                    "history": history,
                },
                args.model_out,
            )
            print(f"[checkpoint] saved: {args.model_out}")
        else:
            bad_epochs += 1

        if bad_epochs >= args.patience:
            print(f"[early-stop] no improvement for {args.patience} epochs")
            break

    if not os.path.exists(args.model_out):
        raise RuntimeError("no checkpoint saved")

    ckpt = torch.load(args.model_out, map_location=device)
    model.load_state_dict(ckpt["model_state"])

    val_best = evaluate_model(
        model=model,
        loader=valid_loader,
        criterion=criterion,
        device=device,
        max_rank_samples=args.max_rank_samples,
    )
    test_best = evaluate_model(
        model=model,
        loader=test_loader,
        criterion=criterion,
        device=device,
        max_rank_samples=args.max_rank_samples,
    )

    summary = {
        "best_epoch": best_epoch,
        "best_val_spearman": best_spearman,
        "valid": {
            "loss": val_best.loss,
            "mse": val_best.mse,
            "mae": val_best.mae,
            "spearman": val_best.spearman,
            "kendall": val_best.kendall,
        },
        "test": {
            "loss": test_best.loss,
            "mse": test_best.mse,
            "mae": test_best.mae,
            "spearman": test_best.spearman,
            "kendall": test_best.kendall,
        },
    }

    summary_path = os.path.splitext(args.model_out)[0] + ".summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("[done] summary:")
    print(json.dumps(summary, indent=2))
    print(f"[done] summary file: {summary_path}")


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Train value model on teacher-labeled states.")
    p.add_argument("--train", type=str, required=True, help="Train JSONL path")
    p.add_argument("--valid", type=str, required=True, help="Valid JSONL path")
    p.add_argument("--test", type=str, required=True, help="Test JSONL path")
    p.add_argument("--model-out", type=str, default="value_mlp.pt", help="Output checkpoint path")

    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch-size", type=int, default=1024)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--huber-beta", type=float, default=0.5)
    p.add_argument("--patience", type=int, default=6)

    p.add_argument("--max-steps-norm", type=float, default=30.0)
    p.add_argument("--label-scale", type=float, default=1_000_000.0)
    p.add_argument("--max-rank-samples", type=int, default=3000)
    p.add_argument("--num-workers", type=int, default=0)
    p.add_argument("--seed", type=int, default=12345)
    p.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda"])
    return p


if __name__ == "__main__":
    train(build_arg_parser().parse_args())
