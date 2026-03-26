from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import json
from datetime import datetime

from app.core.database import get_db
from app.schemas.schemas import Projet, ProjetCreate, ProjetUpdate

router = APIRouter()


@router.get("/", response_model=List[dict])
def lister_projets(
    type_projet: Optional[str] = None,
    valide: Optional[bool] = None,
    limite: int = Query(default=50, le=200)
):
    conn = get_db()
    cursor = conn.cursor()

    query = "SELECT * FROM projets WHERE 1=1"
    params = []

    if type_projet:
        query += " AND type_projet = ?"
        params.append(type_projet)

    if valide is not None:
        query += " AND valide = ?"
        params.append(1 if valide else 0)

    query += " ORDER BY date_creation DESC LIMIT ?"
    params.append(limite)

    cursor.execute(query, params)
    projets = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return projets


@router.get("/statistiques")
def statistiques_projets():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as total FROM projets")
    total = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) as total FROM projets WHERE valide = 1")
    valides = cursor.fetchone()["total"]

    cursor.execute("""
        SELECT type_projet, COUNT(*) as nb, AVG(cout_total) as cout_moyen,
               AVG(surface) as surface_moyenne
        FROM projets WHERE valide = 1
        GROUP BY type_projet
    """)
    par_type = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT COUNT(*) as total FROM corrections
    """)
    nb_corrections = cursor.fetchone()["total"]

    cursor.execute("""
        SELECT AVG(nb_unites_adiabatiques) as moy_unites,
               AVG(nb_evaporateurs) as moy_evap,
               AVG(debit_air) as moy_debit,
               AVG(cout_total) as moy_cout
        FROM projets WHERE valide = 1
    """)
    moyennes = dict(cursor.fetchone())

    conn.close()
    return {
        "total_projets": total,
        "projets_valides": valides,
        "par_type": par_type,
        "nb_corrections": nb_corrections,
        "moyennes": moyennes,
    }


@router.get("/{projet_id}")
def obtenir_projet(projet_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM projets WHERE id = ?", (projet_id,))
    projet = cursor.fetchone()
    conn.close()

    if not projet:
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    return dict(projet)


@router.post("/", status_code=201)
def creer_projet(projet: ProjetCreate):
    conn = get_db()
    cursor = conn.cursor()

    # Calculer surface et volume si possible
    if projet.longueur and projet.largeur:
        if not projet.surface:
            projet.surface = projet.longueur * projet.largeur
    if projet.surface and projet.hauteur:
        if not projet.volume:
            projet.volume = projet.surface * projet.hauteur

    cursor.execute("""
        INSERT INTO projets (nom, description, type_projet, longueur, largeur, hauteur,
            surface, volume, temperature_cible, temperature_exterieure, debit_air,
            charge_thermique, humidite_relative, nb_unites_adiabatiques, nb_evaporateurs,
            nb_condenseurs, puissance_totale, cout_equipements, cout_installation, cout_total,
            source_donnees, valide, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        projet.nom, projet.description, projet.type_projet,
        projet.longueur, projet.largeur, projet.hauteur,
        projet.surface, projet.volume,
        projet.temperature_cible, projet.temperature_exterieure,
        projet.debit_air, projet.charge_thermique, projet.humidite_relative,
        projet.nb_unites_adiabatiques, projet.nb_evaporateurs, projet.nb_condenseurs,
        projet.puissance_totale, projet.cout_equipements, projet.cout_installation, projet.cout_total,
        "manuel", 1 if projet.valide else 0, projet.notes
    ))

    projet_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"id": projet_id, "message": "Projet créé avec succès"}


@router.put("/{projet_id}")
def modifier_projet(projet_id: int, projet: ProjetUpdate):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM projets WHERE id = ?", (projet_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    champs = projet.dict(exclude_none=True)
    if not champs:
        conn.close()
        return {"message": "Aucune modification"}

    champs["date_modification"] = datetime.now().isoformat()

    set_clause = ", ".join(f"{k} = ?" for k in champs.keys())
    valeurs = list(champs.values()) + [projet_id]

    cursor.execute(f"UPDATE projets SET {set_clause} WHERE id = ?", valeurs)
    conn.commit()
    conn.close()

    return {"message": "Projet mis à jour"}


@router.delete("/{projet_id}")
def supprimer_projet(projet_id: int):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM projets WHERE id = ?", (projet_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Projet non trouvé")

    cursor.execute("DELETE FROM projets WHERE id = ?", (projet_id,))
    conn.commit()
    conn.close()

    return {"message": "Projet supprimé"}
