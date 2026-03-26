import React, { useState, useEffect, useRef } from 'react';
import { Brain, RefreshCw, TrendingUp, Database, Activity, Layers, Settings2, BarChart2, AlertTriangle, CheckCircle, Info, Cpu, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell } from 'recharts';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = 'http://localhost:8000/api';
const LAYER_COLORS = { Input:'#22d3ee', BatchNorm1d:'#64748b', Dense:'#3b82f6', Dropout:'#f97316', Output:'#4ade80' };
const METRIC_COLORS = ['#22d3ee','#3b82f6','#a855f7','#4ade80','#fb923c','#f87171'];

function CanvasReseau({ architecture, actif }) {
  const ref = useRef(null);
  const animRef = useRef(null);
  const tick = useRef(0);
  const particles = useRef([]);
  const couches = (architecture||[]).filter(l => ['Input','Dense','Output'].includes(l.type));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || couches.length === 0) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, PAD = 55, MAX = 8;
    const positions = couches.map((layer, ci) => {
      const x = PAD + ci * (W - PAD*2) / Math.max(1, couches.length - 1);
      const nb = Math.min(layer.neurones, MAX);
      const color = LAYER_COLORS[layer.type] || '#3b82f6';
      return Array.from({length: nb}, (_,ni) => ({
        x, y: H/2 + (ni - (nb-1)/2) * (H/(nb+2)), color,
        label: layer.type==='Input'?`x${ni+1}`:layer.type==='Output'?['U','D','kW','€','E','C'][ni]||`y${ni+1}`:'',
        extra: layer.neurones > MAX && ni===nb-1 ? `+${layer.neurones-MAX}` : null,
      }));
    });

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      tick.current++;
      for (let li=0; li<positions.length-1; li++) {
        positions[li].forEach(a => positions[li+1].forEach(b => {
          const g = actif && Math.sin(tick.current*0.04+a.y+b.x)>0.6;
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
          ctx.strokeStyle = g?'rgba(59,130,246,0.3)':'rgba(51,65,85,0.28)';
          ctx.lineWidth = g?1.2:0.5; ctx.stroke();
        }));
      }
      if (actif && tick.current%2===0) {
        const li = Math.floor(Math.random()*(positions.length-1));
        const f = positions[li][Math.floor(Math.random()*positions[li].length)];
        const t = positions[li+1][Math.floor(Math.random()*positions[li+1].length)];
        particles.current.push({x:f.x,y:f.y,tx:t.x,ty:t.y,t:0,speed:0.011+Math.random()*0.007,color:f.color});
      }
      particles.current = particles.current.filter(p=>p.t<=1);
      particles.current.forEach(p => {
        p.t += p.speed;
        const px=p.x+(p.tx-p.x)*p.t, py=p.y+(p.ty-p.y)*p.t;
        ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2);
        ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=9; ctx.fill(); ctx.shadowBlur=0;
      });
      positions.forEach((layer,li) => {
        const info = couches[li];
        layer.forEach((n,ni) => {
          const pulse = actif ? 0.5+0.5*Math.sin(tick.current*0.07+li*1.5+ni*0.8) : 0.6;
          if (actif) {
            const g = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,22);
            g.addColorStop(0,n.color+'33'); g.addColorStop(1,'transparent');
            ctx.beginPath(); ctx.arc(n.x,n.y,22,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
          }
          ctx.beginPath(); ctx.arc(n.x,n.y,13,0,Math.PI*2);
          ctx.fillStyle='#0f172a'; ctx.fill();
          ctx.strokeStyle=n.color; ctx.lineWidth=actif?1.5+pulse*0.7:1.5; ctx.stroke();
          ctx.fillStyle='#cbd5e1'; ctx.font='8px Inter,sans-serif'; ctx.textAlign='center';
          ctx.fillText(n.label||'', n.x, n.y+3.5);
          if (n.extra) { ctx.fillStyle='#64748b'; ctx.font='8px Inter'; ctx.fillText(n.extra, n.x, n.y+27); }
        });
        ctx.fillStyle=(LAYER_COLORS[info.type]||'#64748b')+'cc';
        ctx.font='bold 9px Inter,sans-serif'; ctx.textAlign='center';
        ctx.fillText(info.type, positions[li][0].x, H-14);
        ctx.fillStyle='#475569'; ctx.font='8px Inter';
        ctx.fillText(`(${info.neurones})`, positions[li][0].x, H-3);
      });
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [actif, architecture]);

  return <canvas ref={ref} width={600} height={310} style={{width:'100%',height:'auto',borderRadius:12,background:'rgba(0,0,0,0.35)',border:'1px solid #334155'}}/>;
}

function TableauArch({ couches }) {
  return (
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{background:'#1e293b'}}>
          {['#','Type','Neurones','Activation','Rôle','Paramètres'].map(h=>(
            <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'#64748b',fontWeight:700,fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #334155'}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {couches.map((c,i)=>(
            <tr key={i} style={{borderBottom:'1px solid rgba(51,65,85,0.4)'}}>
              <td style={{padding:'7px 10px',color:'#64748b'}}>{i+1}</td>
              <td style={{padding:'7px 10px'}}>
                <span style={{background:(LAYER_COLORS[c.type]||'#64748b')+'20',color:LAYER_COLORS[c.type]||'#64748b',border:`1px solid ${(LAYER_COLORS[c.type]||'#64748b')}40`,borderRadius:4,padding:'2px 7px',fontSize:11,fontWeight:700}}>{c.type}</span>
              </td>
              <td style={{padding:'7px 10px',color:'#e2e8f0',fontWeight:600}}>{c.neurones||'—'}</td>
              <td style={{padding:'7px 10px'}}>
                <span style={{color:c.activation==='ReLU'?'#fb923c':c.activation==='Linear'?'#4ade80':'#64748b',fontWeight:600}}>{c.activation||'—'}</span>
              </td>
              <td style={{padding:'7px 10px',color:'#94a3b8',fontSize:11}}>{c.description}</td>
              <td style={{padding:'7px 10px',color:'#64748b',fontSize:10,fontFamily:'monospace'}}>{c.params}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CarteMetrique({ nom, m }) {
  const r2 = Math.round((m.r2||0)*100);
  return (
    <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid #334155',borderRadius:10,padding:14}}>
      <div style={{fontSize:11,color:'#94a3b8',marginBottom:8,fontWeight:600}}>{m.label||nom.replace(/_/g,' ')}</div>
      <div style={{display:'flex',gap:10,marginBottom:8}}>
        {[['R²',`${r2}%`,r2>80?'#4ade80':r2>60?'#fb923c':'#f87171'],['MAE',m.mae,'#e2e8f0'],['RMSE',m.rmse,'#94a3b8']].map(([k,v,c])=>(
          <div key={k} style={{textAlign:'center',flex:1}}>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:10,color:'#64748b'}}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{height:5,background:'#1e293b',borderRadius:3}}>
        <div style={{height:'100%',width:`${Math.max(0,r2)}%`,borderRadius:3,background:r2>80?'linear-gradient(90deg,#22d3ee,#4ade80)':r2>60?'#fb923c':'#f87171',transition:'width 1s ease'}}/>
      </div>
    </div>
  );
}

export default function Neuronal() {
  const [onglet, setOnglet] = useState('entrainement');
  const [statut, setStatut] = useState(null);
  const [arch, setArch] = useState([]);
  const [courbes, setCourbes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [progression, setProgression] = useState(0);
  const [etapes, setEtapes] = useState([]);
  const [resultats, setResultats] = useState(null);
  const [driftInfo, setDriftInfo] = useState(null);
  const [cfg, setCfg] = useState({
    nb_generer:80, type_projet:'', epochs:150, learning_rate:0.001,
    batch_size:32, patience:20, hidden_layers:[128,64,32], dropout_rates:[0.20,0.15,0.0],
  });

  useEffect(() => { charger(); }, []);

  const charger = async () => {
    setLoading(true);
    try {
      const [s,a,c] = await Promise.all([
        axios.get(`${API}/neural/statut`),
        axios.get(`${API}/neural/architecture`),
        axios.get(`${API}/neural/courbes`),
      ]);
      setStatut(s.data); setArch(a.data.couches||[]); setCourbes(c.data.courbes||[]);
      if (s.data.metriques?.test) setResultats(s.data.metriques.test);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const lancer = async () => {
    setEnCours(true); setProgression(0); setEtapes([]); setResultats(null);
    const steps = [
      [10,'🔧 Préprocessing : imputation médiane · StandardScaler · MinMaxScaler · Split 70/15/15...'],
      [22,'📊 Génération données synthétiques (lois physiques EN 378 + villes tunisiennes)...'],
      [38,'🏗️ Construction réseau : Input → BatchNorm → Dense(ReLU)+Dropout → Output(Linear)...'],
      [52,'⚡ Optimiseur Adam initialisé · Xavier init · ReduceLROnPlateau scheduler...'],
      [68,'🔄 Backpropagation epoch par epoch · gradient clipping · early stopping...'],
      [83,'📈 Évaluation test set : RMSE, MAE, R² par variable...'],
      [94,'💾 Sauvegarde modèle + scalers + imputer + historique...'],
    ];
    let si=0;
    const iv = setInterval(()=>{ if(si<steps.length){ setProgression(steps[si][0]); setEtapes(p=>[...p,steps[si][1]]); si++; }},650);
    try {
      const res = await axios.post(`${API}/neural/entrainer-avec-generation`,{
        nb_generer:cfg.nb_generer, type_projet:cfg.type_projet||null,
        config:{epochs:cfg.epochs,learning_rate:cfg.learning_rate,batch_size:cfg.batch_size,
                patience:cfg.patience,hidden_layers:cfg.hidden_layers,dropout_rates:cfg.dropout_rates}
      });
      clearInterval(iv); setProgression(100);
      const e = res.data.entrainement;
      setEtapes(p=>[...p,
        `✅ ${res.data.generes} projets synthétiques générés (total: ${res.data.total_projets})`,
        `✅ Entraînement terminé — ${e.nb_epochs_reels} epochs (${e.duree_secondes}s) · Backend: ${e.backend}`,
        `✅ Split — Train: ${e.nb_train} · Val: ${e.nb_val} · Test: ${e.nb_test}`,
        `✅ R² global (test): ${((e.metriques?._global?.r2||0)*100).toFixed(1)}% · MAE: ${e.metriques?._global?.mae}`,
      ]);
      setResultats(e.metriques?.test||e.metriques);
      toast.success('Réseau de neurones entraîné !');
      charger();
    } catch(e) {
      clearInterval(iv);
      toast.error(e.response?.data?.detail||'Erreur entraînement');
      setEtapes(p=>[...p,`❌ ${e.response?.data?.detail||'Erreur inconnue'}`]);
    } finally { setEnCours(false); }
  };

  const detecterDrift = async () => {
    try { const r = await axios.post(`${API}/neural/drift`); setDriftInfo(r.data); }
    catch(e) { toast.error('Erreur drift'); }
  };

  const reinit = async () => {
    if (!window.confirm('Réinitialiser le réseau ?')) return;
    await axios.delete(`${API}/neural/reinitialiser`);
    toast.success('Réinitialisé'); charger();
  };

  const parseH = s => { try { return s.split(',').map(x=>parseInt(x)||0).filter(x=>x>0); } catch { return [128,64,32]; } };
  const parseD = s => { try { return s.split(',').map(x=>parseFloat(x)||0); } catch { return [0.2,0.15,0]; } };
  const archF = arch.filter(l=>['Input','Dense','BatchNorm1d','Dropout','Output'].includes(l.type));
  const mArr  = resultats ? Object.entries(resultats).filter(([k])=>k!=='_global'&&k!=='_error') : [];

  if (loading) return <div className="loading-overlay"><div className="spinner"/><span>Chargement...</span></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <h1 className="page-title">Réseau de neurones artificiel</h1>
            <p className="page-subtitle">Pipeline ML complet — Preprocessing · Training · Evaluation · Inference · Monitoring</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={charger}><RefreshCw size={14}/></button>
            {statut?.entraine && <button className="btn btn-danger btn-sm" onClick={reinit}>Réinitialiser</button>}
          </div>
        </div>
      </div>

      <div className="tabs">
        {[['entrainement','🚀 Entraînement'],['architecture','🏗️ Architecture'],['courbes','📈 Courbes'],['metriques','📊 Métriques'],['monitoring','👁️ Monitoring']].map(([id,lbl])=>(
          <button key={id} className={`tab ${onglet===id?'active':''}`} onClick={()=>setOnglet(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── ENTRAÎNEMENT ── */}
      {onglet==='entrainement' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title">
                <Brain size={16} style={{color:'#a855f7'}}/>
                Réseau de neurones
                {statut?.entraine
                  ? <span className="badge badge-green" style={{marginLeft:'auto'}}>✅ Entraîné ({statut.nb_epochs_reels} epochs)</span>
                  : <span className="badge badge-orange" style={{marginLeft:'auto'}}>⚠️ Non entraîné</span>}
              </div>
              <CanvasReseau architecture={archF} actif={enCours}/>
              <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                {Object.entries(LAYER_COLORS).map(([t,c])=>(
                  <div key={t} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
                    <div style={{width:9,height:9,borderRadius:'50%',background:c}}/><span style={{color:'#94a3b8'}}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            {etapes.length>0 && (
              <div className="card">
                <div className="card-title"><Activity size={14}/> Journal d'entraînement</div>
                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#94a3b8',marginBottom:6}}>
                    <span>Progression</span><span style={{color:'#22d3ee',fontWeight:700}}>{progression}%</span>
                  </div>
                  <div style={{height:6,background:'#1e293b',borderRadius:3}}>
                    <div style={{height:'100%',width:`${progression}%`,borderRadius:3,background:'linear-gradient(90deg,#22d3ee,#a855f7)',transition:'width 0.4s ease'}}/>
                  </div>
                </div>
                <div style={{fontFamily:'monospace',fontSize:11,display:'flex',flexDirection:'column',gap:3,maxHeight:200,overflowY:'auto'}}>
                  {etapes.map((e,i)=>(
                    <div key={i} style={{color:e.startsWith('✅')?'#4ade80':e.startsWith('❌')?'#f87171':'#94a3b8'}}>{e}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-title"><Database size={14}/> Données d'entraînement</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div className="form-group">
                  <label className="form-label">Projets synthétiques</label>
                  <input type="number" className="form-input" value={cfg.nb_generer} min={10} max={500}
                    onChange={e=>setCfg(p=>({...p,nb_generer:parseInt(e.target.value)||50}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Type de projet</label>
                  <select className="form-select" value={cfg.type_projet} onChange={e=>setCfg(p=>({...p,type_projet:e.target.value}))}>
                    <option value="">Mixte</option>
                    <option value="chambre_froide">Chambres froides</option>
                    <option value="adiabatique">Adiabatique</option>
                  </select>
                </div>
              </div>
              <div style={{padding:'8px 12px',background:'rgba(34,211,238,0.05)',borderRadius:8,border:'1px solid rgba(34,211,238,0.18)',fontSize:12,color:'#94a3b8'}}>
                📊 <strong style={{color:'#22d3ee'}}>{statut?.nb_projets_dispo||0}</strong> projets validés · Split : 70% train / 15% val / 15% test
              </div>
            </div>

            <div className="card" style={{marginBottom:16}}>
              <div className="card-title"><Settings2 size={14}/> Hyperparamètres</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[['epochs','Epochs max','number',10,500,1],['learning_rate','Learning rate','number',0,1,0.0001],
                  ['batch_size','Batch size','number',4,256,1],['patience','Patience (Early Stop)','number',3,100,1]].map(([k,lbl,t,mn,mx,st])=>(
                  <div key={k} className="form-group">
                    <label className="form-label">{lbl}</label>
                    <input type={t} className="form-input" value={cfg[k]} step={st} min={mn} max={mx}
                      onChange={e=>setCfg(p=>({...p,[k]:parseFloat(e.target.value)||p[k]}))}/>
                  </div>
                ))}
                <div className="form-group">
                  <label className="form-label">Couches cachées (neurones)</label>
                  <input className="form-input" placeholder="128, 64, 32" defaultValue={cfg.hidden_layers.join(', ')}
                    onBlur={e=>setCfg(p=>({...p,hidden_layers:parseH(e.target.value)}))}/>
                  <span className="form-hint">Dense(ReLU) — séparez par virgules</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Dropout par couche</label>
                  <input className="form-input" placeholder="0.20, 0.15, 0.0" defaultValue={cfg.dropout_rates.join(', ')}
                    onBlur={e=>setCfg(p=>({...p,dropout_rates:parseD(e.target.value)}))}/>
                  <span className="form-hint">0.0 = désactivé</span>
                </div>
              </div>
            </div>

            <div className="alert alert-info" style={{marginBottom:16,fontSize:12}}>
              <Cpu size={14} style={{flexShrink:0}}/>
              <div>Backend: <strong>{statut?.torch_disponible?'PyTorch':'scikit-learn MLPRegressor'}</strong>
              {!statut?.torch_disponible && <> · <code>pip install torch</code> pour PyTorch</>}
              <br/>Arch: <strong>BatchNorm → Dense(ReLU)+Dropout → Linear</strong> · Adam + ReduceLROnPlateau · Xavier init</div>
            </div>

            <button className="btn btn-cyan btn-lg" onClick={lancer} disabled={enCours} style={{width:'100%'}}>
              {enCours?<><div className="spinner" style={{width:16,height:16}}/> Entraînement en cours...</>:<><Brain size={18}/> Générer données + Entraîner le réseau</>}
            </button>
          </div>
        </div>
      )}

      {/* ── ARCHITECTURE ── */}
      {onglet==='architecture' && (
        <div>
          <div className="alert alert-info" style={{marginBottom:16}}>
            <Layers size={14} style={{flexShrink:0}}/>
            <div><strong>Réseau Dense (Fully Connected)</strong> : Input → BatchNorm1d → [Linear(h)+ReLU+Dropout+BatchNorm1d]×N → Linear(output)
            | Activations : <strong>ReLU</strong> (couches cachées) · <strong>Linear</strong> (sortie — régression multi-output) · Régularisation : <strong>Dropout + L2(1e-4) + BatchNorm</strong></div>
          </div>
          <div className="card" style={{marginBottom:16}}>
            <div className="card-title"><Layers size={14}/> Couches détaillées</div>
            <TableauArch couches={archF}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {[
              {l:'Paramètres totaux',v:(() => { const h=statut?.architecture||[128,64,32]; let n=11,t=0; [n,...h,6].reduce((a,b)=>{t+=a*b+b;return b;}); return t.toLocaleString('fr-FR'); })()},
              {l:'Couches cachées',v:(statut?.architecture||[]).length},
              {l:'Fonction de perte',v:'MSELoss'},
              {l:'Optimiseur',v:'Adam + LRS'},
            ].map(s=>(
              <div key={s.l} className="card" style={{textAlign:'center'}}>
                <div style={{fontSize:18,fontWeight:800,color:'#22d3ee'}}>{s.v}</div>
                <div style={{fontSize:11,color:'#64748b',marginTop:4}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── COURBES ── */}
      {onglet==='courbes' && (
        <div>
          {courbes.length===0
            ? <div className="card" style={{textAlign:'center',padding:60}}><TrendingUp size={48} style={{color:'#334155',margin:'0 auto 16px'}}/><p style={{color:'#64748b'}}>Entraînez le réseau pour voir les courbes.</p></div>
            : <>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
                  {[
                    {title:'Courbe de perte (Loss = MSE)',k1:'train_loss',k2:'val_loss',l1:'Train Loss',l2:'Val Loss',c1:'#22d3ee',c2:'#f87171',fmt:v=>v?.toFixed(5)},
                    {title:'Erreur absolue moyenne (MAE)',k1:'train_mae',k2:'val_mae',l1:'Train MAE',l2:'Val MAE',c1:'#3b82f6',c2:'#a855f7',fmt:v=>v?.toFixed(2)},
                  ].map(ch=>(
                    <div key={ch.title} className="card">
                      <div className="card-title"><TrendingUp size={14}/> {ch.title}</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={courbes}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                          <XAxis dataKey="epoch" tick={{fill:'#64748b',fontSize:10}}/>
                          <YAxis tick={{fill:'#64748b',fontSize:10}} tickFormatter={ch.fmt}/>
                          <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',color:'#f1f5f9',fontSize:11}}
                            formatter={(v,n)=>[ch.fmt(v),n===ch.k1?ch.l1:ch.l2]}/>
                          <Legend wrapperStyle={{fontSize:11,color:'#64748b'}}/>
                          <Line type="monotone" dataKey={ch.k1} stroke={ch.c1} strokeWidth={2} dot={false} name={ch.l1}/>
                          <Line type="monotone" dataKey={ch.k2} stroke={ch.c2} strokeWidth={2} dot={false} name={ch.l2} strokeDasharray="4 2"/>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
                </div>
                {courbes[0]?.lr!=null && (
                  <div className="card">
                    <div className="card-title"><Zap size={14}/> Learning rate scheduler (ReduceLROnPlateau)</div>
                    <ResponsiveContainer width="100%" height={130}>
                      <LineChart data={courbes}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                        <XAxis dataKey="epoch" tick={{fill:'#64748b',fontSize:10}}/>
                        <YAxis tick={{fill:'#64748b',fontSize:10}} tickFormatter={v=>v?.toExponential(1)}/>
                        <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',color:'#f1f5f9',fontSize:11}} formatter={v=>[v?.toExponential(4),'LR']}/>
                        <Line type="monotone" dataKey="lr" stroke="#fb923c" strokeWidth={2} dot={false}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
          }
        </div>
      )}

      {/* ── MÉTRIQUES ── */}
      {onglet==='metriques' && (
        <div>
          {mArr.length===0
            ? <div className="card" style={{textAlign:'center',padding:60}}><BarChart2 size={48} style={{color:'#334155',margin:'0 auto 16px'}}/><p style={{color:'#64748b'}}>Entraînez le réseau pour voir les métriques.</p></div>
            : <>
                {resultats?._global && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
                    {[['R² Global (test set)',`${Math.round((resultats._global.r2||0)*100)}%`,'#22d3ee','Variance expliquée'],
                      ['MAE Global',resultats._global.mae,'#4ade80','Erreur absolue moyenne'],
                      ['RMSE Global',resultats._global.rmse,'#a855f7','Erreur quadratique moyenne']].map(([l,v,c,d])=>(
                      <div key={l} className="stat-card blue">
                        <div className="stat-label">{l}</div>
                        <div className="stat-value" style={{color:c}}>{v}</div>
                        <div className="stat-unit">{d}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:14,marginBottom:20}}>
                  {mArr.map(([k,v],i)=><CarteMetrique key={k} nom={k} m={v} couleur={METRIC_COLORS[i%6]}/>)}
                </div>
                <div className="card">
                  <div className="card-title"><BarChart2 size={14}/> R² par variable — test set</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={mArr.map(([k,v])=>({name:(v.label||k).replace(/ \(.*\)/,'').slice(0,16),r2:Math.round((v.r2||0)*100)}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155"/>
                      <XAxis dataKey="name" tick={{fill:'#64748b',fontSize:10}}/>
                      <YAxis domain={[0,100]} tick={{fill:'#64748b',fontSize:11}} tickFormatter={v=>`${v}%`}/>
                      <Tooltip contentStyle={{background:'#1e293b',border:'1px solid #334155',color:'#f1f5f9'}} formatter={v=>[`${v}%`,'R²']}/>
                      <Bar dataKey="r2" radius={[6,6,0,0]}>
                        {mArr.map((_,i)=><Cell key={i} fill={METRIC_COLORS[i%6]}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
          }
        </div>
      )}

      {/* ── MONITORING ── */}
      {onglet==='monitoring' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div className="card">
            <div className="card-title"><Activity size={14}/> Détection de drift</div>
            <p style={{fontSize:13,color:'#94a3b8',marginBottom:14}}>
              Analyse statistique des 20 derniers projets vs la baseline d'entraînement. Seuil Z-score &gt; 2.0.
            </p>
            <button className="btn btn-primary" onClick={detecterDrift} style={{marginBottom:14}}>
              <Activity size={14}/> Analyser les 20 derniers projets
            </button>
            {driftInfo && (
              <div>
                <div className={`alert ${driftInfo.drift_detecte?'alert-warning':'alert-success'}`} style={{marginBottom:10}}>
                  {driftInfo.drift_detecte?<><AlertTriangle size={14}/> Drift détecté — ré-entraînement recommandé</>:<><CheckCircle size={14}/> Distribution stable</>}
                </div>
                {driftInfo.drift_par_feature && (
                  <div style={{maxHeight:250,overflowY:'auto'}}>
                    {Object.entries(driftInfo.drift_par_feature).map(([f,d])=>(
                      <div key={f} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #334155',fontSize:11}}>
                        <span style={{color:'#94a3b8',width:110}}>{f}</span>
                        <span style={{color:'#64748b'}}>μ₀={d.baseline_mean?.toFixed(1)}</span>
                        <span style={{color:'#64748b'}}>μ={d.new_mean?.toFixed(1)}</span>
                        <span style={{color:d.drift?'#fb923c':'#4ade80',fontWeight:700}}>Z={d.z_score?.toFixed(2)} {d.drift?'⚠️':'✓'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title"><Info size={14}/> Fonctionnalités ML implémentées</div>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {[
                ['Data Preprocessing','SimpleImputer (médiane) · StandardScaler · MinMaxScaler · Train/Val/Test 70/15/15'],
                ['Model Definition','Dense+BatchNorm+Dropout+Xavier init · Adam · MSELoss · Multi-output regression'],
                ['Training',`Backpropagation · ${cfg.epochs} epochs max · Early stopping (patience=${cfg.patience}) · LR scheduler`],
                ['Evaluation','RMSE, MAE, R² sur test set séparé — par variable + score global'],
                ['Inference','Prédiction temps réel — fusion NN(65%) + physique EN 378(35%)'],
                ['Model Persistence','pickle — modèle + scaler_x + scaler_y + imputer + config + historique'],
                ['Drift Monitoring','Z-score par feature · baseline tracking · recommandation ré-entraînement'],
                ['Synthetic Data','Génération physiquement cohérente (EN 378 + villes tunisiennes)'],
              ].map(([t,d])=>(
                <div key={t} style={{display:'flex',gap:9,padding:'7px 10px',background:'rgba(255,255,255,0.02)',borderRadius:7,border:'1px solid #334155'}}>
                  <CheckCircle size={13} style={{color:'#4ade80',flexShrink:0,marginTop:1}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'#e2e8f0'}}>{t}</div>
                    <div style={{fontSize:11,color:'#64748b'}}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
console.log('React importé :', React);
console.log('useState :', useState);