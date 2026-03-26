import React, { useState, useEffect } from 'react';
import {
  Cpu, TrendingUp, RefreshCw, Play, Trash2, CheckCircle,
  XCircle, AlertTriangle, BarChart2, Clock, MessageSquare
} from 'lucide-react';
import { modeleService } from '../services/api';
import toast from 'react-hot-toast';

const LABEL_METRIQUES = {
  nb_unites_adiabatiques: '💨 Unités adiabatiques',
  nb_evaporateurs: '❄️ Évaporateurs',
  nb_condenseurs: '🔧 Condenseurs',
  debit_air: '🌀 Débit d\'air',
  puissance_totale: '⚡ Puissance',
  cout_total: '💰 Coût total',
};

export default function Modele() {
  const [statut, setStatut] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entrainement, setEntrainement] = useState(false);
  const [onglet, setOnglet] = useState('statut');

  useEffect(() => { charger(); }, []);

  const charger = async () => {
    setLoading(true);
    try {
      const [statRes, corrRes] = await Promise.all([
        modeleService.statut(),
        modeleService.corrections(),
      ]);
      setStatut(statRes.data);
      setCorrections(corrRes.data);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const entrainer = async () => {
    setEntrainement(true);
    try {
      const res = await modeleService.entrainer();
      if (res.data.succes) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
      charger();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur d\'entraînement');
    } finally {
      setEntrainement(false);
    }
  };

  const reinitialiser = async () => {
    if (!window.confirm('Réinitialiser le modèle ? Les prédictions utiliseront les formules physiques.')) return;
    try {
      await modeleService.reinitialiser();
      toast.success('Modèle réinitialisé');
      charger();
    } catch (e) {
      toast.error('Erreur lors de la réinitialisation');
    }
  };

  if (loading) return (
    <div className="loading-overlay"><div className="spinner" /><span>Chargement...</span></div>
  );

  const metriques = statut?.metriques || {};
  const nbMetriques = Object.keys(metriques).length;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Modèle IA</h1>
            <p className="page-subtitle">Gestion et entraînement du moteur de prédiction</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={charger}>
              <RefreshCw size={14} />
            </button>
            {statut?.modele_entraine && (
              <button className="btn btn-danger btn-sm" onClick={reinitialiser}>
                <Trash2 size={14} /> Réinitialiser
              </button>
            )}
            <button
              className="btn btn-cyan"
              onClick={entrainer}
              disabled={entrainement || !statut?.pret_a_entrainer}
              title={!statut?.pret_a_entrainer ? 'Il faut au moins 3 projets validés' : ''}
            >
              {entrainement ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
              {entrainement ? 'Entraînement...' : statut?.modele_entraine ? 'Ré-entraîner' : 'Entraîner le modèle'}
            </button>
          </div>
        </div>
      </div>

      {/* Statut principal */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className={`stat-card ${statut?.modele_entraine ? 'green' : 'orange'}`}>
          <div className="stat-label">Statut</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span className={`dot dot-${statut?.modele_entraine ? 'green' : 'orange'}`} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {statut?.modele_entraine ? 'ML Actif' : 'Physique uniquement'}
            </span>
          </div>
          <div className="stat-unit" style={{ marginTop: 4 }}>{statut?.algorithme}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Projets validés</div>
          <div className="stat-value">{statut?.nb_projets_disponibles || 0}</div>
          <div className="stat-unit">données d'entraînement</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Corrections reçues</div>
          <div className="stat-value">{statut?.nb_corrections || 0}</div>
          <div className="stat-unit">feedbacks utilisateurs</div>
        </div>
        <div className={`stat-card ${statut?.pret_a_entrainer ? 'green' : 'orange'}`}>
          <div className="stat-label">Prêt à entraîner</div>
          <div style={{ marginTop: 6 }}>
            {statut?.pret_a_entrainer
              ? <span className="badge badge-green"><CheckCircle size={12} /> Oui</span>
              : <span className="badge badge-orange"><AlertTriangle size={12} /> Non (min. 3)</span>}
          </div>
          <div className="stat-unit" style={{ marginTop: 4 }}>
            {statut?.nb_projets_disponibles || 0} / 3 minimum
          </div>
        </div>
      </div>

      {/* Alerte si pas prêt */}
      {!statut?.pret_a_entrainer && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>Données insuffisantes pour entraîner le modèle ML.</strong>
            <br />Ajoutez au moins {3 - (statut?.nb_projets_disponibles || 0)} projet(s) validé(s) supplémentaire(s) dans la section "Projets".
            Des données d'exemple ont été pré-chargées pour vous permettre de commencer immédiatement.
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="tabs">
        {[
          { id: 'statut', label: '📊 Métriques' },
          { id: 'corrections', label: `💬 Corrections (${corrections.length})` },
          { id: 'aide', label: '📖 Guide' },
        ].map(o => (
          <button key={o.id} className={`tab ${onglet === o.id ? 'active' : ''}`} onClick={() => setOnglet(o.id)}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Métriques */}
      {onglet === 'statut' && (
        <div>
          {!statut?.modele_entraine ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Cpu size={48} style={{ color: '#334155', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b' }}>
                Le modèle n'est pas encore entraîné.<br />
                Cliquez sur "Entraîner le modèle" pour commencer.
              </p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
                {Object.entries(metriques).map(([key, val]) => (
                  <div key={key} className="card">
                    <div className="card-title">
                      <BarChart2 size={14} />
                      {LABEL_METRIQUES[key] || key.replace(/_/g, ' ')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#22d3ee' }}>
                          {(val.r2 * 100).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Score R² (précision)</div>
                        <div style={{ marginTop: 8 }}>
                          <div className="confiance-bar">
                            <div className="confiance-fill" style={{ width: `${Math.max(0, val.r2 * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>
                          {val.mae.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Erreur MAE moyenne</div>
                        <div style={{ fontSize: 11, color: val.r2 > 0.8 ? '#4ade80' : val.r2 > 0.6 ? '#fb923c' : '#f87171', marginTop: 6 }}>
                          {val.r2 > 0.8 ? '✅ Excellent' : val.r2 > 0.6 ? '⚠️ Acceptable' : '❌ À améliorer'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="alert alert-info">
                <TrendingUp size={14} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Comment améliorer la précision ?</strong> Ajoutez plus de projets validés, corrigez les prédictions erronées,
                  et ré-entraînez régulièrement le modèle. Chaque correction améliore la précision future.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Corrections */}
      {onglet === 'corrections' && (
        <div>
          {corrections.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <MessageSquare size={48} style={{ color: '#334155', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b' }}>
                Aucune correction enregistrée.<br />
                Les corrections des utilisateurs apparaissent ici pour améliorer le modèle.
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Projet</th>
                    <th>Champ corrigé</th>
                    <th>Valeur originale</th>
                    <th>Valeur corrigée</th>
                    <th>Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize: 11, color: '#64748b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={11} />
                          {new Date(c.date_correction).toLocaleDateString('fr-FR')}
                        </div>
                      </td>
                      <td>{c.projet_nom || <span style={{ color: '#64748b' }}>—</span>}</td>
                      <td>
                        <span className="badge badge-blue">
                          {LABEL_METRIQUES[c.champ] || c.champ}
                        </span>
                      </td>
                      <td style={{ color: '#f87171' }}>{c.prediction_originale}</td>
                      <td style={{ color: '#4ade80', fontWeight: 600 }}>{c.valeur_corrigee}</td>
                      <td style={{ fontSize: 12, color: '#94a3b8' }}>{c.commentaire || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {corrections.length > 0 && (
            <div className="alert alert-success" style={{ marginTop: 16 }}>
              <CheckCircle size={14} style={{ flexShrink: 0 }} />
              <span>
                {corrections.length} correction(s) enregistrée(s). Ré-entraînez le modèle pour intégrer ces corrections.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Guide */}
      {onglet === 'aide' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[
            {
              titre: '🧠 Comment fonctionne FroidAI ?',
              contenu: [
                'Phase 1 : Les prédictions utilisent des formules physiques (normes EN 378, ASHRAE)',
                'Phase 2 : Après entraînement, le modèle ML (Gradient Boosting) combine physique + données historiques',
                'Phase 3 : Chaque correction améliore le modèle lors du prochain entraînement',
              ]
            },
            {
              titre: '📈 Améliorer la précision',
              contenu: [
                'Ajoutez un maximum de projets réels validés dans la base',
                'Corrigez les prédictions incorrectes depuis la page Prédiction',
                'Ré-entraînez le modèle régulièrement (après chaque 5-10 nouveaux projets)',
                'Vérifiez que les données saisies sont cohérentes et complètes',
              ]
            },
            {
              titre: '⚡ Algorithmes utilisés',
              contenu: [
                'Gradient Boosting Regressor (scikit-learn) — algorithme principal',
                'XGBoost — activé automatiquement si disponible et ≥10 projets',
                'Multi-output regression — prédiction simultanée de 6 variables',
                'Formules physiques EN 378 — calculs de base garantis',
              ]
            },
            {
              titre: '💡 Conseils d\'utilisation',
              contenu: [
                'Saisissez toujours la charge thermique réelle si elle est connue',
                'La température extérieure doit être la température de design (été)',
                'Pour chambres froides: vérifiez l\'isolation (polyuréthane 100mm par défaut)',
                'Pour adiabatique: l\'humidité relative est un facteur clé',
              ]
            },
          ].map(section => (
            <div key={section.titre} className="card">
              <div className="card-title">{section.titre}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.contenu.map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#94a3b8' }}>
                    <span style={{ color: '#22d3ee', flexShrink: 0 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
