"""
LSTMPredictor — next-step sensor forecaster.

Uses PyTorch when available; falls back to a per-feature AR(1) model
implemented in pure NumPy so the module always works without a GPU.
"""
import logging
import pickle
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

_DEFAULT_PATH = Path(__file__).parent.parent / "data" / "lstm_model.pkl"

# ── Optional PyTorch ──────────────────────────────────────────────────────────
try:
    import torch
    import torch.nn as nn
    _TORCH = True
except ImportError:
    _TORCH = False
    logger.info("PyTorch not found — LSTMPredictor will use NumPy AR(1) fallback")


# ── PyTorch network (only defined when torch is present) ─────────────────────
if _TORCH:
    class _LSTMNet(nn.Module):
        def __init__(self, input_dim: int, hidden_dim: int,
                     num_layers: int, output_dim: int) -> None:
            super().__init__()
            self.lstm = nn.LSTM(
                input_dim, hidden_dim, num_layers,
                batch_first=True,
                dropout=0.1 if num_layers > 1 else 0.0,
            )
            self.fc = nn.Linear(hidden_dim, output_dim)

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            out, _ = self.lstm(x)           # (batch, seq, hidden)
            return self.fc(out[:, -1, :])   # predict from last timestep


# ── NumPy AR(1) fallback ──────────────────────────────────────────────────────
class _ARModel:
    """Per-feature AR(1): x̂[t+1] = α·x[t] + β"""

    def __init__(self) -> None:
        self._alpha: Optional[np.ndarray] = None
        self._beta:  Optional[np.ndarray] = None

    def fit(self, X: np.ndarray) -> None:
        if len(X) < 2:
            return
        x0, x1 = X[:-1], X[1:]
        var0     = np.var(x0, axis=0)
        cov01    = np.mean((x0 - x0.mean(0)) * (x1 - x1.mean(0)), axis=0)
        self._alpha = np.where(var0 > 1e-8, cov01 / (var0 + 1e-8), np.zeros_like(var0))
        self._beta  = x1.mean(0) - self._alpha * x0.mean(0)

    def predict(self, x_last: np.ndarray) -> np.ndarray:
        if self._alpha is None:
            return x_last.copy()
        return self._alpha * x_last + self._beta


# ── Public API ────────────────────────────────────────────────────────────────
class LSTMPredictor:
    """
    Predicts the next sensor reading given a sequence of past readings.
    Uses PyTorch LSTM when available, NumPy AR(1) otherwise.
    """

    def __init__(
        self,
        input_dim:  int   = 5,
        hidden_dim: int   = 64,
        num_layers: int   = 2,
        seq_len:    int   = 20,
        lr:         float = 1e-3,
    ) -> None:
        self._input_dim  = input_dim
        self._hidden_dim = hidden_dim
        self._num_layers = num_layers
        self._seq_len    = seq_len
        self._fitted     = False

        if _TORCH:
            self._net          = _LSTMNet(input_dim, hidden_dim, num_layers, input_dim)
            self._opt          = torch.optim.Adam(self._net.parameters(), lr=lr)
            self._loss_fn      = nn.MSELoss()
            self._scaler_mean: Optional[np.ndarray] = None
            self._scaler_std:  Optional[np.ndarray] = None
        else:
            self._ar = _ARModel()

    # ── Training ──────────────────────────────────────────────────────────────

    def fit(self, X: np.ndarray, epochs: int = 50) -> List[float]:
        """
        Parameters
        ----------
        X      : (n_samples, n_features) time-series array
        epochs : training iterations (ignored for AR fallback)

        Returns list of per-epoch losses (empty for AR fallback).
        """
        if not _TORCH:
            self._ar.fit(X)
            self._fitted = True
            logger.info("AR(1) model fitted on %d samples", len(X))
            return []

        self._scaler_mean = X.mean(axis=0).astype(np.float32)
        std               = X.std(axis=0).astype(np.float32)
        self._scaler_std  = np.where(std > 1e-8, std, np.ones_like(std))
        Xn = ((X - self._scaler_mean) / self._scaler_std).astype(np.float32)

        seqs, targets = [], []
        for i in range(len(Xn) - self._seq_len):
            seqs.append(Xn[i: i + self._seq_len])
            targets.append(Xn[i + self._seq_len])
        if not seqs:
            logger.warning("Not enough samples (%d) for seq_len=%d", len(X), self._seq_len)
            return []

        Xt = torch.from_numpy(np.array(seqs))
        yt = torch.from_numpy(np.array(targets))

        self._net.train()
        losses = []
        for epoch in range(epochs):
            self._opt.zero_grad()
            loss = self._loss_fn(self._net(Xt), yt)
            loss.backward()
            self._opt.step()
            losses.append(float(loss))
            if epoch % 10 == 0:
                logger.info("LSTM epoch %3d  loss=%.6f", epoch, float(loss))

        self._fitted = True
        logger.info("LSTM training complete. Final loss: %.6f", losses[-1])
        return losses

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict_next(self, sequence: np.ndarray) -> Tuple[Optional[np.ndarray], float]:
        """
        Parameters
        ----------
        sequence : (seq_len, n_features)  most-recent readings, oldest-first

        Returns
        -------
        predicted_next   : np.ndarray (n_features,) in original units, or None
        prediction_error : float  mean absolute error vs last known value (proxy)
        """
        if not self._fitted:
            return None, 0.0

        if not _TORCH:
            pred  = self._ar.predict(sequence[-1])
            error = float(np.mean(np.abs(pred - sequence[-1])))
            return pred, error

        if len(sequence) < self._seq_len:
            return None, 0.0

        raw  = sequence[-self._seq_len:].astype(np.float32)
        norm = (raw - self._scaler_mean) / self._scaler_std
        inp  = torch.from_numpy(norm[np.newaxis])

        self._net.eval()
        with torch.no_grad():
            pred_norm = self._net(inp).numpy()[0]

        pred  = pred_norm * self._scaler_std + self._scaler_mean
        error = float(np.mean(np.abs(pred - sequence[-1])))
        return pred, error

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: Path = _DEFAULT_PATH) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if _TORCH:
            torch.save({
                "net_state": self._net.state_dict(),
                "mean": self._scaler_mean,
                "std":  self._scaler_std,
                "config": {
                    "input_dim":  self._input_dim,
                    "hidden_dim": self._hidden_dim,
                    "num_layers": self._num_layers,
                    "seq_len":    self._seq_len,
                },
            }, path)
        else:
            with open(path, "wb") as fh:
                pickle.dump(self._ar, fh)
        logger.info("LSTMPredictor saved → %s", path)

    def load(self, path: Path = _DEFAULT_PATH) -> bool:
        path = Path(path)
        if not path.exists():
            logger.warning("Model file not found: %s", path)
            return False
        if _TORCH:
            ck  = torch.load(path, map_location="cpu")
            cfg = ck["config"]
            self._net = _LSTMNet(
                cfg["input_dim"], cfg["hidden_dim"],
                cfg["num_layers"], cfg["input_dim"],
            )
            self._net.load_state_dict(ck["net_state"])
            self._scaler_mean = ck["mean"]
            self._scaler_std  = ck["std"]
            self._seq_len     = cfg["seq_len"]
        else:
            with open(path, "rb") as fh:
                self._ar = pickle.load(fh)
        self._fitted = True
        logger.info("LSTMPredictor loaded ← %s", path)
        return True

    @property
    def is_fitted(self) -> bool:
        return self._fitted

    @property
    def seq_len(self) -> int:
        return self._seq_len
