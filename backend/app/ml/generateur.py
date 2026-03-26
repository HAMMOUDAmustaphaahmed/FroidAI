"""
Générateur de données synthétiques cohérentes pour l'entraînement ML.
Basé sur les lois physiques et les données réelles du catalogue Seeley.
"""

import random
import math
import json
from typing import List, Dict
from app.core.database import get_db


class GenerateurDonneesSynthetiques:
    """Génère des projets synthétiques physiquement cohérents."""

    # Paramètres climatiques Tunisie / Afrique du Nord
    VILLES_TUNISIE = [
        {"ville": "Tunis", "t_ext": 37, "humidite": 58},
        {"ville": "Sfax", "t_ext": 38, "humidite": 55},
        {"ville": "Sousse", "t_ext": 37, "humidite": 60},
        {"ville": "Bizerte", "t_ext": 35, "humidite": 65},
        {"ville": "Kairouan", "t_ext": 40, "humidite": 40},
        {"ville": "Gabès", "t_ext": 39, "humidite": 50},
        {"ville": "Gafsa", "t_ext": 42, "humidite": 35},
        {"ville": "Nabeul", "t_ext": 36, "humidite": 62},
        {"ville": "Monastir", "t_ext": 37, "humidite": 60},
        {"ville": "Djerba", "t_ext": 36, "humidite": 63},
    ]

    TYPES_LOCAUX_CF = [
        {"type": "Entrepôt fruits/légumes", "t_cible": (2, 8), "k_paroi": 0.030},
        {"type": "Entrepôt viande", "t_cible": (-2, 4), "k_paroi": 0.025},
        {"type": "Congélation industrielle", "t_cible": (-25, -18), "k_paroi": 0.020},
        {"type": "Produits laitiers", "t_cible": (2, 6), "k_paroi": 0.030},
        {"type": "Poissonnerie", "t_cible": (-5, 2), "k_paroi": 0.025},
        {"type": "Pharmacie/médical", "t_cible": (2, 8), "k_paroi": 0.035},
        {"type": "Restauration", "t_cible": (0, 6), "k_paroi": 0.030},
        {"type": "Grande distribution", "t_cible": (0, 4), "k_paroi": 0.028},
    ]

    TYPES_LOCAUX_AD = [
        {"type": "Atelier industriel", "t_cible": (24, 28), "renouvellement": 15},
        {"type": "Entrepôt logistique", "t_cible": (26, 30), "renouvellement": 10},
        {"type": "Centre commercial", "t_cible": (22, 26), "renouvellement": 12},
        {"type": "Hôtel/Résidence", "t_cible": (22, 25), "renouvellement": 8},
        {"type": "Bureau open-space", "t_cible": (22, 24), "renouvellement": 10},
        {"type": "Salle de production alimentaire", "t_cible": (18, 22), "renouvellement": 20},
        {"type": "Hangar agricole", "t_cible": (28, 32), "renouvellement": 8},
        {"type": "Showroom/Commerce", "t_cible": (22, 25), "renouvellement": 10},
    ]

    # Coefficients de coût TND (2024)
    COUT_EVAP_PAR_KW = 850      # TND/kW capacité
    COUT_COND_PAR_KW = 650
    COUT_AD_PAR_UNITE = 4800    # TND/unité adiabatique
    COUT_INSTALL_RATIO = 0.25   # 25% du coût équipements
    COUT_TUYAUTERIE_M3 = 42     # TND/m³ volume

    def _charge_thermique_cf(self, L, l, h, t_cible, t_ext, k_paroi=0.030):
        """Calcule la charge thermique d'une chambre froide (W)."""
        surface = L * l
        volume = surface * h
        surface_totale = 2 * (L * l + L * h + l * h)
        delta_t = t_ext - t_cible

        # Transmission paroi (isolation polyuréthane standard)
        q_paroi = k_paroi * surface_totale * delta_t

        # Infiltrations (ouvertures, renouvellement minimal)
        q_infiltration = volume * 0.3 * 1.2 * 1005 * delta_t / 3600

        # Charges internes (éclairage LED 8W/m², personnel, moteurs)
        q_interne = surface * 35  # W/m²

        # Produits (charge frigorifique marchandise) — environ 30% des parois
        q_produits = q_paroi * 0.3

        charge_totale = q_paroi + q_infiltration + q_interne + q_produits

        # Facteur de sécurité 15%
        return round(charge_totale * 1.15)

    def _charge_thermique_ad(self, L, l, h, t_cible, t_ext, taux_renouvellement=10):
        """Calcule la charge thermique pour le dimensionnement adiabatique (W)."""
        surface = L * l
        volume = surface * h
        delta_t = t_ext - t_cible

        # Charge par renouvellement d'air
        debit_m3s = volume * taux_renouvellement / 3600
        q_air = debit_m3s * 1.2 * 1005 * delta_t

        # Gains solaires et enveloppe
        q_solaire = surface * 80  # W/m² — toiture industrielle

        # Charges internes (équipements, éclairage, personnel)
        q_interne = surface * 25

        return round(q_air + q_solaire + q_interne)

    def _dimensionner_cf(self, L, l, h, t_cible, t_ext, charge_totale):
        """Dimensionne les équipements d'une chambre froide."""
        volume = L * l * h

        # Coefficient de performance selon delta_T
        delta_t = t_ext - t_cible
        if delta_t < 30:
            cop = 3.0
        elif delta_t < 50:
            cop = 2.5
        else:
            cop = 2.0

        # Puissance frigorifique nécessaire
        puissance_frig_kw = charge_totale / 1000

        # Nombre d'évaporateurs (1 évaporateur ≈ 10-15 kW)
        puissance_par_evap = 12.0
        nb_evap = max(1, math.ceil(puissance_frig_kw / puissance_par_evap))

        # Puissance électrique compresseur
        puissance_elec_kw = round(puissance_frig_kw / cop, 2)

        # Nombre de condenseurs (1 condenseur / 2 évaporateurs)
        nb_cond = max(1, math.ceil(nb_evap / 2))

        # Débit d'air (8-12 volumes/heure pour CF standard)
        renouvellements = 10 if t_cible > 0 else 8
        debit_air = round(volume * renouvellements)

        # Coûts (TND)
        cout_evap = nb_evap * puissance_par_evap * self.COUT_EVAP_PAR_KW
        cout_cond = nb_cond * 12000
        cout_tuyauterie = volume * self.COUT_TUYAUTERIE_M3
        cout_equipements = cout_evap + cout_cond + cout_tuyauterie
        cout_installation = cout_equipements * self.COUT_INSTALL_RATIO
        cout_total = cout_equipements + cout_installation

        return {
            "nb_evaporateurs": nb_evap,
            "nb_condenseurs": nb_cond,
            "nb_unites_adiabatiques": 0,
            "debit_air": debit_air,
            "puissance_totale": puissance_elec_kw,
            "charge_thermique": charge_totale,
            "cout_equipements": round(cout_equipements),
            "cout_installation": round(cout_installation),
            "cout_total": round(cout_total),
        }

    def _dimensionner_ad(self, L, l, h, t_cible, t_ext, charge_totale, humidite):
        """Dimensionne un système de climatisation adiabatique."""
        surface = L * l

        # Débit d'air nécessaire (m³/h)
        debit_air_m3h = surface * 45  # m³/h par m² — standard adiabatique

        # Choisir le modèle d'unité selon débit
        if debit_air_m3h > 100000:
            # CW-80 IEC High: 25 000 m³/h/unité
            debit_par_unite = 25000
            cout_par_unite = 38000 * 3.3  # EUR → TND
        elif debit_air_m3h > 50000:
            # CW-80 IEC Std: 23 800 m³/h/unité
            debit_par_unite = 23800
            cout_par_unite = 35000 * 3.3
        elif debit_air_m3h > 20000:
            # CW-H15S Plus: 5 760 m³/h/unité
            debit_par_unite = 5760
            cout_par_unite = 15000 * 3.3
        elif debit_air_m3h > 5000:
            # CW-H15: 3 960 m³/h/unité
            debit_par_unite = 3960
            cout_par_unite = 11000 * 3.3
        else:
            # CW3: 4 680 m³/h/unité
            debit_par_unite = 4680
            cout_par_unite = 9500 * 3.3

        nb_unites = max(1, math.ceil(debit_air_m3h / debit_par_unite))

        # Condenseurs (1 par 4 unités pour ventilo-convecteurs si besoin)
        nb_cond = max(1, math.ceil(nb_unites / 4))

        # Puissance électrique totale
        puissance_totale = round(nb_unites * (cout_par_unite / 3.3 * 0.00004) + nb_cond * 2.5, 2)
        puissance_totale = max(puissance_totale, nb_unites * 2.0)

        # Coûts TND
        cout_equipements = nb_unites * cout_par_unite + nb_cond * 8500
        cout_installation = cout_equipements * 0.22
        cout_total = cout_equipements + cout_installation

        return {
            "nb_unites_adiabatiques": nb_unites,
            "nb_evaporateurs": 0,
            "nb_condenseurs": nb_cond,
            "debit_air": round(debit_air_m3h),
            "puissance_totale": puissance_totale,
            "charge_thermique": charge_totale,
            "cout_equipements": round(cout_equipements),
            "cout_installation": round(cout_installation),
            "cout_total": round(cout_total),
        }

    def generer_projet(self, type_projet: str = None) -> Dict:
        """Génère un projet synthétique unique."""
        if type_projet is None:
            type_projet = random.choice(["chambre_froide", "adiabatique"])

        ville = random.choice(self.VILLES_TUNISIE)
        t_ext = ville["t_ext"] + random.uniform(-2, 3)
        humidite = ville["humidite"] + random.uniform(-5, 5)

        if type_projet == "chambre_froide":
            config = random.choice(self.TYPES_LOCAUX_CF)

            # Dimensions selon type de local
            if "Grande distribution" in config["type"] or "Entrepôt" in config["type"]:
                L = random.uniform(15, 60)
                l = random.uniform(10, 40)
                h = random.uniform(4, 7)
            elif "Congélation" in config["type"]:
                L = random.uniform(20, 50)
                l = random.uniform(15, 35)
                h = random.uniform(5, 8)
            else:
                L = random.uniform(3, 20)
                l = random.uniform(3, 15)
                h = random.uniform(2.5, 5)

            L, l, h = round(L, 1), round(l, 1), round(h, 1)
            t_cible_range = config["t_cible"]
            t_cible = round(random.uniform(*t_cible_range), 1)
            k_paroi = config["k_paroi"] + random.uniform(-0.005, 0.005)

            charge = self._charge_thermique_cf(L, l, h, t_cible, t_ext, k_paroi)
            dim = self._dimensionner_cf(L, l, h, t_cible, t_ext, charge)

            nom = f"{config['type']} {ville['ville']} {random.randint(2018, 2024)}"
            description = f"Projet synthétique — {config['type']}, {ville['ville']}"

        else:
            config = random.choice(self.TYPES_LOCAUX_AD)

            # Dimensions selon type
            if "industriel" in config["type"].lower() or "Entrepôt" in config["type"]:
                L = random.uniform(30, 150)
                l = random.uniform(20, 100)
                h = random.uniform(5, 12)
            elif "commercial" in config["type"].lower() or "Centre" in config["type"]:
                L = random.uniform(40, 120)
                l = random.uniform(30, 80)
                h = random.uniform(3.5, 6)
            else:
                L = random.uniform(15, 60)
                l = random.uniform(12, 50)
                h = random.uniform(3, 5)

            L, l, h = round(L, 1), round(l, 1), round(h, 1)
            t_cible_range = config["t_cible"]
            t_cible = round(random.uniform(*t_cible_range), 1)
            taux = config["renouvellement"] + random.uniform(-2, 2)

            charge = self._charge_thermique_ad(L, l, h, t_cible, t_ext, taux)
            dim = self._dimensionner_ad(L, l, h, t_cible, t_ext, charge, humidite)

            nom = f"{config['type']} {ville['ville']} {random.randint(2018, 2024)}"
            description = f"Projet synthétique — {config['type']}, {ville['ville']}"

        surface = round(L * l, 2)
        volume = round(surface * h, 2)

        # Ajouter bruit réaliste (±8%)
        for key in ["cout_equipements", "cout_installation", "cout_total"]:
            dim[key] = round(dim[key] * random.uniform(0.92, 1.08))
        dim["debit_air"] = round(dim["debit_air"] * random.uniform(0.95, 1.05))

        return {
            "nom": nom,
            "description": description,
            "type_projet": type_projet,
            "longueur": L,
            "largeur": l,
            "hauteur": h,
            "surface": surface,
            "volume": volume,
            "temperature_cible": t_cible,
            "temperature_exterieure": round(t_ext, 1),
            "humidite_relative": round(humidite, 1),
            **dim,
            "source_donnees": "synthetique",
            "valide": 1,
            "notes": f"Généré automatiquement — {ville['ville']} — {config['type']}",
        }

    def generer_lot(self, n: int = 50, type_projet: str = None) -> List[Dict]:
        """Génère un lot de n projets synthétiques."""
        projets = []
        for _ in range(n):
            try:
                p = self.generer_projet(type_projet)
                projets.append(p)
            except Exception as e:
                print(f"Erreur génération: {e}")
        return projets

    def sauvegarder_en_base(self, projets: List[Dict]) -> int:
        """Sauvegarde les projets générés dans la base."""
        conn = get_db()
        cursor = conn.cursor()
        inseres = 0

        for p in projets:
            try:
                cursor.execute("""
                    INSERT INTO projets
                    (nom, description, type_projet, longueur, largeur, hauteur,
                     surface, volume, temperature_cible, temperature_exterieure,
                     debit_air, charge_thermique, humidite_relative,
                     nb_unites_adiabatiques, nb_evaporateurs, nb_condenseurs,
                     puissance_totale, cout_equipements, cout_installation, cout_total,
                     source_donnees, valide, notes)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    p["nom"], p["description"], p["type_projet"],
                    p["longueur"], p["largeur"], p["hauteur"],
                    p["surface"], p["volume"],
                    p["temperature_cible"], p["temperature_exterieure"],
                    p["debit_air"], p["charge_thermique"], p["humidite_relative"],
                    p["nb_unites_adiabatiques"], p["nb_evaporateurs"],
                    p["nb_condenseurs"], p["puissance_totale"],
                    p["cout_equipements"], p["cout_installation"], p["cout_total"],
                    "synthetique", 1, p.get("notes", "")
                ))
                inseres += 1
            except Exception as e:
                print(f"Erreur sauvegarde: {e}")

        conn.commit()
        conn.close()
        return inseres


generateur = GenerateurDonneesSynthetiques()
