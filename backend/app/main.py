from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api import projets, predictions, extraction, modele, catalogue, neural
from app.core.database import init_db
from app.core.catalogue import init_catalogue_equipements

app = FastAPI(
    title="FroidAI - Système de Prédiction Chambres Froides",
    description="API pour l'analyse et la prédiction d'équipements de chambres froides et climatisation adiabatique",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Monter le dossier uploads
os.makedirs("data/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="data/uploads"), name="uploads")

# Inclure les routers
app.include_router(projets.router, prefix="/api/projets", tags=["Projets"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["Prédictions"])
app.include_router(extraction.router, prefix="/api/extraction", tags=["Extraction"])
app.include_router(modele.router, prefix="/api/modele", tags=["Modèle ML"])
app.include_router(catalogue.router, prefix="/api/catalogue", tags=["Catalogue & Stock"])
app.include_router(neural.router, prefix="/api/neural", tags=["Réseau Neuronal"])

@app.on_event("startup")
async def startup():
    init_db()
    init_catalogue_equipements()
    from app.ml.neural_engine import moteur_nn
    moteur_nn.charger()
    from app.ml.predictor import predictor
    predictor.charger_modele()
    # Initialiser le modèle ML si des données existent
    from app.ml.predictor import predictor
    predictor.charger_modele()

@app.get("/")
def root():
    return {"message": "FroidAI API - Système de Prédiction Chambres Froides", "version": "1.0.0"}

@app.get("/api/sante")
def sante():
    return {"statut": "ok", "message": "Le système fonctionne correctement"}
