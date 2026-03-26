from fastapi import APIRouter, HTTPException
from typing import List
import json
from datetime import datetime

from app.core.database import get_db
from app.schemas.schemas import ParametresPrediction, ResultatPrediction, CorrectionPrediction
from app.ml.predictor import predictor

router = APIRouter()


@router.post("/", response_model=dict)
def predire(params: ParametresPrediction):
    """Effectue une prédiction basée sur les paramètres fournis."""
    try:
        params_dict = params.dict()
        resultat = predictor.predire(params_dict)

        # Sauvegarder dans l'historique
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO historique_predictions (parametres_entree, prediction, confiance)
            VALUES (?, ?, ?)
        """, (
            json.dumps(params_dict),
            json.dumps(resultat),
            resultat.get("confiance", 0)
        ))
        pred_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return {**resultat, "prediction_id": pred_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de prédiction: {str(e)}")


@router.post("/valider/{prediction_id}")
def valider_prediction(prediction_id: int):
    """Valide une prédiction (l'utilisateur confirme qu'elle est correcte)."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM historique_predictions WHERE id = ?", (prediction_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Prédiction non trouvée")

    cursor.execute(
        "UPDATE historique_predictions SET validee = 1 WHERE id = ?",
        (prediction_id,)
    )
    conn.commit()
    conn.close()

    return {"message": "Prédiction validée avec succès"}


@router.post("/corriger")
def corriger_prediction(correction: CorrectionPrediction):
    """Enregistre une correction de prédiction pour le self-learning."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO corrections (projet_id, champ, prediction_originale, valeur_corrigee, commentaire)
        VALUES (?, ?, ?, ?, ?)
    """, (
        correction.projet_id,
        correction.champ,
        correction.valeur_originale,
        correction.valeur_corrigee,
        correction.commentaire
    ))

    conn.commit()
    conn.close()

    return {"message": "Correction enregistrée. Merci pour votre retour !"}


@router.get("/historique")
def historique_predictions(limite: int = 20):
    """Retourne l'historique des prédictions."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, parametres_entree, prediction, confiance, validee, date_prediction
        FROM historique_predictions
        ORDER BY date_prediction DESC
        LIMIT ?
    """, (limite,))

    historique = []
    for row in cursor.fetchall():
        item = dict(row)
        try:
            item["parametres_entree"] = json.loads(item["parametres_entree"])
            item["prediction"] = json.loads(item["prediction"])
        except:
            pass
        historique.append(item)

    conn.close()
    return historique


@router.post("/sauvegarder-comme-projet")
def sauvegarder_comme_projet(data: dict):
    """Sauvegarde une prédiction validée comme projet dans la base."""
    conn = get_db()
    cursor = conn.cursor()

    params = data.get("parametres", {})
    prediction = data.get("prediction", {})
    nom = data.get("nom", f"Projet {datetime.now().strftime('%d/%m/%Y %H:%M')}")

    surface = params.get("longueur", 0) * params.get("largeur", 0)
    volume = surface * params.get("hauteur", 0)

    cursor.execute("""
        INSERT INTO projets (nom, description, type_projet, longueur, largeur, hauteur,
            surface, volume, temperature_cible, temperature_exterieure, debit_air,
            charge_thermique, humidite_relative, nb_unites_adiabatiques, nb_evaporateurs,
            nb_condenseurs, puissance_totale, cout_equipements, cout_installation, cout_total,
            source_donnees, valide, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        nom,
        data.get("description", "Projet créé depuis une prédiction"),
        params.get("type_projet", "chambre_froide"),
        params.get("longueur"), params.get("largeur"), params.get("hauteur"),
        surface, volume,
        params.get("temperature_cible"), params.get("temperature_exterieure"),
        prediction.get("debit_air"), prediction.get("charge_thermique"),
        params.get("humidite_relative"),
        prediction.get("nb_unites_adiabatiques"), prediction.get("nb_evaporateurs"),
        prediction.get("nb_condenseurs"), prediction.get("puissance_totale"),
        prediction.get("cout_equipements"), prediction.get("cout_installation"),
        prediction.get("cout_total"),
        "prediction", None, 1, data.get("notes", "")
    ))

    projet_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"id": projet_id, "message": "Projet sauvegardé depuis la prédiction"}
