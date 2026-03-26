from fastapi import APIRouter, HTTPException
import json
import os

from app.core.database import get_db
from app.ml.predictor import predictor

router = APIRouter()

METRIQUES_PATH = "data/models/metriques.json"


@router.post("/entrainer")
def entrainer_modele():
    """Entraîne le modèle ML avec tous les projets validés."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM projets WHERE valide = 1")
    projets = [dict(row) for row in cursor.fetchall()]
    conn.close()

    if not projets:
        raise HTTPException(status_code=422, detail="Aucun projet validé disponible pour l'entraînement")

    resultat = predictor.entrainer(projets)

    if resultat["succes"]:
        # Sauvegarder métriques en base
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO metriques_modele (version, nb_projets_entrainement, mae, rmse, r2)
            VALUES (?, ?, ?, ?, ?)
        """, (
            "v1.0",
            resultat["nb_projets"],
            0,  # Global MAE à calculer
            0,
            0
        ))
        conn.commit()
        conn.close()

    return resultat


@router.get("/statut")
def statut_modele():
    """Retourne l'état actuel du modèle ML."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as total FROM projets WHERE valide = 1")
    nb_projets = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as total FROM corrections")
    nb_corrections = cursor.fetchone()["total"]

    cursor.execute("""
        SELECT * FROM metriques_modele ORDER BY date_entrainement DESC LIMIT 1
    """)
    derniere_metrique = cursor.fetchone()
    conn.close()

    metriques_fichier = {}
    if os.path.exists(METRIQUES_PATH):
        with open(METRIQUES_PATH, "r") as f:
            metriques_fichier = json.load(f)

    return {
        "modele_entraine": predictor.entraine,
        "nb_projets_disponibles": nb_projets,
        "nb_corrections": nb_corrections,
        "metriques": metriques_fichier,
        "derniere_session": dict(derniere_metrique) if derniere_metrique else None,
        "algorithme": "XGBoost + GradientBoosting" if predictor.entraine else "Formules physiques (EN 378)",
        "pret_a_entrainer": nb_projets >= 3,
    }


@router.get("/metriques")
def obtenir_metriques():
    """Retourne les métriques détaillées du modèle."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM metriques_modele ORDER BY date_entrainement DESC LIMIT 10
    """)
    historique = [dict(row) for row in cursor.fetchall()]
    conn.close()

    metriques_courantes = predictor.metriques

    return {
        "metriques_courantes": metriques_courantes,
        "historique": historique,
    }


@router.get("/corrections")
def lister_corrections(limite: int = 50):
    """Liste les corrections enregistrées par les utilisateurs."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT c.*, p.nom as projet_nom
        FROM corrections c
        LEFT JOIN projets p ON c.projet_id = p.id
        ORDER BY c.date_correction DESC
        LIMIT ?
    """, (limite,))

    corrections = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return corrections


@router.delete("/reinitialiser")
def reinitialiser_modele():
    """Réinitialise le modèle ML (supprime les fichiers entraînés)."""
    try:
        for chemin in ["data/models/modele_froidai.pkl", "data/models/scaler_froidai.pkl", "data/models/metriques.json"]:
            if os.path.exists(chemin):
                os.remove(chemin)

        predictor.modele = None
        predictor.scaler = None
        predictor.entraine = False
        predictor.metriques = {}

        return {"message": "Modèle réinitialisé. Les prédictions utiliseront les formules physiques."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
