import sqlite3
import os

DB_PATH = "data/froidai.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Table projets
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS projets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            description TEXT,
            type_projet TEXT DEFAULT 'chambre_froide',
            longueur REAL,
            largeur REAL,
            hauteur REAL,
            surface REAL,
            volume REAL,
            temperature_cible REAL,
            temperature_exterieure REAL,
            debit_air REAL,
            charge_thermique REAL,
            humidite_relative REAL,
            nb_unites_adiabatiques INTEGER,
            nb_evaporateurs INTEGER,
            nb_condenseurs INTEGER,
            puissance_totale REAL,
            cout_equipements REAL,
            cout_installation REAL,
            cout_total REAL,
            source_donnees TEXT DEFAULT 'manuel',
            fichier_source TEXT,
            valide INTEGER DEFAULT 0,
            notes TEXT,
            date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table corrections (self-learning)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projet_id INTEGER,
            prediction_originale TEXT,
            valeur_corrigee TEXT,
            champ TEXT,
            commentaire TEXT,
            date_correction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projet_id) REFERENCES projets(id)
        )
    """)

    # Table historique_predictions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS historique_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parametres_entree TEXT,
            prediction TEXT,
            confiance REAL,
            validee INTEGER DEFAULT 0,
            date_prediction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table metriques_modele
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metriques_modele (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT,
            mae REAL,
            rmse REAL,
            r2 REAL,
            nb_projets_entrainement INTEGER,
            date_entrainement TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Insérer des données d'exemple si la table est vide
    cursor.execute("SELECT COUNT(*) FROM projets")
    count = cursor.fetchone()[0]

    if count == 0:
        exemples = [
            ("Entrepôt Fruits Tunis", "Chambre froide fruits légumes", "chambre_froide", 20.0, 15.0, 5.0, 300.0, 1500.0, 4.0, 35.0, 18000.0, 12.0, 60.0, 6, 4, 2, 45.0, 85000.0, 25000.0, 110000.0, "manuel", None, 1, ""),
            ("Supermarché Sfax", "Climatisation adiabatique grande surface", "adiabatique", 50.0, 30.0, 4.0, 1500.0, 6000.0, 22.0, 38.0, 75000.0, 10.0, 40.0, 15, 0, 8, 120.0, 180000.0, 45000.0, 225000.0, "manuel", None, 1, ""),
            ("Usine Agroalimentaire Sousse", "Chambre froide industrielle", "chambre_froide", 40.0, 25.0, 6.0, 1000.0, 6000.0, -18.0, 35.0, 45000.0, 8.0, 75.0, 12, 8, 4, 180.0, 350000.0, 80000.0, 430000.0, "manuel", None, 1, ""),
            ("Restaurant Hammamet", "Chambre froide restauration", "chambre_froide", 8.0, 6.0, 3.0, 48.0, 144.0, 2.0, 32.0, 4800.0, 15.0, 85.0, 2, 2, 1, 12.0, 28000.0, 8000.0, 36000.0, "manuel", None, 1, ""),
            ("Centre Commercial Bizerte", "Système adiabatique complet", "adiabatique", 80.0, 60.0, 5.0, 4800.0, 24000.0, 24.0, 40.0, 180000.0, 12.0, 35.0, 35, 0, 18, 280.0, 520000.0, 120000.0, 640000.0, "manuel", None, 1, ""),
            ("Pharmacie Nabeul", "Chambre froide médicaments", "chambre_froide", 5.0, 4.0, 2.8, 20.0, 56.0, 8.0, 30.0, 2000.0, 18.0, 65.0, 1, 1, 1, 5.0, 18000.0, 6000.0, 24000.0, "manuel", None, 1, ""),
            ("Laiterie Monastir", "Chambre froide produits laitiers", "chambre_froide", 30.0, 20.0, 5.5, 600.0, 3300.0, 4.0, 33.0, 30000.0, 10.0, 80.0, 8, 6, 3, 90.0, 160000.0, 40000.0, 200000.0, "manuel", None, 1, ""),
            ("Hôtel Djerba", "Climatisation adiabatique hôtel", "adiabatique", 60.0, 40.0, 4.5, 2400.0, 10800.0, 23.0, 38.0, 120000.0, 11.0, 45.0, 22, 0, 12, 175.0, 320000.0, 75000.0, 395000.0, "manuel", None, 1, ""),
        ]
        cursor.executemany("""
            INSERT INTO projets (nom, description, type_projet, longueur, largeur, hauteur, surface, volume,
                temperature_cible, temperature_exterieure, debit_air, charge_thermique, humidite_relative,
                nb_unites_adiabatiques, nb_evaporateurs, nb_condenseurs, puissance_totale,
                cout_equipements, cout_installation, cout_total, source_donnees, fichier_source, valide, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, exemples)

    conn.commit()
    conn.close()
