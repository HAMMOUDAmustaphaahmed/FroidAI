import React, { useState, useEffect } from 'react';
import {
  Package, Search, Plus, Star, Zap, Wind, Thermometer,
  CheckCircle, ShoppingCart, X, ChevronRight, Filter
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = 'http://localhost:8000/api';

const TYPE_COLORS = {
  adiabatique_iec: 'badge-cyan',
  adiabatique_supercool: 'badge-blue',
  evaporatif_direct: 'badge-orange',
};

const TYPE_LABELS = {
  adiabatique_iec: '💨 Adiabatique IEC',
  adiabatique_supercool: '❄️ Supercool',
  evaporatif_direct: '💧 Évaporatif direct',
};

export default function Catalogue() {
  const [equipements, setEquipements] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [filtreGamme, setFiltreGamme] = useState('');
  const [onglet, setOnglet] = useState('catalogue');
  const [detail, setDetail] = useState(null);
  const [ajoutStock, setAjoutStock] = useState(null);
  const [formStock, setFormStock] = useState({ quantite: 1, etat: 'neuf', localisation: '', prix_achat: '', notes: '' });

  useEffect(() => { charger(); }, [filtreType, filtreGamme]);

  const charger = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtreType) params.type_equipement = filtreType;
      if (filtreGamme) params.gamme = filtreGamme;
      const [catRes, stockRes] = await Promise.all([
        axios.get(`${API}/catalogue/`, { params }),
        axios.get(`${API}/catalogue/stock/liste`),
      ]);
      setEquipements(catRes.data);
      setStock(stockRes.data);
    } catch (e) {
      toast.error('Erreur chargement catalogue');
    } finally {
      setLoading(false);
    }
  };

  const ajouterAuStock = async () => {
    try {
      await axios.post(`${API}/catalogue/stock/ajouter`, {
        reference_catalogue: ajoutStock.reference,
        equipement_id: ajoutStock.id,
        ...formStock,
        quantite: parseInt(formStock.quantite) || 1,
        prix_achat: formStock.prix_achat ? parseFloat(formStock.prix_achat) : null,
      });
      toast.success('Équipement ajouté au stock !');
      setAjoutStock(null);
      charger();
    } catch (e) {
      toast.error('Erreur ajout stock');
    }
  };

  const supprimerStock = async (id) => {
    if (!window.confirm('Retirer du stock ?')) return;
    try {
      await axios.delete(`${API}/catalogue/stock/${id}`);
      toast.success('Retiré du stock');
      charger();
    } catch (e) {
      toast.error('Erreur');
    }
  };

  const filtres = equipements.filter(eq => {
    if (!filtre) return true;
    const q = filtre.toLowerCase();
    return eq.reference?.toLowerCase().includes(q) ||
           eq.description?.toLowerCase().includes(q) ||
           eq.gamme?.toLowerCase().includes(q);
  });

  const gammes = [...new Set(equipements.map(e => e.gamme))];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Catalogue d'équipements</h1>
        <p className="page-subtitle">
          Équipements Seeley International — {equipements.length} références | {stock.length} en stock
        </p>
      </div>

      {/* Onglets */}
      <div className="tabs">
        {[
          { id: 'catalogue', label: `📦 Catalogue (${equipements.length})` },
          { id: 'stock', label: `🏭 Mon stock (${stock.length})` },
        ].map(o => (
          <button key={o.id} className={`tab ${onglet === o.id ? 'active' : ''}`} onClick={() => setOnglet(o.id)}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'catalogue' && (
        <>
          {/* Filtres */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input className="form-input" style={{ paddingLeft: 32 }}
                placeholder="Rechercher un modèle..." value={filtre} onChange={e => setFiltre(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 200 }} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
              <option value="">Tous les types</option>
              <option value="adiabatique_iec">Adiabatique IEC</option>
              <option value="adiabatique_supercool">Supercool</option>
              <option value="evaporatif_direct">Évaporatif direct</option>
            </select>
            <select className="form-select" style={{ width: 150 }} value={filtreGamme} onChange={e => setFiltreGamme(e.target.value)}>
              <option value="">Toutes gammes</option>
              {gammes.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="loading-overlay"><div className="spinner" /><span>Chargement...</span></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {filtres.map(eq => (
                <div key={eq.id} className="card" style={{
                  cursor: 'pointer', transition: 'border-color 0.15s',
                  borderColor: eq.en_stock ? 'rgba(34,197,94,0.4)' : '#334155',
                  position: 'relative'
                }}>
                  {eq.en_stock > 0 && (
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.5)',
                      borderRadius: 6, padding: '2px 8px', fontSize: 10, color: '#4ade80', fontWeight: 700
                    }}>
                      ✓ EN STOCK ({eq.quantite_stock})
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#22d3ee' }}>{eq.reference}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{eq.fabricant} — {eq.marque}</div>
                    </div>
                    <span className={`badge ${TYPE_COLORS[eq.type_equipement] || 'badge-blue'}`}>
                      {TYPE_LABELS[eq.type_equipement] || eq.type_equipement}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, lineHeight: 1.4 }}>
                    {eq.description}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { icon: '💨', label: 'Débit air', val: eq.debit_air_nominal ? `${(eq.debit_air_nominal/1000).toFixed(1)}k m³/h` : '—' },
                      { icon: '⚡', label: 'Puissance', val: eq.puissance_electrique ? `${eq.puissance_electrique} kW` : '—' },
                      { icon: '❄️', label: 'Frigo', val: eq.puissance_refroidissement_standalone ? `${eq.puissance_refroidissement_standalone} kW` : '—' },
                      { icon: '🌡️', label: 'T° soufflage', val: eq.temperature_soufflage ? `${eq.temperature_soufflage}°C` : 'Direct' },
                      { icon: '📊', label: 'COP', val: eq.cop_standalone ? `${eq.cop_standalone}` : '—' },
                      { icon: '💰', label: 'Prix ~', val: eq.prix_indicatif_eur ? `${(eq.prix_indicatif_eur).toLocaleString('fr-FR')} €` : '—' },
                    ].map(item => (
                      <div key={item.label} style={{ textAlign: 'center', padding: '6px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                        <div style={{ fontSize: 14 }}>{item.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{item.val}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setDetail(eq)}>
                      <ChevronRight size={13} /> Détails
                    </button>
                    <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => { setAjoutStock(eq); setFormStock({ quantite: 1, etat: 'neuf', localisation: '', prix_achat: '', notes: '' }); }}>
                      <Plus size={13} /> Ajouter stock
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {onglet === 'stock' && (
        <div>
          {stock.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <Package size={48} style={{ color: '#334155', margin: '0 auto 16px' }} />
              <p style={{ color: '#64748b' }}>Aucun équipement en stock.<br />Ajoutez des équipements depuis le catalogue.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Description</th>
                    <th>Quantité</th>
                    <th>État</th>
                    <th>Localisation</th>
                    <th>Prix achat</th>
                    <th>Surface couverte</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map(s => (
                    <tr key={s.id}>
                      <td>
                        <span style={{ fontWeight: 700, color: '#22d3ee' }}>{s.reference_catalogue}</span>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{s.gamme} — {s.fabricant}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{s.description || '—'}</td>
                      <td>
                        <span className="badge badge-blue">{s.quantite} unité(s)</span>
                      </td>
                      <td>
                        <span className={`badge ${s.etat === 'neuf' ? 'badge-green' : s.etat === 'occasion' ? 'badge-orange' : 'badge-red'}`}>
                          {s.etat}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{s.localisation || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {s.prix_achat ? `${parseFloat(s.prix_achat).toLocaleString('fr-FR')} TND` : '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.surface_couverte_indicative
                          ? `${Math.round(s.surface_couverte_indicative * (s.quantite || 1))} m²`
                          : '—'}
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => supprimerStock(s.id)}>
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal détail */}
      {detail && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{detail.reference}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{detail.marque} — {detail.doc_reference}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { section: '💨 Aéraulique', items: [
                  ['Débit nominal', `${detail.debit_air_nominal?.toLocaleString('fr-FR')} m³/h`],
                  ['Débit min', `${detail.debit_air_min?.toLocaleString('fr-FR')} m³/h`],
                  ['Débit max', `${detail.debit_air_max?.toLocaleString('fr-FR')} m³/h`],
                  ['Pression statique max', `${detail.pression_statique_max} Pa`],
                  ['Type ventilateur', detail.type_ventilateur],
                  ['Vitesse max', `${detail.vitesse_max_rpm} tr/min`],
                  ['Contrôle', detail.controle],
                ]},
                { section: '⚡ Électrique', items: [
                  ['Tension', detail.tension],
                  ['Courant nominal', `${detail.courant_nominal} A`],
                  ['Puissance électrique', `${detail.puissance_electrique} kW`],
                  ['Puissance frigo standalone', `${detail.puissance_refroidissement_standalone} kW`],
                  ['Puissance frigo pre-cooling', `${detail.puissance_refroidissement_precooling || '—'} kW`],
                  ['COP standalone', detail.cop_standalone],
                  ['COP pre-cooling', detail.cop_precooling || '—'],
                ]},
                { section: '🌡️ Thermique', items: [
                  ['Température soufflage', detail.temperature_soufflage ? `${detail.temperature_soufflage}°C` : 'Direct'],
                  ['T° soufflage min', detail.temperature_soufflage_min ? `${detail.temperature_soufflage_min}°C` : '—'],
                  ['T° soufflage max', detail.temperature_soufflage_max ? `${detail.temperature_soufflage_max}°C` : '—'],
                  ['T° air entrée max', `${detail.temp_air_entree_max}°C`],
                  ['Échangeurs indirects', detail.nb_echangeurs_indirect],
                  ['Échangeurs directs', detail.nb_echangeurs_direct],
                ]},
                { section: '💧 Eau', items: [
                  ['Consommation eau', detail.debit_eau ? `${detail.debit_eau} L/h` : '—'],
                  ['Pression eau', `${detail.pression_eau_min || '—'}–${detail.pression_eau_max || '—'} kPa`],
                  ['Réservoir', `${detail.reservoir_litres} L`],
                  ['Dimensions (mm)', `${detail.dimension_longueur}×${detail.dimension_largeur}×${detail.dimension_hauteur}`],
                  ['Poids opération', `${detail.poids_operation} kg`],
                  ['Surface couverte ~', `${detail.surface_couverte_indicative} m²`],
                ]},
              ].map(s => (
                <div key={s.section} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12, border: '1px solid #334155' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{s.section}</div>
                  {s.items.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#64748b' }}>{k}</span>
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: 10, background: 'rgba(34,197,94,0.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)', fontSize: 12 }}>
              <span style={{ color: '#4ade80', fontWeight: 600 }}>Prix indicatif : </span>
              <span style={{ color: '#f1f5f9' }}>{detail.prix_indicatif_eur?.toLocaleString('fr-FR')} € ≈ {Math.round((detail.prix_indicatif_eur || 0) * 3.3).toLocaleString('fr-FR')} TND</span>
              <span style={{ color: '#64748b', marginLeft: 16 }}>| Certifications : {detail.certifications}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajout stock */}
      {ajoutStock && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAjoutStock(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">➕ Ajouter au stock — {ajoutStock.reference}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setAjoutStock(null)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { name: 'quantite', label: 'Quantité', type: 'number' },
                { name: 'etat', label: 'État', type: 'select', options: ['neuf', 'occasion', 'reconditionné'] },
                { name: 'localisation', label: 'Localisation / Entrepôt', type: 'text' },
                { name: 'prix_achat', label: 'Prix d\'achat (TND)', type: 'number' },
                { name: 'notes', label: 'Notes', type: 'textarea' },
              ].map(f => (
                <div key={f.name} className="form-group">
                  <label className="form-label">{f.label}</label>
                  {f.type === 'select' ? (
                    <select className="form-select" value={formStock[f.name]} onChange={e => setFormStock(p => ({ ...p, [f.name]: e.target.value }))}>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea className="form-textarea" rows={2} value={formStock[f.name]} onChange={e => setFormStock(p => ({ ...p, [f.name]: e.target.value }))} />
                  ) : (
                    <input type={f.type} className="form-input" value={formStock[f.name]} onChange={e => setFormStock(p => ({ ...p, [f.name]: e.target.value }))} />
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setAjoutStock(null)}>Annuler</button>
                <button className="btn btn-success" style={{ flex: 1 }} onClick={ajouterAuStock}>
                  <CheckCircle size={14} /> Confirmer l'ajout au stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
