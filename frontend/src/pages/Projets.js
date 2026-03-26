import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Filter, Edit2, Trash2, CheckCircle, XCircle,
  FolderKanban, RefreshCw, X, Save
} from 'lucide-react';
import { projetService } from '../services/api';
import toast from 'react-hot-toast';

const TYPE_LABELS = {
  chambre_froide: { label: '❄️ Chambre froide', badge: 'badge-cyan' },
  adiabatique: { label: '💨 Adiabatique', badge: 'badge-blue' },
};

const CHAMPS_FORM = [
  { name: 'nom', label: 'Nom du projet *', type: 'text', col: 2 },
  { name: 'type_projet', label: 'Type', type: 'select', options: [
    { val: 'chambre_froide', label: 'Chambre froide' },
    { val: 'adiabatique', label: 'Adiabatique' },
  ]},
  { name: 'longueur', label: 'Longueur (m)', type: 'number' },
  { name: 'largeur', label: 'Largeur (m)', type: 'number' },
  { name: 'hauteur', label: 'Hauteur (m)', type: 'number' },
  { name: 'temperature_cible', label: 'Temp. cible (°C)', type: 'number' },
  { name: 'temperature_exterieure', label: 'Temp. ext. (°C)', type: 'number' },
  { name: 'debit_air', label: 'Débit d\'air (m³/h)', type: 'number' },
  { name: 'nb_unites_adiabatiques', label: 'Unités adiab.', type: 'number' },
  { name: 'nb_evaporateurs', label: 'Évaporateurs', type: 'number' },
  { name: 'nb_condenseurs', label: 'Condenseurs', type: 'number' },
  { name: 'puissance_totale', label: 'Puissance (kW)', type: 'number' },
  { name: 'cout_equipements', label: 'Coût équip. (TND)', type: 'number' },
  { name: 'cout_installation', label: 'Coût install. (TND)', type: 'number' },
  { name: 'cout_total', label: 'Coût total (TND)', type: 'number' },
  { name: 'notes', label: 'Notes', type: 'textarea', col: 2 },
];

const initForm = {
  nom: '', type_projet: 'chambre_froide', longueur: '', largeur: '', hauteur: '',
  temperature_cible: '', temperature_exterieure: '35', debit_air: '', humidite_relative: '60',
  nb_unites_adiabatiques: '', nb_evaporateurs: '', nb_condenseurs: '',
  puissance_totale: '', cout_equipements: '', cout_installation: '', cout_total: '',
  notes: '', valide: true,
};

export default function Projets() {
  const [projets, setProjets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [filtreValide, setFiltreValide] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(initForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { charger(); }, [filtreType, filtreValide]);

  const charger = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtreType) params.type_projet = filtreType;
      if (filtreValide !== '') params.valide = filtreValide === 'true';
      const res = await projetService.lister(params);
      setProjets(res.data);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const ouvrirModal = (projet = null) => {
    if (projet) {
      setForm({ ...initForm, ...projet });
      setEditId(projet.id);
    } else {
      setForm(initForm);
      setEditId(null);
    }
    setModal(true);
  };

  const sauvegarder = async () => {
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    setSaving(true);
    try {
      const payload = {};
      Object.keys(form).forEach(k => {
        const v = form[k];
        if (v === '' || v === null || v === undefined) return;
        payload[k] = typeof v === 'string' && !isNaN(v) && v !== '' && k !== 'nom' && k !== 'notes' && k !== 'type_projet'
          ? parseFloat(v) : v;
      });

      if (editId) {
        await projetService.modifier(editId, payload);
        toast.success('Projet modifié');
      } else {
        await projetService.creer(payload);
        toast.success('Projet créé');
      }
      setModal(false);
      charger();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async (id, nom) => {
    if (!window.confirm(`Supprimer le projet "${nom}" ?`)) return;
    try {
      await projetService.supprimer(id);
      toast.success('Projet supprimé');
      charger();
    } catch (e) {
      toast.error('Erreur suppression');
    }
  };

  const filtres = projets.filter(p => {
    if (!recherche) return true;
    return p.nom?.toLowerCase().includes(recherche.toLowerCase()) ||
           p.description?.toLowerCase().includes(recherche.toLowerCase());
  });

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">Projets</h1>
            <p className="page-subtitle">{projets.length} projet(s) dans la base de données</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={charger}>
              <RefreshCw size={14} />
            </button>
            <button className="btn btn-cyan" onClick={() => ouvrirModal()}>
              <Plus size={16} /> Nouveau projet
            </button>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 32 }}
            placeholder="Rechercher un projet..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: 180 }} value={filtreType} onChange={e => setFiltreType(e.target.value)}>
          <option value="">Tous les types</option>
          <option value="chambre_froide">Chambre froide</option>
          <option value="adiabatique">Adiabatique</option>
        </select>
        <select className="form-select" style={{ width: 160 }} value={filtreValide} onChange={e => setFiltreValide(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="true">Validés</option>
          <option value="false">Non validés</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-overlay"><div className="spinner" /><span>Chargement...</span></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th>Dimensions (m)</th>
                <th>Temp. cible</th>
                <th>Équipements</th>
                <th>Coût total</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtres.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
                  Aucun projet trouvé
                </td></tr>
              )}
              {filtres.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.nom}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{p.description || '—'}</div>
                  </td>
                  <td>
                    <span className={`badge ${TYPE_LABELS[p.type_projet]?.badge || 'badge-blue'}`}>
                      {TYPE_LABELS[p.type_projet]?.label || p.type_projet}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.longueur && p.largeur && p.hauteur
                      ? `${p.longueur}×${p.largeur}×${p.hauteur}`
                      : '—'}
                    {p.surface ? <div style={{ color: '#64748b' }}>{p.surface} m²</div> : null}
                  </td>
                  <td>
                    {p.temperature_cible != null
                      ? <span style={{ color: p.temperature_cible < 0 ? '#818cf8' : '#22d3ee' }}>
                          {p.temperature_cible}°C
                        </span>
                      : '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.type_projet === 'adiabatique'
                      ? <div>💨 {p.nb_unites_adiabatiques ?? '—'} unités</div>
                      : <div>❄️ {p.nb_evaporateurs ?? '—'} évap.</div>}
                    <div style={{ color: '#64748b' }}>🔧 {p.nb_condenseurs ?? '—'} cond.</div>
                    {p.debit_air ? <div style={{ color: '#64748b' }}>{p.debit_air?.toLocaleString('fr-FR')} m³/h</div> : null}
                  </td>
                  <td>
                    {p.cout_total
                      ? <span style={{ color: '#4ade80', fontWeight: 600 }}>{p.cout_total?.toLocaleString('fr-FR')} TND</span>
                      : '—'}
                  </td>
                  <td>
                    {p.valide
                      ? <span className="badge badge-green"><CheckCircle size={11} /> Validé</span>
                      : <span className="badge badge-orange"><XCircle size={11} /> En attente</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => ouvrirModal(p)} title="Modifier">
                        <Edit2 size={13} />
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => supprimer(p.id, p.nom)} title="Supprimer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création/édition */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <div className="modal-title">
                {editId ? '✏️ Modifier le projet' : '➕ Nouveau projet'}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {CHAMPS_FORM.map(f => (
                <div key={f.name} className="form-group" style={{ gridColumn: f.col === 2 ? '1 / -1' : undefined }}>
                  <label className="form-label">{f.label}</label>
                  {f.type === 'select' ? (
                    <select className="form-select" value={form[f.name] || ''} onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))}>
                      {f.options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea className="form-textarea" rows={2} value={form[f.name] || ''} onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))} />
                  ) : (
                    <input type={f.type} className="form-input" step="any" value={form[f.name] || ''} onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))} />
                  )}
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Statut</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn btn-sm ${form.valide ? 'btn-success' : 'btn-ghost'}`}
                    onClick={() => setForm(p => ({ ...p, valide: true }))}
                  ><CheckCircle size={13} /> Validé</button>
                  <button
                    className={`btn btn-sm ${!form.valide ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => setForm(p => ({ ...p, valide: false }))}
                  ><XCircle size={13} /> En attente</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Annuler</button>
              <button className="btn btn-cyan" onClick={sauvegarder} disabled={saving}>
                {saving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
