from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Optional
import json
import os

from app.core.database import get_db
from app.ml.neural_engine import moteur_nn, PATHS
from app.ml.generateur import generateur

router = APIRouter()

# État global de l'entraînement (pour le streaming de progression)
_etat_entrainement = {
    "en_cours": False,
    "progression": 0,
    "etapes": [],
    "resultats": None,
    "erreur": None,
}


def _charger_projets():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projets WHERE valide = 1")
    projets = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return projets


@router.get("/statut")
def statut_neural():
    """Statut complet du réseau de neurones."""
    history = {}
    if os.path.exists(PATHS["history"]):
        with open(PATHS["history"]) as f:
            history = json.load(f)

    config = {}
    if os.path.exists(PATHS["config"]):
        with open(PATHS["config"]) as f:
            config = json.load(f)

    drift = {}
    if os.path.exists(PATHS["drift"]):
        with open(PATHS["drift"]) as f:
            drift = json.load(f)

    projets = _charger_projets()

    return {
        "entraine":           moteur_nn.entraine,
        "backend":            config.get("backend", "—"),
        "architecture":       config.get("hidden_layers", []),
        "dropout_rates":      config.get("dropout_rates", []),
        "nb_projets_dispo":   len(projets),
        "nb_epochs_reels":    len(history.get("train_loss", [])),
        "config":             config,
        "metriques":          moteur_nn.metriques_finales,
        "history":            history,
        "drift_stats":        drift,
        "etat_entrainement":  _etat_entrainement,
        "torch_disponible":   _check_torch(),
        "pret":               len(projets) >= 5,
    }


def _check_torch():
    try:
        import torch
        return True
    except ImportError:
        return False


@router.post("/entrainer")
async def entrainer_neural(config: dict = {}, background_tasks: BackgroundTasks = None):
    """Lance l'entraînement du réseau de neurones."""
    global _etat_entrainement

    projets = _charger_projets()
    if len(projets) < 5:
        raise HTTPException(
            status_code=422,
            detail=f"Pas assez de projets validés ({len(projets)}/5 minimum)"
        )

    # Entraîner directement (pas de background pour avoir le résultat)
    _etat_entrainement = {"en_cours": True, "progression": 10, "etapes": ["Préparation des données..."], "resultats": None, "erreur": None}

    try:
        result = moteur_nn.entrainer(projets, config)
        _etat_entrainement = {
            "en_cours": False, "progression": 100,
            "etapes": [f"✅ Terminé — {result.get('nb_epochs_reels', 0)} epochs"],
            "resultats": result, "erreur": None,
        }
        return result
    except Exception as e:
        _etat_entrainement["en_cours"] = False
        _etat_entrainement["erreur"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/entrainer-avec-generation")
async def entrainer_avec_generation(data: dict = {}):
    """Génère des données synthétiques puis entraîne le réseau."""
    global _etat_entrainement
    _etat_entrainement = {"en_cours": True, "progression": 5, "etapes": [], "resultats": None, "erreur": None}

    try:
        # 1. Générer données
        nb_generer = data.get("nb_generer", 80)
        type_projet = data.get("type_projet")
        config_nn   = data.get("config", {})

        _etat_entrainement["etapes"].append(f"Génération de {nb_generer} projets synthétiques...")
        _etat_entrainement["progression"] = 15

        projets_gen = generateur.generer_lot(nb_generer, type_projet)
        inseres = generateur.sauvegarder_en_base(projets_gen)
        _etat_entrainement["etapes"].append(f"✅ {inseres} projets synthétiques générés")
        _etat_entrainement["progression"] = 35

        # 2. Charger tous les projets
        projets = _charger_projets()
        _etat_entrainement["etapes"].append(f"📊 {len(projets)} projets validés disponibles")
        _etat_entrainement["progression"] = 45

        # 3. Entraîner
        _etat_entrainement["etapes"].append("🧠 Entraînement du réseau de neurones...")
        _etat_entrainement["progression"] = 50

        result = moteur_nn.entrainer(projets, config_nn)
        _etat_entrainement["progression"] = 100
        _etat_entrainement["etapes"].append(
            f"✅ Entraînement terminé — {result.get('nb_epochs_reels')} epochs, "
            f"R² global: {result.get('metriques', {}).get('_global', {}).get('r2', '?')}"
        )
        _etat_entrainement["resultats"] = result
        _etat_entrainement["en_cours"] = False

        return {
            "generes": inseres,
            "total_projets": len(projets),
            "entrainement": result,
        }
    except Exception as e:
        _etat_entrainement["en_cours"] = False
        _etat_entrainement["erreur"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predire")
def predire_neural(params: dict):
    """Prédiction via le réseau de neurones."""
    if not moteur_nn.entraine:
        raise HTTPException(status_code=422, detail="Le réseau n'est pas encore entraîné")
    try:
        return moteur_nn.predire(params)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/architecture")
def get_architecture():
    """Retourne la description détaillée de l'architecture."""
    if not moteur_nn.config:
        return {"couches": moteur_nn._describe_architecture({
            "hidden_layers": [128, 64, 32],
            "dropout_rates": [0.20, 0.15, 0.0],
        }), "config": {}}
    return {
        "couches": moteur_nn._describe_architecture(moteur_nn.config),
        "config": moteur_nn.config,
        "n_input": moteur_nn.n_input,
        "n_output": moteur_nn.n_output,
        "features": moteur_nn.FEATURES,
        "targets": moteur_nn.TARGETS,
        "torch_disponible": _check_torch(),
    }


@router.get("/courbes")
def get_courbes():
    """Retourne les courbes d'apprentissage."""
    if not os.path.exists(PATHS["history"]):
        return {"history": {}, "message": "Pas encore entraîné"}
    with open(PATHS["history"]) as f:
        history = json.load(f)

    # Formater pour recharts
    train_loss = history.get("train_loss", [])
    val_loss   = history.get("val_loss",   [])
    train_mae  = history.get("train_mae",  [])
    val_mae    = history.get("val_mae",    [])
    lr         = history.get("lr",         [])

    courbes = []
    for i in range(len(train_loss)):
        point = {
            "epoch":      i + 1,
            "train_loss": round(train_loss[i], 5) if i < len(train_loss) else None,
            "val_loss":   round(val_loss[i],   5) if i < len(val_loss)   else None,
            "train_mae":  round(train_mae[i],  3) if i < len(train_mae)  else None,
            "val_mae":    round(val_mae[i],    3) if i < len(val_mae)    else None,
            "lr":         round(lr[i], 6)          if i < len(lr)        else None,
        }
        courbes.append(point)

    return {
        "courbes": courbes,
        "nb_epochs": len(courbes),
        "metriques_finales": moteur_nn.metriques_finales,
    }


@router.post("/drift")
def detecter_drift():
    """Détecte si les données récentes dérivent par rapport à la baseline."""
    projets_recents = _charger_projets()[-20:]  # 20 derniers projets
    return moteur_nn.detecter_drift(projets_recents)


@router.delete("/reinitialiser")
def reinitialiser_neural():
    """Supprime le modèle NN entraîné."""
    for path in PATHS.values():
        if os.path.exists(path):
            os.remove(path)
    moteur_nn.model = None
    moteur_nn.entraine = False
    moteur_nn.metriques_finales = {}
    moteur_nn.history = {}
    moteur_nn.config = {}
    return {"message": "Réseau de neurones réinitialisé"}
