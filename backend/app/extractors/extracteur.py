import os
import re
import json
from typing import Dict, Optional, List
import io

# Imports conditionnels
try:
    import fitz  # PyMuPDF
    PYMUPDF_DISPONIBLE = True
except ImportError:
    PYMUPDF_DISPONIBLE = False

try:
    import pandas as pd
    PANDAS_DISPONIBLE = True
except ImportError:
    PANDAS_DISPONIBLE = False

try:
    import pdfplumber
    PDFPLUMBER_DISPONIBLE = True
except ImportError:
    PDFPLUMBER_DISPONIBLE = False

try:
    import requests
    from bs4 import BeautifulSoup
    WEB_DISPONIBLE = True
except ImportError:
    WEB_DISPONIBLE = False


class ExtracteurDonnees:
    """Extrait les données de projets depuis différentes sources."""

    # Patterns regex pour extraire les paramètres
    PATTERNS = {
        "longueur": [
            r"longueur[:\s]+(\d+(?:[.,]\d+)?)\s*m",
            r"L\s*[=:]\s*(\d+(?:[.,]\d+)?)\s*m",
            r"(\d+(?:[.,]\d+)?)\s*m\s*(?:de\s*)?long",
        ],
        "largeur": [
            r"largeur[:\s]+(\d+(?:[.,]\d+)?)\s*m",
            r"l\s*[=:]\s*(\d+(?:[.,]\d+)?)\s*m",
            r"(\d+(?:[.,]\d+)?)\s*m\s*(?:de\s*)?large",
        ],
        "hauteur": [
            r"hauteur[:\s]+(\d+(?:[.,]\d+)?)\s*m",
            r"h\s*[=:]\s*(\d+(?:[.,]\d+)?)\s*m",
            r"(\d+(?:[.,]\d+)?)\s*m\s*(?:de\s*)?haut",
        ],
        "surface": [
            r"surface[:\s]+(\d+(?:[.,]\d+)?)\s*m[²2]",
            r"(\d+(?:[.,]\d+)?)\s*m[²2]\s*(?:de\s*)?surface",
            r"superficie[:\s]+(\d+(?:[.,]\d+)?)\s*m",
        ],
        "temperature_cible": [
            r"temp[eé]rature\s*(?:cible|int[eé]rieure|souhait[eé]e)[:\s]+(-?\d+(?:[.,]\d+)?)\s*°?C",
            r"(-?\d+)\s*°C\s*(?:int[eé]rieure?|cible)",
            r"t[°]?\s*[=:]\s*(-?\d+(?:[.,]\d+)?)\s*°?[cC]",
        ],
        "temperature_exterieure": [
            r"temp[eé]rature\s*(?:ext[eé]rieure|ambiante|dehors)[:\s]+(\d+(?:[.,]\d+)?)\s*°?C",
            r"(\d+)\s*°C\s*ext[eé]rieure?",
        ],
        "debit_air": [
            r"d[eé]bit\s*(?:d[\'']air)?[:\s]+(\d+(?:[.,]\d+)?)\s*m[³3]/h",
            r"(\d+(?:[.,]\d+)?)\s*m[³3]/h",
            r"(\d+(?:[.,]\d+)?)\s*m3/h",
        ],
        "puissance": [
            r"puissance[:\s]+(\d+(?:[.,]\d+)?)\s*(?:kW|KW)",
            r"(\d+(?:[.,]\d+)?)\s*kW",
        ],
        "cout": [
            r"co[uû]t[:\s]+(\d+(?:[\s,]\d+)*)\s*(?:TND|DT|dinars?)",
            r"(\d+(?:[\s,]\d+)*)\s*(?:TND|DT)",
            r"montant[:\s]+(\d+(?:[\s,]\d+)*)",
        ],
        "nb_unites": [
            r"(\d+)\s*unit[eé]s?\s*adiabatiques?",
            r"(\d+)\s*(?:PAD|panneaux?\s*adiabatiques?)",
        ],
    }

    def extraire_texte_pdf(self, chemin_fichier: str) -> str:
        """Extrait le texte d'un PDF."""
        texte = ""

        if PYMUPDF_DISPONIBLE:
            try:
                doc = fitz.open(chemin_fichier)
                for page in doc:
                    texte += page.get_text()
                doc.close()
                return texte
            except Exception as e:
                print(f"Erreur PyMuPDF: {e}")

        if PDFPLUMBER_DISPONIBLE:
            try:
                with pdfplumber.open(chemin_fichier) as pdf:
                    for page in pdf.pages:
                        texte += page.extract_text() or ""
                return texte
            except Exception as e:
                print(f"Erreur pdfplumber: {e}")

        return texte

    def extraire_tableaux_pdf(self, chemin_fichier: str) -> List[Dict]:
        """Extrait les tableaux d'un PDF."""
        tableaux = []

        if PDFPLUMBER_DISPONIBLE:
            try:
                with pdfplumber.open(chemin_fichier) as pdf:
                    for i, page in enumerate(pdf.pages):
                        tables = page.extract_tables()
                        for table in tables:
                            if table:
                                tableaux.append({"page": i + 1, "donnees": table})
            except Exception as e:
                print(f"Erreur extraction tableaux: {e}")

        return tableaux

    def extraire_excel(self, chemin_fichier: str) -> Dict:
        """Extrait les données d'un fichier Excel."""
        if not PANDAS_DISPONIBLE:
            return {"erreur": "pandas non installé"}

        try:
            xl = pd.ExcelFile(chemin_fichier)
            result = {}

            for sheet_name in xl.sheet_names:
                df = pd.read_excel(chemin_fichier, sheet_name=sheet_name)
                result[sheet_name] = {
                    "colonnes": list(df.columns),
                    "donnees": df.head(100).fillna("").to_dict("records"),
                    "nb_lignes": len(df),
                }

            return result
        except Exception as e:
            return {"erreur": str(e)}

    def extraire_site_web(self, url: str) -> str:
        """Extrait le texte d'une page web."""
        if not WEB_DISPONIBLE:
            return ""

        try:
            headers = {"User-Agent": "Mozilla/5.0 (compatible; FroidAI/1.0)"}
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            # Supprimer les scripts et styles
            for tag in soup(["script", "style", "nav", "footer"]):
                tag.decompose()

            texte = soup.get_text(separator="\n", strip=True)
            return texte[:10000]  # Limiter à 10000 caractères
        except Exception as e:
            return f"Erreur extraction web: {e}"

    def analyser_texte(self, texte: str) -> Dict:
        """Analyse le texte et extrait les paramètres techniques."""
        parametres = {}
        texte_lower = texte.lower()

        for champ, patterns in self.PATTERNS.items():
            for pattern in patterns:
                match = re.search(pattern, texte_lower)
                if match:
                    valeur_str = match.group(1).replace(",", ".").replace(" ", "")
                    try:
                        parametres[champ] = float(valeur_str)
                        break
                    except ValueError:
                        continue

        # Détecter le type de projet
        if any(mot in texte_lower for mot in ["adiabatique", "pad", "évaporation", "refroidissement adiabatique"]):
            parametres["type_projet"] = "adiabatique"
        elif any(mot in texte_lower for mot in ["chambre froide", "froid", "congélation", "réfrigération"]):
            parametres["type_projet"] = "chambre_froide"

        # Calculer surface et volume si possible
        if "longueur" in parametres and "largeur" in parametres:
            parametres["surface"] = round(parametres["longueur"] * parametres["largeur"], 2)

        if "surface" in parametres and "hauteur" in parametres:
            parametres["volume"] = round(parametres["surface"] * parametres["hauteur"], 2)

        return parametres

    def traiter_fichier(self, chemin_fichier: str, type_fichier: str) -> Dict:
        """Point d'entrée principal pour traiter un fichier."""
        extension = os.path.splitext(chemin_fichier)[1].lower()

        if extension in [".pdf"]:
            texte = self.extraire_texte_pdf(chemin_fichier)
            tableaux = self.extraire_tableaux_pdf(chemin_fichier)
            parametres = self.analyser_texte(texte)

            # Analyser les tableaux aussi
            for tableau in tableaux:
                for ligne in tableau.get("donnees", []):
                    texte_ligne = " ".join(str(v) for v in ligne if v)
                    params_ligne = self.analyser_texte(texte_ligne)
                    for k, v in params_ligne.items():
                        if k not in parametres:
                            parametres[k] = v

            return {
                "type": "pdf",
                "texte_extrait": texte[:2000],
                "parametres": parametres,
                "tableaux": len(tableaux),
                "succes": bool(parametres),
            }

        elif extension in [".xlsx", ".xls", ".csv"]:
            if extension == ".csv" and PANDAS_DISPONIBLE:
                df = pd.read_csv(chemin_fichier)
                donnees = df.head(50).fillna("").to_dict("records")
                texte = df.to_string()
                parametres = self.analyser_texte(texte)
                return {
                    "type": "csv",
                    "donnees": donnees,
                    "parametres": parametres,
                    "succes": bool(parametres),
                }
            else:
                donnees = self.extraire_excel(chemin_fichier)
                # Extraire texte de tous les sheets
                texte_global = ""
                for sheet, data in donnees.items():
                    for row in data.get("donnees", []):
                        texte_global += " ".join(str(v) for v in row.values()) + "\n"
                parametres = self.analyser_texte(texte_global)
                return {
                    "type": "excel",
                    "donnees": donnees,
                    "parametres": parametres,
                    "succes": bool(parametres),
                }

        return {"erreur": f"Format non supporté: {extension}", "succes": False}


extracteur = ExtracteurDonnees()
