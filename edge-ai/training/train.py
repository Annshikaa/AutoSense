"""
Generates synthetic training data and trains both models.

Usage (from edge-ai/ directory):
    python -m training.train
    python training/train.py
"""
import logging
import sys
from pathlib import Path

import numpy as np

# Allow running as a script from the edge-ai/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.isolation_forest import IsolationForestDetector
from models.lstm_model import LSTMPredictor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR      = Path(__file__).parent.parent / "data"
N_NORMAL      = 5_000
N_FAULT       = 250        # ~5% contamination — matches IsolationForest default
SEQ_LEN       = 20
LSTM_EPOCHS   = 50
RANDOM_SEED   = 42


# ── Synthetic data generators ─────────────────────────────────────────────────

def _normal_sample(rng: np.random.Generator) -> np.ndarray:
    """One reading from a healthy vehicle."""
    rpm   = rng.uniform(800, 4000)
    speed = float(np.clip(rpm * 0.028 + rng.normal(0, 0.5), 0, 120))
    temp  = rng.uniform(85, 95)
    thr   = rng.uniform(0, 100)
    bat   = rng.uniform(12.0, 14.5)
    return np.array([rpm, speed, temp, thr, bat], dtype=np.float32)


def _fault_sample(rng: np.random.Generator) -> np.ndarray:
    """One reading with a randomly chosen fault injected."""
    s     = _normal_sample(rng)
    fault = rng.integers(0, 5)
    if   fault == 0: s[0] = rng.uniform(6500, 7500)   # RPM spike
    elif fault == 1: s[1] = rng.uniform(-1, 1)         # speed=0 mismatch
    elif fault == 2: s[2] = rng.uniform(120, 140)      # temperature spike
    elif fault == 3: s[3] = rng.uniform(98, 101)       # throttle stuck
    else:            s[4] = rng.uniform(9.5, 11.0)     # battery drop
    return s


def generate_dataset(rng: np.random.Generator) -> np.ndarray:
    normal = np.stack([_normal_sample(rng) for _ in range(N_NORMAL)])
    fault  = np.stack([_fault_sample(rng)  for _ in range(N_FAULT)])
    X      = np.vstack([normal, fault])
    rng.shuffle(X)
    return X, normal   # return normal-only subset for LSTM


def save_csv(X: np.ndarray) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "training_data.csv"
    np.savetxt(
        path, X,
        delimiter=",",
        header="rpm,speed,temperature,throttle,battery",
        comments="",
    )
    logger.info("Training data saved → %s  (%d rows)", path, len(X))


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    rng = np.random.default_rng(RANDOM_SEED)

    logger.info("Generating %d normal + %d fault samples …", N_NORMAL, N_FAULT)
    X, X_normal = generate_dataset(rng)
    save_csv(X)

    # ── Isolation Forest ──────────────────────────────────────────────────────
    logger.info("─── Training IsolationForest ───")
    if_det = IsolationForestDetector(n_estimators=150, contamination=0.05)
    if_det.fit(X)
    if_det.save()

    # Self-test
    n_vec = _normal_sample(rng)
    f_vec = _fault_sample(rng)
    is_a_n, sc_n = if_det.predict(n_vec)
    is_a_f, sc_f = if_det.predict(f_vec)
    logger.info("Self-test  normal → anomaly=%-5s  score=%+.4f", is_a_n, sc_n)
    logger.info("Self-test  fault  → anomaly=%-5s  score=%+.4f", is_a_f, sc_f)

    # ── LSTM ──────────────────────────────────────────────────────────────────
    logger.info("─── Training LSTM predictor (seq_len=%d, epochs=%d) ───",
                SEQ_LEN, LSTM_EPOCHS)
    lstm = LSTMPredictor(seq_len=SEQ_LEN)
    losses = lstm.fit(X_normal, epochs=LSTM_EPOCHS)
    lstm.save()

    if losses:
        logger.info("LSTM final loss: %.6f", losses[-1])
    else:
        logger.info("LSTM (AR fallback) fitted")

    logger.info("═══ Training complete. Models saved to %s ═══", DATA_DIR)


if __name__ == "__main__":
    main()
