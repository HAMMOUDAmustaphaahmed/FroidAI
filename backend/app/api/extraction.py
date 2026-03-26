from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import Optional
import os
import shutil
import uuid

from app.extractors.extracteur import extracteur

router = APIRouter()

UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

EXTENSIONS_AUTORISEES = {".pdf", ".xlsx", ".xls", ".csv"}


@router.post("/fichier")
async def extraire_depuis_fichier(
    fichier: UploadFile = File(...),
):
    """Extrait les paramètres techniques d'un fichier PDF, Excel ou CSV."""
    extension = os.path.splitext(fichier.filename)[1].lower()

    if extension not in EXTENSIONS_AUTORISEES:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté. Formats acceptés: {', '.join(EXTENSIONS_AUTORISEES)}"
        )

    # Sauvegarder le fichier
    nom_unique = f"{uuid.uuid4()}{extension}"
    chemin_fichier = os.path.join(UPLOAD_DIR, nom_unique)

    with open(chemin_fichier, "wb") as f:
        contenu = await fichier.read()
        f.write(contenu)

    # Extraire les données
    try:
        resultat = extracteur.traiter_fichier(chemin_fichier, extension)
        resultat["nom_fichier"] = fichier.filename
        resultat["chemin_sauvegarde"] = nom_unique
        return resultat
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'extraction: {str(e)}")


@router.post("/url")
def extraire_depuis_url(data: dict):
    """Extrait les paramètres depuis une URL web."""
    url = data.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="URL manquante")

    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL invalide (doit commencer par http:// ou https://)")

    try:
        texte = extracteur.extraire_site_web(url)
        if not texte:
            raise HTTPException(status_code=422, detail="Impossible d'extraire le contenu de cette URL")

        parametres = extracteur.analyser_texte(texte)
        return {
            "type": "web",
            "url": url,
            "texte_extrait": texte[:1000],
            "parametres": parametres,
            "succes": bool(parametres),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur extraction web: {str(e)}")


@router.post("/texte")
def extraire_depuis_texte(data: dict):
    """Extrait les paramètres depuis du texte brut."""
    texte = data.get("texte", "")
    if not texte:
        raise HTTPException(status_code=400, detail="Texte manquant")

    parametres = extracteur.analyser_texte(texte)
    return {
        "type": "texte",
        "parametres": parametres,
        "succes": bool(parametres),
    }
