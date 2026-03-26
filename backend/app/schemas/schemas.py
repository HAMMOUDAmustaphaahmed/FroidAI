from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ProjetBase(BaseModel):
    nom: str
    description: Optional[str] = None
    type_projet: str = "chambre_froide"  # chambre_froide ou adiabatique
    longueur: Optional[float] = None
    largeur: Optional[float] = None
    hauteur: Optional[float] = None
    surface: Optional[float] = None
    volume: Optional[float] = None
    temperature_cible: Optional[float] = None
    temperature_exterieure: Optional[float] = None
    debit_air: Optional[float] = None
    charge_thermique: Optional[float] = None
    humidite_relative: Optional[float] = None
    nb_unites_adiabatiques: Optional[int] = None
    nb_evaporateurs: Optional[int] = None
    nb_condenseurs: Optional[int] = None
    puissance_totale: Optional[float] = None
    cout_equipements: Optional[float] = None
    cout_installation: Optional[float] = None
    cout_total: Optional[float] = None
    notes: Optional[str] = None

class ProjetCreate(ProjetBase):
    valide: bool = True

class ProjetUpdate(ProjetBase):
    nom: Optional[str] = None
    valide: Optional[bool] = None

class Projet(ProjetBase):
    id: int
    source_donnees: str
    fichier_source: Optional[str] = None
    valide: bool
    date_creation: Optional[str] = None
    date_modification: Optional[str] = None

    class Config:
        from_attributes = True

class ParametresPrediction(BaseModel):
    type_projet: str = Field(default="chambre_froide", description="Type: chambre_froide ou adiabatique")
    longueur: float = Field(..., gt=0, description="Longueur en mètres")
    largeur: float = Field(..., gt=0, description="Largeur en mètres")
    hauteur: float = Field(..., gt=0, description="Hauteur en mètres")
    temperature_cible: float = Field(..., description="Température cible en °C")
    temperature_exterieure: float = Field(default=35.0, description="Température extérieure en °C")
    humidite_relative: Optional[float] = Field(default=60.0, description="Humidité relative en %")
    charge_thermique: Optional[float] = Field(default=None, description="Charge thermique en W (calculée si non fournie)")

class ResultatPrediction(BaseModel):
    nb_unites_adiabatiques: int
    nb_evaporateurs: int
    nb_condenseurs: int
    debit_air: float
    puissance_totale: float
    charge_thermique: float
    cout_equipements: float
    cout_installation: float
    cout_total: float
    confiance: float
    surface: float
    volume: float
    explications: dict

class CorrectionPrediction(BaseModel):
    projet_id: Optional[int] = None
    champ: str
    valeur_originale: str
    valeur_corrigee: str
    commentaire: Optional[str] = None

class ReentrainementResultat(BaseModel):
    succes: bool
    message: str
    nb_projets: int
    metriques: Optional[dict] = None
