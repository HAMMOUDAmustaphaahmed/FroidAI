import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload, Link, FileText, CheckCircle, AlertTriangle, ChevronRight,
  File, Globe, Type
} from 'lucide-react';
import { extractionService, predictionService } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const ONGLETS = [
  { id: 'fichier', label: 'Fichier', icon: File },
  { id: 'url', label: 'Site web', icon: Globe },
  { id: 'texte', label: 'Texte libre', icon: Type },
];

const LABELS_PARAMS = {
  longueur: 'Longueur (m)', largeur: 'Largeur (m)', hauteur: 'Hauteur (m)',
  surface: 'Surface (m²)', volume: 'Volume (m³)',
  temperature_cible: 'Température cible (°C)', temperature_exterieure: 'Température ext. (°C)',
  debit_air: 'Débit d\'air (m³/h)', puissance: 'Puissance (kW)',
  cout: 'Coût estimé', nb_unites: 'Unités adiabatiques',
  type_projet: 'Type de projet', humidite: 'Humidité (%)',
};

export default function Extraction() {
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState('fichier');
  const [url, setUrl] = useState('');
  const [texte, setTexte] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [fichier, setFichier] = useState(null);

  const onDrop = useCallback(accepted => {
    if (accepted.length > 0) setFichier(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const extraire = async () => {
    setLoading(true);
    setResultat(null);
    try {
      let res;
      if (onglet === 'fichier') {
        if (!fichier) { toast.error('Veuillez sélectionner un fichier'); setLoading(false); return; }
        res = await extractionService.depuisFichier(fichier);
      } else if (onglet === 'url') {
        if (!url.trim()) { toast.error('Veuillez saisir une URL'); setLoading(false); return; }
        res = await extractionService.depuisUrl(url);
      } else {
        if (!texte.trim()) { toast.error('Veuillez saisir du texte'); setLoading(false); return; }
        res = await extractionService.depuisTexte(texte);
      }
      setResultat(res.data);
      if (res.data.succes) toast.success('Extraction réussie !');
      else toast('Extraction partielle — vérifiez les paramètres', { icon: '⚠️' });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur d\'extraction');
    } finally {
      setLoading(false);
    }
  };

  const utiliserPourPrediction = () => {
    if (!resultat?.parametres) return;
    // Naviguer vers la page de prédiction avec les paramètres
    localStorage.setItem('froidai_params_extraction', JSON.stringify(resultat.parametres));
    toast.success('Paramètres transmis à la prédiction');
    navigate('/prediction');
  };

  const nbParams = resultat?.parametres ? Object.keys(resultat.parametres).length : 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Extraction de données</h1>
        <p className="page-subtitle">
          Importez des données depuis un PDF, Excel, un site web ou du texte libre
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Panneau gauche */}
        <div>
          {/* Onglets */}
          <div className="tabs">
            {ONGLETS.map(o => (
              <button
                key={o.id}
                className={`tab ${onglet === o.id ? 'active' : ''}`}
                onClick={() => { setOnglet(o.id); setResultat(null); }}
              >
                <o.icon size={13} style={{ marginRight: 5 }} />
                {o.label}
              </button>
            ))}
          </div>

          {/* Fichier */}
          {onglet === 'fichier' && (
            <div className="card">
              <div className="card-title"><Upload size={16} /> Déposer un fichier</div>
              <div
                {...getRootProps()}
                className={`dropzone ${isDragActive ? 'active' : ''}`}
                style={{ marginBottom: fichier ? 12 : 0 }}
              >
                <input {...getInputProps()} />
                <div className="dropzone-icon"><Upload size={22} /></div>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#cbd5e1' }}>
                  {isDragActive ? 'Déposez ici !' : 'Glissez-déposez votre fichier'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Formats acceptés: PDF, Excel (.xlsx, .xls), CSV
                </div>
              </div>

              {fichier && (
                <div style={{
                  marginTop: 12, padding: '10px 14px',
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <CheckCircle size={16} style={{ color: '#4ade80' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{fichier.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {(fichier.size / 1024).toFixed(1)} Ko
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* URL */}
          {onglet === 'url' && (
            <div className="card">
              <div className="card-title"><Globe size={16} /> URL d'un site web</div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Adresse URL</label>
                <input
                  className="form-input"
                  placeholder="https://exemple.com/fiche-technique"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  type="url"
                />
                <span className="form-hint">Le système extraira automatiquement les paramètres techniques</span>
              </div>
              <div className="alert alert-info">
                <Link size={14} style={{ flexShrink: 0 }} />
                <span>Idéal pour les fiches techniques, catalogues en ligne, ou pages de projets</span>
              </div>
            </div>
          )}

          {/* Texte */}
          {onglet === 'texte' && (
            <div className="card">
              <div className="card-title"><FileText size={16} /> Texte libre</div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Description du projet</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  placeholder={`Exemples de formats reconnus:
- Longueur: 20 m, Largeur: 15 m, Hauteur: 5 m
- Température cible: 4°C, Température extérieure: 35°C
- Débit d'air: 18000 m³/h
- Chambre froide de 300 m² pour stockage fruits
- Système adiabatique, surface: 1500 m², T=22°C`}
                  value={texte}
                  onChange={e => setTexte(e.target.value)}
                />
              </div>
              <div className="alert alert-info">
                <Type size={14} style={{ flexShrink: 0 }} />
                <span>Le système détecte automatiquement les dimensions, températures et débits dans votre texte</span>
              </div>
            </div>
          )}

          <button
            className="btn btn-cyan btn-lg"
            onClick={extraire}
            disabled={loading}
            style={{ marginTop: 16, width: '100%' }}
          >
            {loading ? <div className="spinner" /> : <ChevronRight size={18} />}
            {loading ? 'Extraction en cours...' : 'Extraire les paramètres'}
          </button>
        </div>

        {/* Résultats */}
        <div>
          {!resultat && !loading && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <FileText size={48} style={{ color: '#334155', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b', fontSize: 14 }}>
                Les paramètres extraits apparaîtront ici
              </p>
            </div>
          )}

          {loading && (
            <div className="card loading-overlay">
              <div className="spinner" />
              <span>Extraction en cours...</span>
            </div>
          )}

          {resultat && (
            <div>
              <div className="card" style={{
                marginBottom: 16,
                borderColor: resultat.succes ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  {resultat.succes
                    ? <CheckCircle size={20} style={{ color: '#4ade80' }} />
                    : <AlertTriangle size={20} style={{ color: '#fb923c' }} />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {resultat.succes ? 'Extraction réussie' : 'Extraction partielle'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {nbParams} paramètre(s) détecté(s)
                      {resultat.type === 'pdf' && ` | ${resultat.tableaux} tableau(x)`}
                      {resultat.nom_fichier && ` | ${resultat.nom_fichier}`}
                    </div>
                  </div>
                </div>

                {nbParams > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(resultat.parametres).map(([k, v]) => (
                      <div key={k} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                        borderRadius: 6, border: '1px solid #334155'
                      }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {LABELS_PARAMS[k] || k}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#22d3ee' }}>
                          {typeof v === 'number' ? v.toLocaleString('fr-FR') : v}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="alert alert-warning">
                    <AlertTriangle size={14} />
                    <span>Aucun paramètre détecté. Le document ne contient peut-être pas de données structurées reconnues.</span>
                  </div>
                )}
              </div>

              {nbParams > 0 && (
                <button className="btn btn-cyan" onClick={utiliserPourPrediction} style={{ width: '100%' }}>
                  <ChevronRight size={16} /> Utiliser pour la prédiction
                </button>
              )}

              {resultat.texte_extrait && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="card-title"><FileText size={14} /> Aperçu du texte extrait</div>
                  <pre style={{
                    fontSize: 11, color: '#64748b', overflow: 'auto',
                    maxHeight: 200, whiteSpace: 'pre-wrap', fontFamily: 'monospace'
                  }}>
                    {resultat.texte_extrait}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
