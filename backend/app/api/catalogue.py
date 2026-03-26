from fastapi import APIRouter, HTTPException
from typing import Optional, List
from app.core.database import get_db
from app.ml.generateur import generateur
from app.ml.predictor import predictor

router = APIRouter()


@router.get("/")
def lister_catalogue(
    type_equipement: Optional[str] = None,
    gamme: Optional[str] = None,
    debit_min: Optional[float] = None,
    debit_max: Optional[float] = None,
):
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM catalogue_equipements WHERE 1=1"
    params = []
    if type_equipement:
        query += " AND type_equipement = ?"
        params.append(type_equipement)
    if gamme:
        query += " AND gamme = ?"
        params.append(gamme)
    if debit_min:
        query += " AND debit_air_nominal >= ?"
        params.append(debit_min)
    if debit_max:
        query += " AND debit_air_nominal <= ?"
        params.append(debit_max)
    query += " ORDER BY gamme, debit_air_nominal"
    cursor.execute(query, params)
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return items


@router.get("/types")
def types_equipements():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT type_equipement, gamme, fabricant FROM catalogue_equipements ORDER BY gamme")
    result = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return result


@router.get("/{reference}")
def detail_equipement(reference: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM catalogue_equipements WHERE reference = ?", (reference,))
    item = cursor.fetchone()
    conn.close()
    if not item:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    return dict(item)


@router.post("/stock/ajouter")
def ajouter_stock(data: dict):
    """Ajoute un équipement en stock personnel."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO stock_equipements
        (equipement_id, reference_catalogue, quantite, etat, localisation,
         date_acquisition, prix_achat, notes)
        VALUES (?,?,?,?,?,?,?,?)
    """, (
        data.get("equipement_id"),
        data.get("reference_catalogue"),
        data.get("quantite", 1),
        data.get("etat", "neuf"),
        data.get("localisation", ""),
        data.get("date_acquisition", ""),
        data.get("prix_achat"),
        data.get("notes", ""),
    ))
    stock_id = cursor.lastrowid

    # Marquer comme en stock dans le catalogue
    if data.get("reference_catalogue"):
        cursor.execute("""
            UPDATE catalogue_equipements
            SET en_stock = 1, quantite_stock = quantite_stock + ?
            WHERE reference = ?
        """, (data.get("quantite", 1), data.get("reference_catalogue")))

    conn.commit()
    conn.close()
    return {"id": stock_id, "message": "Équipement ajouté au stock"}


@router.get("/stock/liste")
def lister_stock():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.*, c.description, c.debit_air_nominal, c.puissance_refroidissement_standalone,
               c.puissance_electrique, c.type_equipement, c.gamme, c.fabricant,
               c.prix_indicatif_eur, c.surface_couverte_indicative
        FROM stock_equipements s
        LEFT JOIN catalogue_equipements c ON s.reference_catalogue = c.reference
        ORDER BY s.date_ajout DESC
    """)
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return items


@router.delete("/stock/{stock_id}")
def supprimer_stock(stock_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT reference_catalogue, quantite FROM stock_equipements WHERE id = ?", (stock_id,))
    item = cursor.fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Stock non trouvé")
    cursor.execute("DELETE FROM stock_equipements WHERE id = ?", (stock_id,))
    if item["reference_catalogue"]:
        cursor.execute("""
            UPDATE catalogue_equipements
            SET quantite_stock = MAX(0, quantite_stock - ?)
            WHERE reference = ?
        """, (item["quantite"], item["reference_catalogue"]))
    conn.commit()
    conn.close()
    return {"message": "Stock supprimé"}


@router.post("/generer-donnees")
def generer_donnees_synthetiques(data: dict):
    """Génère des données synthétiques pour l'entraînement ML."""
    n = min(data.get("nombre", 50), 500)
    type_projet = data.get("type_projet")  # None = mixte

    projets = generateur.generer_lot(n, type_projet)
    inseres = generateur.sauvegarder_en_base(projets)

    return {
        "generes": len(projets),
        "inseres": inseres,
        "message": f"{inseres} projets synthétiques ajoutés à la base",
        "apercu": projets[:3] if projets else []
    }


@router.post("/entrainer-auto")
def entrainer_auto():
    """Génère des données synthétiques et entraîne automatiquement."""
    from app.core.database import get_db as gdb

    # Compter projets existants
    conn = gdb()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as n FROM projets WHERE valide = 1")
    nb_existants = cursor.fetchone()["n"]
    conn.close()

    resultats = {"etapes": []}

    # Générer si insuffisant
    if nb_existants < 30:
        a_generer = 50 - nb_existants
        projets = generateur.generer_lot(a_generer)
        inseres = generateur.sauvegarder_en_base(projets)
        resultats["etapes"].append(f"✅ {inseres} projets synthétiques générés")
    else:
        resultats["etapes"].append(f"ℹ️ {nb_existants} projets disponibles — génération non nécessaire")

    # Entraîner le modèle
    conn = gdb()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projets WHERE valide = 1")
    projets_db = [dict(r) for r in cursor.fetchall()]
    conn.close()

    result = predictor.entrainer(projets_db)
    resultats["entrainement"] = result
    resultats["etapes"].append(f"✅ Modèle entraîné avec {result.get('nb_projets', 0)} projets")

    return resultats


@router.post("/recommander")
def recommander_equipements(data: dict):
    """Recommande les équipements du catalogue pour un projet donné."""
    type_projet = data.get("type_projet", "adiabatique")
    surface = data.get("surface", 0)
    debit_necessaire = data.get("debit_air", 0)
    budget_max = data.get("budget_max")

    conn = get_db()
    cursor = conn.cursor()

    if type_projet == "chambre_froide":
        types = ["evaporatif_direct", "adiabatique_iec"]
    else:
        types = ["adiabatique_iec", "adiabatique_supercool"]

    placeholders = ",".join("?" for _ in types)
    query = f"""
        SELECT *, en_stock, quantite_stock
        FROM catalogue_equipements
        WHERE type_equipement IN ({placeholders})
        ORDER BY debit_air_nominal ASC
    """
    cursor.execute(query, types)
    equipements = [dict(r) for r in cursor.fetchall()]
    conn.close()

    recommendations = []
    for eq in equipements:
        debit = eq.get("debit_air_nominal", 0) or 0
        if debit <= 0:
            continue

        nb_unites = max(1, int(math.ceil(debit_necessaire / debit))) if debit_necessaire > 0 else \
                    max(1, int(math.ceil(surface / (eq.get("surface_couverte_indicative") or 200))))

        cout_total = nb_unites * (eq.get("prix_indicatif_eur", 0) or 0) * 3.3
        cout_total *= 1.25  # installation

        if budget_max and cout_total > budget_max:
            continue

        recommendations.append({
            **eq,
            "nb_unites_recommande": nb_unites,
            "debit_total_m3h": round(nb_unites * debit),
            "puissance_totale_kw": round(nb_unites * (eq.get("puissance_electrique") or 0), 2),
            "cout_estime_tnd": round(cout_total),
            "en_stock": eq.get("en_stock", 0),
            "score": (eq.get("cop_standalone") or 1) * (1 + 0.3 * eq.get("en_stock", 0)),
        })

    recommendations.sort(key=lambda x: -x["score"])
    return recommendations[:6]


import math
