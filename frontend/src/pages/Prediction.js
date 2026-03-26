import React, { useState } from 'react';
import {
  Cpu, ChevronRight, CheckCircle, AlertTriangle, Save, RotateCcw,
  Thermometer, Wind, Box, DollarSign, Zap, Info
} from 'lucide-react';
import { predictionService } from '../services/api';
import toast from 'react-hot-toast';

const CHAMPS_CORRECTION = [
  { key: 'nb_unites_adiabatiques', label: 'Unités adiabatiques' },
  { key: 'nb_evaporateurs', label: 'Évaporateurs' },
  { key: 'nb_condenseurs', label: 'Condenseurs' },
  { key: 'debit_air', label: 'Débit d\'air (m³/h)' },
  { key: 'puissance_totale', label: 'Puissance (kW)' },
  { key: 'cout_total', label: 'Coût total (TND)' },
];

export default function Prediction() {
  const [params, setParams] = useState({
    type_projet: 'chambre_froide',
    longueur: '',
    largeur: '',
    hauteur: '',
    temperature_cible: '',
    temperature_exterieure: '35',
    humidite_relative: '60',
    charge_thermique: '',
  });

  const [resultat, setResultat] = useState(null);
  const [predictionId, setPredictionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [correction, setCorrection] = useState({ champ: '', valeur: '', commentaire: '' });
  const [showCorrection, setShowCorrection] = useState(false);
  const [nomProjet, setNomProjet] = useState('');
  const [showSave, setShowSave] = useState(false);

  const handleChange = (e) => {
    setParams(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const predire = async () => {
    if (!params.longueur || !params.largeur || !params.hauteur || !params.temperature_cible) {
      toast.error('Veuillez remplir les dimensions et la température cible');
      return;
    }

    setLoading(true);
    setResultat(null);
    try {
      const payload = {
        ...params,
        longueur: parseFloat(params.longueur),
        largeur: parseFloat(params.largeur),
        hauteur: parseFloat(params.hauteur),
        temperature_cible: parseFloat(params.temperature_cible),
        temperature_exterieure: parseFloat(params.temperature_exterieure) || 35,
        humidite_relative: parseFloat(params.humidite_relative) || 60,
        charge_thermique: params.charge_thermique ? parseFloat(params.charge_thermique) : null,
      };

      const res = await predictionService.predire(payload);
      setResultat(res.data);
      setPredictionId(res.data.prediction_id);
      toast.success('Prédiction calculée !');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de prédiction');
    } finally {
      setLoading(false);
    }
  };

  const valider = async () => {
    if (!predictionId) return;
    try {
      await predictionService.valider(predictionId);
      toast.success('Prédiction validée. Merci !');
    } catch (e) {
      toast.error('Erreur lors de la validation');
    }
  };

  const soumettreCorrectionn = async () => {
    if (!correction.champ || !correction.valeur) {
      toast.error('Veuillez sélectionner un champ et saisir la valeur corrigée');
      return;
    }
    try {
      const champ = CHAMPS_CORRECTION.find(c => c.key === correction.champ);
      const valeurOriginale = resultat[correction.champ];
      await predictionService.corriger({
        projet_id: null,
        champ: correction.champ,
        valeur_originale: String(valeurOriginale),
        valeur_corrigee: correction.valeur,
        commentaire: correction.commentaire,
      });
      toast.success('Correction enregistrée. Le modèle apprend !');
      setShowCorrection(false);
      setCorrection({ champ: '', valeur: '', commentaire: '' });
    } catch (e) {
      toast.error('Erreur lors de la correction');
    }
  };

  const sauvegarder = async () => {
    if (!nomProjet.trim()) {
      toast.error('Veuillez saisir un nom de projet');
      return;
    }
    try {
      await predictionService.sauvegarderCommeProjet({
        nom: nomProjet,
        parametres: params,
        prediction: resultat,
      });
      toast.success('Projet sauvegardé dans la base !');
      setShowSave(false);
    } catch (e) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const reinitialiser = () => {
    setParams({
      type_projet: 'chambre_froide',
      longueur: '', largeur: '', hauteur: '',
      temperature_cible: '', temperature_exterieure: '35',
      humidite_relative: '60', charge_thermique: '',
    });
    setResultat(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Prédiction IA</h1>
        <p className="page-subtitle">Entrez les paramètres de votre projet pour obtenir une prédiction</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Formulaire */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title"><Box size={16} /> Type de projet</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: 'chambre_froide', label: '❄️ Chambre froide' },
                { val: 'adiabatique', label: '💨 Adiabatique' },
              ].map(opt => (
                <button
                  key={opt.val}
                  className={`btn ${params.type_projet === opt.val ? 'btn-cyan' : 'btn-ghost'}`}
                  style={{ flex: 1 }}
                  onClick={() => setParams(p => ({ ...p, type_projet: opt.val }))}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title"><Box size={16} /> Dimensions de l'espace</div>
            <div className="form-grid">
              {[
                { name: 'longueur', label: 'Longueur (m)', placeholder: 'ex: 20' },
                { name: 'largeur', label: 'Largeur (m)', placeholder: 'ex: 15' },
                { name: 'hauteur', label: 'Hauteur (m)', placeholder: 'ex: 5' },
              ].map(f => (
                <div className="form-group" key={f.name}>
                  <label className="form-label">{f.label}</label>
                  <input
                    type="number"
                    name={f.name}
                    className="form-input"
                    placeholder={f.placeholder}
                    value={params[f.name]}
                    onChange={handleChange}
                    step="0.1" min="0"
                  />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Surface (m²)</label>
                <input
                  className="form-input"
                  value={params.longueur && params.largeur ? (parseFloat(params.longueur) * parseFloat(params.largeur)).toFixed(1) : ''}
                  readOnly
                  placeholder="Calculée auto"
                  style={{ background: 'rgba(6,182,212,0.05)', color: '#22d3ee' }}
                />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title"><Thermometer size={16} /> Paramètres thermiques</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Température cible (°C) *</label>
                <input type="number" name="temperature_cible" className="form-input"
                  placeholder={params.type_projet === 'chambre_froide' ? 'ex: 4 ou -18' : 'ex: 22'}
                  value={params.temperature_cible} onChange={handleChange} step="0.5" />
                <span className="form-hint">
                  {params.type_projet === 'chambre_froide' ? 'Positif: froid (+2 à +8°C) | Négatif: congélation (-18 à -25°C)' : 'Confort: 22-24°C'}
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Température extérieure (°C)</label>
                <input type="number" name="temperature_exterieure" className="form-input"
                  placeholder="ex: 35" value={params.temperature_exterieure} onChange={handleChange} step="1" />
              </div>
              <div className="form-group">
                <label className="form-label">Humidité relative (%)</label>
                <input type="number" name="humidite_relative" className="form-input"
                  placeholder="ex: 60" value={params.humidite_relative} onChange={handleChange} step="1" min="10" max="100" />
              </div>
              <div className="form-group">
                <label className="form-label">Charge thermique (W) <span style={{ color: '#64748b', fontWeight: 400 }}>optionnel</span></label>
                <input type="number" name="charge_thermique" className="form-input"
                  placeholder="Calculée automatiquement" value={params.charge_thermique} onChange={handleChange} step="100" min="0" />
                <span className="form-hint">Laissez vide pour calcul automatique</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-cyan btn-lg" onClick={predire} disabled={loading} style={{ flex: 1 }}>
              {loading ? <div className="spinner" /> : <Cpu size={18} />}
              {loading ? 'Calcul en cours...' : 'Lancer la prédiction'}
            </button>
            <button className="btn btn-ghost" onClick={reinitialiser}>
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Résultats */}
        <div>
          {!resultat && !loading && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Cpu size={48} style={{ color: '#334155', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b', fontSize: 14 }}>
                Remplissez les paramètres et cliquez sur<br />"Lancer la prédiction" pour obtenir les résultats
              </p>
            </div>
          )}

          {loading && (
            <div className="card loading-overlay">
              <div className="spinner" />
              <span>Analyse en cours...</span>
            </div>
          )}

          {resultat && (
            <>
              <div className="prediction-result" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>Résultats de la prédiction</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Confiance:</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#22d3ee' }}>
                      {Math.round(resultat.confiance * 100)}%
                    </span>
                  </div>
                </div>

                <div className="confiance-bar" style={{ marginBottom: 20 }}>
                  <div className="confiance-fill" style={{ width: `${resultat.confiance * 100}%` }} />
                </div>

                <div className="prediction-grid">
                  {params.type_projet === 'adiabatique' && (
                    <div className="pred-item">
                      <div className="pred-value">{resultat.nb_unites_adiabatiques}</div>
                      <div className="pred-label">💨 Unités adiabatiques</div>
                    </div>
                  )}
                  {params.type_projet === 'chambre_froide' && (
                    <div className="pred-item">
                      <div className="pred-value">{resultat.nb_evaporateurs}</div>
                      <div className="pred-label">❄️ Évaporateurs</div>
                    </div>
                  )}
                  <div className="pred-item">
                    <div className="pred-value">{resultat.nb_condenseurs}</div>
                    <div className="pred-label">🔧 Condenseurs</div>
                  </div>
                  <div className="pred-item">
                    <div className="pred-value">{resultat.debit_air?.toLocaleString('fr-FR')}</div>
                    <div className="pred-label">💨 Débit air (m³/h)</div>
                  </div>
                  <div className="pred-item">
                    <div className="pred-value">{resultat.puissance_totale}</div>
                    <div className="pred-label">⚡ Puissance (kW)</div>
                  </div>
                </div>

                {/* Coûts */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase' }}>
                    Estimation des coûts
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: 'Équipements', value: resultat.cout_equipements },
                      { label: 'Installation', value: resultat.cout_installation },
                    ].map(c => (
                      <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>{c.label}</span>
                        <span style={{ fontSize: 13, color: '#f1f5f9' }}>{c.value?.toLocaleString('fr-FR')} TND</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid #334155', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Total estimé</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#22d3ee' }}>
                        {resultat.cout_total?.toLocaleString('fr-FR')} TND
                      </span>
                    </div>
                  </div>
                </div>

                {/* Source */}
                <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
                  <Info size={14} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Méthode:</strong> {resultat.explications?.methode}<br />
                    <strong>Norme:</strong> {resultat.explications?.norme_appliquee}<br />
                    <strong>Volume:</strong> {resultat.volume} m³ |{' '}
                    <strong>ΔT:</strong> {resultat.explications?.delta_temperature}°C |{' '}
                    <strong>Charge:</strong> {(resultat.charge_thermique / 1000).toFixed(1)} kW
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-success btn-sm" onClick={valider}>
                    <CheckCircle size={14} /> Valider la prédiction
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCorrection(!showCorrection)}>
                    <AlertTriangle size={14} /> Corriger
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowSave(!showSave)}>
                    <Save size={14} /> Sauvegarder
                  </button>
                </div>
              </div>

              {/* Formulaire correction */}
              {showCorrection && (
                <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(249,115,22,0.3)' }}>
                  <div className="card-title"><AlertTriangle size={16} style={{ color: '#fb923c' }} /> Corriger la prédiction</div>
                  <div className="form-grid" style={{ marginBottom: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Champ à corriger</label>
                      <select className="form-select"
                        value={correction.champ}
                        onChange={e => setCorrection(c => ({ ...c, champ: e.target.value }))}
                      >
                        <option value="">-- Sélectionner --</option>
                        {CHAMPS_CORRECTION.map(c => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Valeur correcte</label>
                      <input type="number" className="form-input"
                        placeholder="Valeur réelle"
                        value={correction.valeur}
                        onChange={e => setCorrection(c => ({ ...c, valeur: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Commentaire (optionnel)</label>
                    <textarea className="form-textarea"
                      placeholder="Expliquez pourquoi cette valeur est incorrecte..."
                      value={correction.commentaire}
                      onChange={e => setCorrection(c => ({ ...c, commentaire: e.target.value }))}
                      rows={2}
                    />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={soumettreCorrectionn}>
                    <ChevronRight size={14} /> Soumettre la correction
                  </button>
                </div>
              )}

              {/* Sauvegarde projet */}
              {showSave && (
                <div className="card" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
                  <div className="card-title"><Save size={16} /> Sauvegarder comme projet</div>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Nom du projet *</label>
                    <input className="form-input"
                      placeholder="ex: Chambre froide Hypermarché Tunis"
                      value={nomProjet}
                      onChange={e => setNomProjet(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={sauvegarder}>
                    <Save size={14} /> Sauvegarder dans la base
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
