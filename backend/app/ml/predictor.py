import numpy as np
import pandas as pd
import pickle
import os
import json
from typing import Optional, Dict, Any
import math

# Import optionnel de XGBoost
try:
    from xgboost import XGBRegressor
    XGBOOST_DISPONIBLE = True
except ImportError:
    XGBOOST_DISPONIBLE = False

from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

MODEL_PATH = "data/models/modele_froidai.pkl"
SCALER_PATH = "data/models/scaler_froidai.pkl"
METRIQUES_PATH = "data/models/metriques.json"


class PredicteurFroidAI:
    """Moteur de prédiction ML pour chambres froides et climatisation adiabatique."""

    def __init__(self):
        self.modele = None
        self.modele_cout = None
        self.scaler = None
        self.entraine = False
        self.metriques = {}
        os.makedirs("data/models", exist_ok=True)

    def _calculer_features(self, params: Dict) -> Dict:
        """Calcule les features dérivées à partir des paramètres bruts."""
        longueur = params.get("longueur", 0)
        largeur = params.get("largeur", 0)
        hauteur = params.get("hauteur", 0)
        temp_cible = params.get("temperature_cible", 4)
        temp_ext = params.get("temperature_exterieure", 35)
        humidite = params.get("humidite_relative", 60)
        type_projet = params.get("type_projet", "chambre_froide")

        surface = longueur * largeur
        volume = surface * hauteur
        delta_t = temp_ext - temp_cible
        type_code = 0 if type_projet == "chambre_froide" else 1

        # Coefficients thermiques standards
        k_paroi = 0.035  # W/m²K pour isolation polyuréthane 100mm
        surface_totale = 2 * (longueur * largeur + longueur * hauteur + largeur * hauteur)

        # Charge thermique de base
        charge_paroi = k_paroi * surface_totale * delta_t
        charge_infiltration = volume * 0.5 * 1.2 * 1005 * delta_t / 3600
        charge_interne = volume * 20  # Éclairage, personnel, machines

        charge_totale = params.get("charge_thermique") or (charge_paroi + charge_infiltration + charge_interne)

        return {
            "surface": surface,
            "volume": volume,
            "delta_t": delta_t,
            "type_code": type_code,
            "humidite": humidite,
            "charge_totale": charge_totale,
            "surface_totale": surface_totale,
            "ratio_s_v": surface / volume if volume > 0 else 0,
            "longueur": longueur,
            "largeur": largeur,
            "hauteur": hauteur,
        }

    def _prediction_physique(self, features: Dict, type_projet: str) -> Dict:
        """Prédiction basée sur des formules physiques et normes du secteur."""
        volume = features["volume"]
        surface = features["surface"]
        charge_totale = features["charge_totale"]
        delta_t = features["delta_t"]
        humidite = features["humidite"]

        if type_projet == "chambre_froide":
            # Débit d'air : basé sur le renouvellement d'air et le refroidissement
            debit_air = volume * 8  # 8 volumes/heure pour chambre froide standard

            # Nombre d'évaporateurs : 1 évaporateur pour 50-80 kW de charge
            puissance_evap = max(5000, charge_totale)  # min 5kW
            nb_evaporateurs = max(1, math.ceil(puissance_evap / 70000))

            # Nombre de condenseurs : généralement 1 par 2 évaporateurs
            nb_condenseurs = max(1, math.ceil(nb_evaporateurs / 2))

            # Unités adiabatiques = 0 pour chambre froide pure
            nb_unites = 0

            # Puissance totale
            cop = 2.5 if delta_t < 30 else 2.0
            puissance_totale = puissance_evap / cop / 1000  # kW

            # Coûts (TND)
            cout_evap = nb_evaporateurs * 8500
            cout_cond = nb_condenseurs * 12000
            cout_tuyauterie = volume * 45
            cout_equipements = cout_evap + cout_cond + cout_tuyauterie
            cout_installation = cout_equipements * 0.28

        else:  # adiabatique
            # Débit d'air : ventilation adiabatique intensive
            debit_air = surface * 50  # m³/h par m²

            # Unités adiabatiques : 1 unité pour 200-350 m³/h
            nb_unites = max(1, math.ceil(debit_air / 280))

            # Pas d'évaporateurs pour système purement adiabatique
            nb_evaporateurs = 0
            nb_condenseurs = max(1, math.ceil(nb_unites / 4))

            # Puissance : 0.15 kW par unité adiabatique (pompe eau)
            puissance_totale = nb_unites * 0.15 + nb_condenseurs * 3.5

            # Coûts (TND)
            cout_unite = nb_unites * 4500
            cout_cond = nb_condenseurs * 8000
            cout_installation_base = surface * 35
            cout_equipements = cout_unite + cout_cond + cout_installation_base
            cout_installation = cout_equipements * 0.22

        cout_total = cout_equipements + cout_installation

        return {
            "nb_unites_adiabatiques": nb_unites,
            "nb_evaporateurs": nb_evaporateurs if type_projet == "chambre_froide" else 0,
            "nb_condenseurs": nb_condenseurs,
            "debit_air": round(debit_air, 0),
            "puissance_totale": round(puissance_totale, 2),
            "charge_thermique": round(features["charge_totale"], 0),
            "cout_equipements": round(cout_equipements, 0),
            "cout_installation": round(cout_installation, 0),
            "cout_total": round(cout_total, 0),
        }

    def preparer_donnees(self, projets: list) -> tuple:
        """Prépare les données pour l'entraînement ML."""
        rows = []
        for p in projets:
            if not p.get("valide"):
                continue
            features = self._calculer_features(p)
            row = {
                **features,
                "nb_unites_adiabatiques": p.get("nb_unites_adiabatiques", 0) or 0,
                "nb_evaporateurs": p.get("nb_evaporateurs", 0) or 0,
                "nb_condenseurs": p.get("nb_condenseurs", 1) or 1,
                "debit_air": p.get("debit_air", 0) or 0,
                "puissance_totale": p.get("puissance_totale", 0) or 0,
                "cout_total": p.get("cout_total", 0) or 0,
            }
            rows.append(row)

        if not rows:
            return None, None

        df = pd.DataFrame(rows)
        feature_cols = ["surface", "volume", "delta_t", "type_code", "humidite",
                        "charge_totale", "surface_totale", "ratio_s_v", "longueur", "largeur", "hauteur"]

        X = df[feature_cols].fillna(0)
        y = df[["nb_unites_adiabatiques", "nb_evaporateurs", "nb_condenseurs",
                "debit_air", "puissance_totale", "cout_total"]]
        return X, y

    def entrainer(self, projets: list) -> Dict:
        """Entraîne le modèle ML sur les projets validés."""
        X, y = self.preparer_donnees(projets)

        if X is None or len(X) < 3:
            return {"succes": False, "message": f"Pas assez de données ({len(projets) if projets else 0} projets validés, minimum 3)"}

        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Choisir le meilleur algorithme disponible
        if XGBOOST_DISPONIBLE and len(X) >= 10:
            from xgboost import XGBRegressor
            self.modele = XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1,
                                       random_state=42, verbosity=0)
        else:
            self.modele = GradientBoostingRegressor(n_estimators=100, max_depth=4,
                                                     learning_rate=0.1, random_state=42)

        from sklearn.multioutput import MultiOutputRegressor
        self.modele = MultiOutputRegressor(self.modele)
        self.modele.fit(X_scaled, y)

        # Calculer métriques
        y_pred = self.modele.predict(X_scaled)
        metriques = {}
        for i, col in enumerate(y.columns):
            mae = mean_absolute_error(y.iloc[:, i], y_pred[:, i])
            r2 = r2_score(y.iloc[:, i], y_pred[:, i])
            metriques[col] = {"mae": round(mae, 3), "r2": round(r2, 3)}

        self.metriques = metriques
        self.entraine = True

        # Sauvegarder
        self.sauvegarder_modele()

        return {
            "succes": True,
            "message": f"Modèle entraîné avec {len(X)} projets",
            "nb_projets": len(X),
            "metriques": metriques
        }

    def predire(self, params: Dict) -> Dict:
        """Effectue une prédiction."""
        features = self._calculer_features(params)
        type_projet = params.get("type_projet", "chambre_froide")

        # Toujours faire la prédiction physique comme base
        prediction_physique = self._prediction_physique(features, type_projet)

        confiance = 0.70
        source = "physique"

        if self.entraine and self.modele is not None:
            try:
                feature_cols = ["surface", "volume", "delta_t", "type_code", "humidite",
                                "charge_totale", "surface_totale", "ratio_s_v", "longueur", "largeur", "hauteur"]
                X = pd.DataFrame([{col: features.get(col, 0) for col in feature_cols}])
                X_scaled = self.scaler.transform(X)
                y_pred = self.modele.predict(X_scaled)[0]

                prediction_ml = {
                    "nb_unites_adiabatiques": max(0, round(y_pred[0])),
                    "nb_evaporateurs": max(0, round(y_pred[1])),
                    "nb_condenseurs": max(1, round(y_pred[2])),
                    "debit_air": max(0, round(y_pred[3])),
                    "puissance_totale": max(0, round(y_pred[4], 2)),
                    "cout_total": max(0, round(y_pred[5])),
                }

                # Fusionner : 60% ML + 40% physique
                for key in ["nb_unites_adiabatiques", "nb_evaporateurs", "nb_condenseurs"]:
                    val = 0.6 * prediction_ml[key] + 0.4 * prediction_physique[key]
                    prediction_physique[key] = max(0, round(val))

                for key in ["debit_air", "puissance_totale"]:
                    prediction_physique[key] = round(
                        0.6 * prediction_ml[key] + 0.4 * prediction_physique[key], 2
                    )

                cout_ml = prediction_ml["cout_total"]
                cout_phys = prediction_physique["cout_total"]
                prediction_physique["cout_total"] = round(0.6 * cout_ml + 0.4 * cout_phys)
                prediction_physique["cout_equipements"] = round(prediction_physique["cout_total"] * 0.78)
                prediction_physique["cout_installation"] = round(prediction_physique["cout_total"] * 0.22)

                confiance = 0.88
                source = "ml+physique"
            except Exception as e:
                print(f"Erreur ML, utilisation physique: {e}")

        # Explications
        explications = {
            "source": source,
            "surface_m2": round(features["surface"], 1),
            "volume_m3": round(features["volume"], 1),
            "charge_thermique_kw": round(features["charge_totale"] / 1000, 2),
            "delta_temperature": round(features["delta_t"], 1),
            "methode": "Modèle ML (GBM) + Formules physiques" if source == "ml+physique" else "Formules physiques (normes EN 378)",
            "norme_appliquee": "EN 378, RT 2020, ASHRAE 15",
        }

        return {
            **prediction_physique,
            "confiance": confiance,
            "surface": round(features["surface"], 2),
            "volume": round(features["volume"], 2),
            "explications": explications,
        }

    def sauvegarder_modele(self):
        if self.modele:
            with open(MODEL_PATH, "wb") as f:
                pickle.dump(self.modele, f)
            with open(SCALER_PATH, "wb") as f:
                pickle.dump(self.scaler, f)
            with open(METRIQUES_PATH, "w") as f:
                json.dump(self.metriques, f)

    def charger_modele(self):
        try:
            if os.path.exists(MODEL_PATH) and os.path.exists(SCALER_PATH):
                with open(MODEL_PATH, "rb") as f:
                    self.modele = pickle.load(f)
                with open(SCALER_PATH, "rb") as f:
                    self.scaler = pickle.load(f)
                if os.path.exists(METRIQUES_PATH):
                    with open(METRIQUES_PATH, "r") as f:
                        self.metriques = json.load(f)
                self.entraine = True
                print("✅ Modèle ML chargé depuis le disque")
        except Exception as e:
            print(f"⚠️ Impossible de charger le modèle: {e}")


predictor = PredicteurFroidAI()
