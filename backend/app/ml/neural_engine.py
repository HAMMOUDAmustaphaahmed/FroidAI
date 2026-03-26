"""
Moteur de réseau de neurones complet — FroidAI v2.0
Implémente toutes les couches et fonctionnalités standards d'un réseau de prédiction :
  - Input → BatchNorm → Dense(ReLU)+Dropout → Dense(ReLU)+Dropout → Output(Linear)
  - Preprocessing : normalisation, split train/val/test, gestion valeurs manquantes
  - Training : epochs, backpropagation, Adam optimizer, early stopping
  - Evaluation : RMSE, MAE, R², MSE par variable
  - Inference : prédiction sur nouvelles données
  - Persistence : sauvegarde/chargement modèle
  - Monitoring : détection drift, historique métriques
"""

import numpy as np
import pandas as pd
import pickle
import json
import os
import time
import math
from typing import Dict, List, Optional, Tuple
from datetime import datetime

# ─── Imports ML ───────────────────────────────────────────────────────────────
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.impute import SimpleImputer

# Essayer PyTorch d'abord, sinon numpy pur
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, TensorDataset
    TORCH_DISPONIBLE = True
except ImportError:
    TORCH_DISPONIBLE = False

# Essayer scikit-learn MLP
from sklearn.neural_network import MLPRegressor
from sklearn.multioutput import MultiOutputRegressor

PATHS = {
    "model":   "data/models/nn_froidai.pkl",
    "scaler_x": "data/models/nn_scaler_x.pkl",
    "scaler_y": "data/models/nn_scaler_y.pkl",
    "imputer":  "data/models/nn_imputer.pkl",
    "config":   "data/models/nn_config.json",
    "history":  "data/models/nn_history.json",
    "drift":    "data/models/drift_stats.json",
}

# ─── Architecture PyTorch ─────────────────────────────────────────────────────
if TORCH_DISPONIBLE:
    class FroidAINet(nn.Module):
        """
        Réseau de neurones dense avec :
          Input(n_features)
          → BatchNorm1d
          → Linear(128) → ReLU → Dropout(0.2) → BatchNorm1d
          → Linear(64)  → ReLU → Dropout(0.15)
          → Linear(32)  → ReLU
          → Linear(n_outputs)  [linéaire = régression]
        """
        def __init__(self, n_input: int, n_output: int, hidden: List[int] = None,
                     dropout_rates: List[float] = None):
            super().__init__()
            if hidden is None:
                hidden = [128, 64, 32]
            if dropout_rates is None:
                dropout_rates = [0.20, 0.15, 0.0]

            layers = []
            # BatchNorm sur les entrées
            layers.append(nn.BatchNorm1d(n_input))

            prev = n_input
            for i, (h, dr) in enumerate(zip(hidden, dropout_rates)):
                layers.append(nn.Linear(prev, h))
                layers.append(nn.ReLU())
                if dr > 0:
                    layers.append(nn.Dropout(dr))
                layers.append(nn.BatchNorm1d(h))
                prev = h

            # Couche de sortie — linéaire pour la régression
            layers.append(nn.Linear(prev, n_output))

            self.network = nn.Sequential(*layers)

            # Initialisation Xavier pour meilleure convergence
            self._init_weights()

        def _init_weights(self):
            for m in self.modules():
                if isinstance(m, nn.Linear):
                    nn.init.xavier_uniform_(m.weight)
                    nn.init.zeros_(m.bias)

        def forward(self, x):
            return self.network(x)

        def get_layer_info(self):
            """Retourne la structure des couches pour la visualisation."""
            info = []
            for name, module in self.named_modules():
                if isinstance(module, (nn.Linear, nn.BatchNorm1d, nn.ReLU, nn.Dropout)):
                    info.append({
                        "type": type(module).__name__,
                        "name": name,
                        "params": {
                            k: str(v) for k, v in module.__dict__.items()
                            if not k.startswith('_') and not callable(v)
                        }
                    })
            return info


# ─── Moteur d'entraînement principal ─────────────────────────────────────────
class MoteurNeuralFroidAI:
    """Pipeline ML complet pour FroidAI."""

    FEATURES = [
        "surface", "volume", "delta_t", "type_code", "humidite",
        "charge_totale", "surface_totale", "ratio_s_v",
        "longueur", "largeur", "hauteur"
    ]

    TARGETS = [
        "nb_unites_adiabatiques", "nb_evaporateurs", "nb_condenseurs",
        "debit_air", "puissance_totale", "cout_total"
    ]

    TARGET_LABELS = {
        "nb_unites_adiabatiques": "Unités adiabatiques",
        "nb_evaporateurs": "Évaporateurs",
        "nb_condenseurs": "Condenseurs",
        "debit_air": "Débit air (m³/h)",
        "puissance_totale": "Puissance (kW)",
        "cout_total": "Coût total (TND)",
    }

    def __init__(self):
        self.model = None
        self.scaler_x = None
        self.scaler_y = None
        self.imputer = None
        self.entraine = False
        self.config = {}
        self.history = {
            "train_loss": [], "val_loss": [],
            "train_mae": [], "val_mae": [],
            "train_r2": [], "val_r2": [],
            "epochs": [], "timestamps": [],
        }
        self.metriques_finales = {}
        self.drift_stats = {}
        self.n_input = len(self.FEATURES)
        self.n_output = len(self.TARGETS)
        os.makedirs("data/models", exist_ok=True)

    # ── Preprocessing ─────────────────────────────────────────────────────────
    def _extraire_features(self, projets: List[Dict]) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Extrait et prépare les features/targets depuis les projets."""
        rows = []
        for p in projets:
            if not p.get("valide"):
                continue
            lon = p.get("longueur") or 0
            lar = p.get("largeur") or 0
            hau = p.get("hauteur") or 0
            t_cible = p.get("temperature_cible") or 20
            t_ext   = p.get("temperature_exterieure") or 35
            surf = (lon * lar) if lon and lar else (p.get("surface") or 0)
            vol  = surf * hau if hau else (p.get("volume") or 0)
            delta_t = t_ext - t_cible
            type_code = 0 if p.get("type_projet") == "chambre_froide" else 1
            surf_tot = 2 * (lon*lar + lon*hau + lar*hau) if all([lon, lar, hau]) else surf * 4
            charge = p.get("charge_thermique") or (surf_tot * 0.035 * delta_t + vol * 20)
            rows.append({
                "surface": surf, "volume": vol, "delta_t": delta_t,
                "type_code": type_code, "humidite": p.get("humidite_relative") or 60,
                "charge_totale": charge, "surface_totale": surf_tot,
                "ratio_s_v": surf / vol if vol > 0 else 0,
                "longueur": lon, "largeur": lar, "hauteur": hau,
                "nb_unites_adiabatiques": p.get("nb_unites_adiabatiques") or 0,
                "nb_evaporateurs": p.get("nb_evaporateurs") or 0,
                "nb_condenseurs": p.get("nb_condenseurs") or 1,
                "debit_air": p.get("debit_air") or 0,
                "puissance_totale": p.get("puissance_totale") or 0,
                "cout_total": p.get("cout_total") or 0,
            })
        if not rows:
            return None, None
        df = pd.DataFrame(rows)
        X = df[self.FEATURES]
        y = df[self.TARGETS]
        return X, y

    def _preprocess(self, X: pd.DataFrame, y: pd.DataFrame = None, fit: bool = False):
        """
        Préprocessing standard :
        1. Imputation valeurs manquantes (médiane)
        2. Normalisation features (StandardScaler)
        3. Normalisation targets (MinMaxScaler → [0,1])
        """
        if fit:
            self.imputer  = SimpleImputer(strategy="median")
            self.scaler_x = StandardScaler()
            self.scaler_y = MinMaxScaler()

        X_imp = self.imputer.transform(X) if not fit else self.imputer.fit_transform(X)
        X_sc  = self.scaler_x.transform(X_imp) if not fit else self.scaler_x.fit_transform(X_imp)

        if y is not None:
            y_arr = y.values.astype(float)
            y_sc  = self.scaler_y.transform(y_arr) if not fit else self.scaler_y.fit_transform(y_arr)
            return X_sc, y_sc
        return X_sc

    # ── Entraînement PyTorch ──────────────────────────────────────────────────
    def _entrainer_pytorch(self, X_train, y_train, X_val, y_val, config: Dict):
        """Entraînement avec PyTorch : epochs, Adam, EarlyStopping."""
        epochs        = config.get("epochs", 150)
        lr            = config.get("learning_rate", 0.001)
        batch_size    = config.get("batch_size", 32)
        patience      = config.get("patience", 20)
        hidden        = config.get("hidden_layers", [128, 64, 32])
        dropout_rates = config.get("dropout_rates", [0.20, 0.15, 0.0])

        # Tenseurs
        Xt = torch.FloatTensor(X_train)
        yt = torch.FloatTensor(y_train)
        Xv = torch.FloatTensor(X_val)
        yv = torch.FloatTensor(y_val)

        dataset = TensorDataset(Xt, yt)
        loader  = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        net = FroidAINet(self.n_input, self.n_output, hidden, dropout_rates)
        optimizer = optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=10, factor=0.5)
        criterion = nn.MSELoss()

        history = {"train_loss": [], "val_loss": [], "train_mae": [], "val_mae": [], "lr": []}
        best_val_loss = float('inf')
        best_state    = None
        patience_cnt  = 0

        for epoch in range(epochs):
            # ─ Train
            net.train()
            batch_losses = []
            for Xb, yb in loader:
                optimizer.zero_grad()
                pred = net(Xb)
                loss = criterion(pred, yb)
                loss.backward()
                nn.utils.clip_grad_norm_(net.parameters(), 1.0)
                optimizer.step()
                batch_losses.append(loss.item())

            train_loss = np.mean(batch_losses)

            # ─ Validation
            net.eval()
            with torch.no_grad():
                val_pred = net(Xv).numpy()
                val_loss = criterion(torch.FloatTensor(val_pred), yv).item()
                train_pred_full = net(Xt).numpy()

            # MAE en espace original
            y_train_orig = self.scaler_y.inverse_transform(y_train)
            y_val_orig   = self.scaler_y.inverse_transform(y_val)
            train_pred_o = self.scaler_y.inverse_transform(train_pred_full)
            val_pred_o   = self.scaler_y.inverse_transform(val_pred)
            train_mae = mean_absolute_error(y_train_orig, train_pred_o)
            val_mae   = mean_absolute_error(y_val_orig, val_pred_o)

            history["train_loss"].append(round(train_loss, 5))
            history["val_loss"].append(round(val_loss, 5))
            history["train_mae"].append(round(train_mae, 2))
            history["val_mae"].append(round(val_mae, 2))
            history["lr"].append(optimizer.param_groups[0]["lr"])

            scheduler.step(val_loss)

            # Early stopping
            if val_loss < best_val_loss - 1e-5:
                best_val_loss = val_loss
                best_state    = {k: v.clone() for k, v in net.state_dict().items()}
                patience_cnt  = 0
            else:
                patience_cnt += 1
                if patience_cnt >= patience:
                    print(f"Early stopping à l'epoch {epoch+1}")
                    break

        if best_state:
            net.load_state_dict(best_state)

        return net, history

    # ── Entraînement sklearn MLP (fallback) ──────────────────────────────────
    def _entrainer_sklearn(self, X_train, y_train, X_val, y_val, config: Dict):
        """Fallback sklearn MLPRegressor si PyTorch non disponible."""
        hidden = config.get("hidden_layers", [128, 64, 32])
        epochs = config.get("epochs", 150)
        lr     = config.get("learning_rate", 0.001)

        mlp = MLPRegressor(
            hidden_layer_sizes=tuple(hidden),
            activation="relu",
            solver="adam",
            alpha=1e-4,           # L2 regularization
            batch_size=32,
            learning_rate_init=lr,
            max_iter=epochs,
            early_stopping=True,
            validation_fraction=0.15,
            n_iter_no_change=20,
            random_state=42,
            verbose=False,
        )

        history = {"train_loss": [], "val_loss": [], "train_mae": [], "val_mae": [], "lr": []}

        # Entraîner par blocs de 10 epochs pour capter la courbe
        bloc = max(10, epochs // 20)
        for step in range(0, epochs, bloc):
            mlp.max_iter = step + bloc
            mlp.warm_start = (step > 0)
            try:
                mlp.fit(X_train, y_train)
            except Exception:
                pass

            # Métriques
            try:
                p_train = self.scaler_y.inverse_transform(mlp.predict(X_train))
                p_val   = self.scaler_y.inverse_transform(mlp.predict(X_val))
                y_t_o   = self.scaler_y.inverse_transform(y_train)
                y_v_o   = self.scaler_y.inverse_transform(y_val)
                tl = mean_squared_error(y_t_o, p_train)
                vl = mean_squared_error(y_v_o, p_val)
                history["train_loss"].append(round(tl, 2))
                history["val_loss"].append(round(vl, 2))
                history["train_mae"].append(round(mean_absolute_error(y_t_o, p_train), 2))
                history["val_mae"].append(round(mean_absolute_error(y_v_o, p_val), 2))
                history["lr"].append(lr)
            except Exception:
                pass

        return mlp, history

    # ── API publique — Entraînement ───────────────────────────────────────────
    def entrainer(self, projets: List[Dict], config: Dict = None) -> Dict:
        """Pipeline complet d'entraînement."""
        if config is None:
            config = {}

        cfg = {
            "epochs":        config.get("epochs", 150),
            "learning_rate": config.get("learning_rate", 0.001),
            "batch_size":    config.get("batch_size", 32),
            "patience":      config.get("patience", 20),
            "hidden_layers": config.get("hidden_layers", [128, 64, 32]),
            "dropout_rates": config.get("dropout_rates", [0.20, 0.15, 0.0]),
            "test_size":     config.get("test_size", 0.15),
            "val_size":      config.get("val_size", 0.15),
            "backend":       "pytorch" if TORCH_DISPONIBLE else "sklearn",
        }
        self.config = cfg

        # 1. Extraction features
        X, y = self._extraire_features(projets)
        if X is None or len(X) < 5:
            return {"succes": False, "message": f"Données insuffisantes ({len(projets)} projets, minimum 5)"}

        # 2. Split train / val / test
        X_tv, X_test, y_tv, y_test = train_test_split(
            X, y, test_size=cfg["test_size"], random_state=42
        )
        val_ratio = cfg["val_size"] / (1 - cfg["test_size"])
        X_train, X_val, y_train, y_val = train_test_split(
            X_tv, y_tv, test_size=val_ratio, random_state=42
        )

        # 3. Preprocessing
        X_train_sc, y_train_sc = self._preprocess(X_train, y_train, fit=True)
        X_val_sc,   y_val_sc   = self._preprocess(X_val,   y_val,   fit=False)
        X_test_sc              = self._preprocess(X_test,            fit=False)

        # 4. Entraînement
        t0 = time.time()
        if TORCH_DISPONIBLE:
            model, history = self._entrainer_pytorch(X_train_sc, y_train_sc, X_val_sc, y_val_sc, cfg)
        else:
            model, history = self._entrainer_sklearn(X_train_sc, y_train_sc, X_val_sc, y_val_sc, cfg)
        duree = round(time.time() - t0, 2)

        self.model = model

        # 5. Évaluation sur le test set
        metriques = self._evaluer(X_test_sc, y_test.values, "test")
        metriques_train = self._evaluer(X_train_sc, y_train.values, "train")
        metriques_val   = self._evaluer(X_val_sc,   y_val.values,   "val")

        # 6. Historique
        nb_epochs_reels = len(history["train_loss"])
        self.history = {
            "train_loss": history["train_loss"],
            "val_loss":   history["val_loss"],
            "train_mae":  history["train_mae"],
            "val_mae":    history["val_mae"],
            "lr":         history.get("lr", []),
            "epochs":     list(range(1, nb_epochs_reels + 1)),
            "timestamps": [datetime.now().isoformat()],
        }

        self.metriques_finales = {
            "test":  metriques,
            "train": metriques_train,
            "val":   metriques_val,
        }

        # 7. Stats drift (baseline)
        self.drift_stats = {
            "mean_X": X.mean().to_dict(),
            "std_X":  X.std().to_dict(),
            "mean_y": y.mean().to_dict(),
            "nb_projets": len(X),
            "date": datetime.now().isoformat(),
        }

        self.entraine = True
        cfg["n_input"] = self.n_input
        cfg["n_output"] = self.n_output

        # 8. Persistance
        self._sauvegarder()

        return {
            "succes": True,
            "backend": cfg["backend"],
            "nb_projets": len(X),
            "nb_train": len(X_train),
            "nb_val": len(X_val),
            "nb_test": len(X_test),
            "nb_epochs_reels": nb_epochs_reels,
            "duree_secondes": duree,
            "metriques": metriques,
            "metriques_train": metriques_train,
            "metriques_val": metriques_val,
            "history": self.history,
            "config": cfg,
            "architecture": self._describe_architecture(cfg),
        }

    def _evaluer(self, X_sc, y_orig, split_name: str) -> Dict:
        """Évalue le modèle : RMSE, MAE, R² par variable."""
        try:
            y_pred_sc = self._predire_raw(X_sc)
            y_pred    = self.scaler_y.inverse_transform(y_pred_sc)

            metriques = {}
            for i, col in enumerate(self.TARGETS):
                yt = y_orig[:, i]
                yp = y_pred[:, i]
                mae  = round(float(mean_absolute_error(yt, yp)), 3)
                rmse = round(float(np.sqrt(mean_squared_error(yt, yp))), 3)
                r2   = round(float(r2_score(yt, yp)), 4)
                metriques[col] = {
                    "mae": mae, "rmse": rmse, "r2": r2,
                    "label": self.TARGET_LABELS[col]
                }
            # Global
            mae_g  = round(float(mean_absolute_error(y_orig, y_pred)), 3)
            rmse_g = round(float(np.sqrt(mean_squared_error(y_orig, y_pred))), 3)
            r2_g   = round(float(r2_score(y_orig, y_pred)), 4)
            metriques["_global"] = {"mae": mae_g, "rmse": rmse_g, "r2": r2_g}
            return metriques
        except Exception as e:
            return {"_error": str(e)}

    def _predire_raw(self, X_sc) -> np.ndarray:
        if TORCH_DISPONIBLE and isinstance(self.model, FroidAINet if TORCH_DISPONIBLE else type(None)):
            self.model.eval()
            with torch.no_grad():
                t = torch.FloatTensor(X_sc)
                return self.model(t).numpy()
        else:
            return self.model.predict(X_sc)

    # ── API publique — Prédiction ─────────────────────────────────────────────
    def predire(self, params: Dict) -> Dict:
        """Prédiction sur de nouvelles données."""
        from app.ml.predictor import predictor as pred_physique

        # Toujours base physique
        result_physique = pred_physique.predire(params)

        if not self.entraine:
            return {**result_physique, "source": "physique", "confiance": 0.70}

        try:
            lon = params.get("longueur", 0)
            lar = params.get("largeur", 0)
            hau = params.get("hauteur", 0)
            t_cible = params.get("temperature_cible", 20)
            t_ext   = params.get("temperature_exterieure", 35)
            surf    = lon * lar
            vol     = surf * hau
            delta_t = t_ext - t_cible
            type_c  = 0 if params.get("type_projet") == "chambre_froide" else 1
            surf_t  = 2 * (lon*lar + lon*hau + lar*hau)
            charge  = params.get("charge_thermique") or (surf_t * 0.035 * delta_t + vol * 20)

            row = pd.DataFrame([{
                "surface": surf, "volume": vol, "delta_t": delta_t,
                "type_code": type_c, "humidite": params.get("humidite_relative", 60),
                "charge_totale": charge, "surface_totale": surf_t,
                "ratio_s_v": surf / vol if vol > 0 else 0,
                "longueur": lon, "largeur": lar, "hauteur": hau,
            }])

            X_sc   = self._preprocess(row, fit=False)
            y_sc   = self._predire_raw(X_sc)
            y_pred = self.scaler_y.inverse_transform(y_sc)[0]

            result_nn = {
                "nb_unites_adiabatiques": max(0, round(float(y_pred[0]))),
                "nb_evaporateurs":        max(0, round(float(y_pred[1]))),
                "nb_condenseurs":         max(1, round(float(y_pred[2]))),
                "debit_air":              max(0, round(float(y_pred[3]))),
                "puissance_totale":       max(0, round(float(y_pred[4]), 2)),
                "cout_total":             max(0, round(float(y_pred[5]))),
            }

            # Fusion 65% NN + 35% physique
            fused = {}
            for k in ["nb_unites_adiabatiques", "nb_evaporateurs", "nb_condenseurs"]:
                v = 0.65 * result_nn[k] + 0.35 * result_physique.get(k, 0)
                fused[k] = max(0, round(v))
            for k in ["debit_air", "puissance_totale"]:
                v = 0.65 * result_nn[k] + 0.35 * result_physique.get(k, 0)
                fused[k] = max(0, round(v, 2))
            ct = 0.65 * result_nn["cout_total"] + 0.35 * result_physique.get("cout_total", 0)
            fused["cout_total"] = max(0, round(ct))
            fused["cout_equipements"] = round(fused["cout_total"] * 0.78)
            fused["cout_installation"] = round(fused["cout_total"] * 0.22)

            return {
                **result_physique,
                **fused,
                "charge_thermique": result_physique.get("charge_thermique", charge),
                "surface": round(surf, 2),
                "volume":  round(vol, 2),
                "confiance": 0.92,
                "source": "neural_network+physique",
                "explications": {
                    **result_physique.get("explications", {}),
                    "methode": "Réseau de neurones (PyTorch/Dense) + Formules physiques EN 378",
                    "architecture": f"Dense {self.config.get('hidden_layers', [])}",
                    "backend": self.config.get("backend", "sklearn"),
                    "source": "neural_network+physique",
                }
            }
        except Exception as e:
            print(f"Erreur NN, fallback physique: {e}")
            return {**result_physique, "source": "physique", "confiance": 0.70}

    # ── Détection de drift ────────────────────────────────────────────────────
    def detecter_drift(self, nouveaux_projets: List[Dict]) -> Dict:
        """Détecte si les nouvelles données dérivent par rapport à la baseline."""
        if not self.drift_stats:
            return {"drift_detecte": False, "message": "Pas de baseline disponible"}

        X_new, _ = self._extraire_features(nouveaux_projets)
        if X_new is None:
            return {"drift_detecte": False}

        drift_par_feature = {}
        detecte = False
        for col in self.FEATURES:
            if col not in X_new.columns:
                continue
            baseline_mean = self.drift_stats["mean_X"].get(col, 0)
            baseline_std  = self.drift_stats["std_X"].get(col, 1) or 1
            new_mean = float(X_new[col].mean())
            z_score = abs((new_mean - baseline_mean) / baseline_std)
            drift_par_feature[col] = {
                "baseline_mean": round(baseline_mean, 3),
                "new_mean":      round(new_mean, 3),
                "z_score":       round(z_score, 3),
                "drift":         z_score > 2.0,
            }
            if z_score > 2.0:
                detecte = True

        return {
            "drift_detecte": detecte,
            "drift_par_feature": drift_par_feature,
            "nb_nouveaux": len(X_new),
            "recommande_reentrainement": detecte,
        }

    # ── Architecture description ──────────────────────────────────────────────
    def _describe_architecture(self, cfg: Dict) -> List[Dict]:
        """Décrit l'architecture pour la visualisation."""
        hidden = cfg.get("hidden_layers", [128, 64, 32])
        dropout = cfg.get("dropout_rates", [0.20, 0.15, 0.0])
        arch = [
            {
                "index": 0, "type": "Input",
                "neurones": self.n_input,
                "activation": "—",
                "description": f"{self.n_input} features d'entrée",
                "color": "#22d3ee",
                "params": f"Features: {', '.join(self.FEATURES)}"
            },
            {
                "index": 1, "type": "BatchNorm1d",
                "neurones": self.n_input,
                "activation": "—",
                "description": "Normalisation par batch",
                "color": "#94a3b8",
                "params": f"num_features={self.n_input}"
            },
        ]
        for i, (h, dr) in enumerate(zip(hidden, dropout)):
            arch.append({
                "index": i + 2, "type": "Dense",
                "neurones": h,
                "activation": "ReLU",
                "description": f"Couche Dense cachée {i+1}",
                "color": "#3b82f6",
                "params": f"in={hidden[i-1] if i > 0 else self.n_input}, out={h}"
            })
            if dr > 0:
                arch.append({
                    "index": i + 2.5, "type": "Dropout",
                    "neurones": h,
                    "activation": "—",
                    "description": f"Régularisation {int(dr*100)}%",
                    "color": "#f97316",
                    "params": f"p={dr}"
                })
            arch.append({
                "index": i + 2.8, "type": "BatchNorm1d",
                "neurones": h,
                "activation": "—",
                "description": "Normalisation couche",
                "color": "#94a3b8",
                "params": f"num_features={h}"
            })
        arch.append({
            "index": len(arch), "type": "Output",
            "neurones": self.n_output,
            "activation": "Linear",
            "description": f"{self.n_output} variables prédites",
            "color": "#4ade80",
            "params": f"Sorties: {', '.join(self.TARGET_LABELS.values())}"
        })
        return arch

    # ── Persistance ───────────────────────────────────────────────────────────
    def _sauvegarder(self):
        try:
            with open(PATHS["model"],    "wb") as f: pickle.dump(self.model, f)
            with open(PATHS["scaler_x"], "wb") as f: pickle.dump(self.scaler_x, f)
            with open(PATHS["scaler_y"], "wb") as f: pickle.dump(self.scaler_y, f)
            with open(PATHS["imputer"],  "wb") as f: pickle.dump(self.imputer, f)
            with open(PATHS["config"],   "w")  as f: json.dump(self.config, f)
            with open(PATHS["history"],  "w")  as f: json.dump(self.history, f)
            with open(PATHS["drift"],    "w")  as f: json.dump(self.drift_stats, f)
            print("✅ Modèle NN sauvegardé")
        except Exception as e:
            print(f"Erreur sauvegarde NN: {e}")

    def charger(self):
        try:
            for path in PATHS.values():
                if not os.path.exists(path):
                    return False
            with open(PATHS["model"],    "rb") as f: self.model    = pickle.load(f)
            with open(PATHS["scaler_x"], "rb") as f: self.scaler_x = pickle.load(f)
            with open(PATHS["scaler_y"], "rb") as f: self.scaler_y = pickle.load(f)
            with open(PATHS["imputer"],  "rb") as f: self.imputer  = pickle.load(f)
            with open(PATHS["config"],   "r")  as f: self.config   = json.load(f)
            with open(PATHS["history"],  "r")  as f: self.history  = json.load(f)
            with open(PATHS["drift"],    "r")  as f: self.drift_stats = json.load(f)
            self.entraine = True
            print(f"✅ Modèle NN chargé ({self.config.get('backend', '?')})")
            return True
        except Exception as e:
            print(f"⚠️ Impossible de charger NN: {e}")
            return False


# Singleton
moteur_nn = MoteurNeuralFroidAI()
