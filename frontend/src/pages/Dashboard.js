import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts';
import { TrendingUp, Cpu, RefreshCw } from 'lucide-react';
import { projetService, modeleService } from '../services/api';
import toast from 'react-hot-toast';

const COLORS = ['#22d3ee', '#3b82f6', '#a855f7', '#22c55e', '#f97316'];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [statut, setStatut] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entrainement, setEntrainement] = useState(false);

  useEffect(() => { chargerDonnees(); }, []); // eslint-disable-line

  const chargerDonnees = async () => {
    setLoading(true);
    try {
      const [statsRes, statutRes] = await Promise.all([
        projetService.statistiques(),
        modeleService.statut(),
      ]);
      setStats(statsRes.data);
      setStatut(statutRes.data);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const entrainerModele = async () => {
    setEntrainement(true);
    try {
      const res = await modeleService.entrainer();
      toast.success(res.data.message || 'Modèle entraîné !');
      chargerDonnees();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur entraînement');
    } finally {
      setEntrainement(false);
    }
  };

  if (loading) return (
    <div className="loading-overlay">
      <div className="spinner" />
      <span>Chargement du tableau de bord...</span>
    </div>
  );

  const pieData = stats?.par_type?.map(t => ({
    name: t.type_projet === 'chambre_froide' ? 'Chambres froides' : 'Adiabatique',
    value: t.nb,
    cout: Math.round(t.cout_moyen || 0),
  })) || [];

  const metriqueKeys = statut?.metriques ? Object.keys(statut.metriques) : [];

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Tableau de bord</h1>
            <p className="page-subtitle">Vue d'ensemble de votre système FroidAI</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={chargerDonnees}>
              <RefreshCw size={14} /> Actualiser
            </button>
            {statut?.pret_a_entrainer && (
              <button
                className="btn btn-cyan btn-sm"
                onClick={entrainerModele}
                disabled={entrainement}
              >
                {entrainement ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Cpu size={14} />}
                {entrainement ? 'Entraînement...' : 'Entraîner le modèle'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cartes statistiques */}
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-label">Total projets</div>
          <div className="stat-value">{stats?.total_projets || 0}</div>
          <div className="stat-unit">projets enregistrés</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Projets validés</div>
          <div className="stat-value">{stats?.projets_valides || 0}</div>
          <div className="stat-unit">données d'entraînement</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Corrections</div>
          <div className="stat-value">{stats?.nb_corrections || 0}</div>
          <div className="stat-unit">feedbacks reçus</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-label">Coût moyen</div>
          <div className="stat-value">
            {stats?.moyennes?.moy_cout ? Math.round(stats.moyennes.moy_cout / 1000) + 'k' : 'N/A'}
          </div>
          <div className="stat-unit">TND par projet</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">Statut modèle</div>
          <div className="stat-value" style={{ fontSize: 16, paddingTop: 4 }}>
            <span className={`dot dot-${statut?.modele_entraine ? 'green' : 'orange'}`} style={{ display: 'inline-block', marginRight: 6 }} />
            {statut?.modele_entraine ? 'ML Actif' : 'Physique'}
          </div>
          <div className="stat-unit">{statut?.algorithme}</div>
        </div>
      </div>

      {/* Alerte modèle */}
      {!statut?.modele_entraine && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <TrendingUp size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Modèle IA non entraîné.</strong> Les prédictions utilisent les formules physiques.
            {statut?.pret_a_entrainer
              ? ' Cliquez sur "Entraîner le modèle" pour activer le ML.'
              : ` Il faut au moins 3 projets validés (${statut?.nb_projets_disponibles || 0} disponibles).`}
          </div>
        </div>
      )}

      {/* Graphiques */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Répartition par type</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [v + ' projets', 'Nombre']}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="loading-overlay" style={{ padding: 40 }}>Aucune donnée</div>}
        </div>

        <div className="card">
          <div className="card-title">Coût moyen par type (TND)</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pieData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v} />
                <Tooltip
                  formatter={(v) => [Number(v).toLocaleString('fr-FR') + ' TND', 'Coût moyen']}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9' }}
                />
                <Bar dataKey="cout" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="loading-overlay" style={{ padding: 40 }}>Aucune donnée</div>}
        </div>
      </div>

      {/* Métriques du modèle */}
      {statut?.modele_entraine && metriqueKeys.length > 0 && (
        <div className="card">
          <div className="card-title"><Cpu size={16} /> Métriques du modèle ML</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {metriqueKeys.slice(0, 6).map(key => (
              <div key={key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 16px', border: '1px solid #334155' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{key.replace(/_/g, ' ')}</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#22d3ee' }}>
                      {((statut.metriques[key]?.r2 || 0) * 100).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>R²</span>
                  </div>
                  <div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
                      {(statut.metriques[key]?.mae || 0).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>MAE</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
