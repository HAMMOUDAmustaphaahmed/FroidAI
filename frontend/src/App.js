import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { LayoutDashboard, FolderKanban, Cpu, Upload, Settings, Thermometer, Wind, Package, Brain } from 'lucide-react';

import Dashboard from './pages/Dashboard';
import Projets from './pages/Projets';
import Prediction from './pages/Prediction';
import Extraction from './pages/Extraction';
import Modele from './pages/Modele';
import Catalogue from './pages/Catalogue';
import Neuronal from './pages/Neuronal';

const navigation = [
  { to: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/prediction', label: 'Prédiction', icon: Cpu },
  { to: '/projets', label: 'Projets', icon: FolderKanban },
  { to: '/catalogue', label: 'Équipements', icon: Package },
  { to: '/extraction', label: 'Extraction', icon: Upload },
  { to: '/neuronal', label: 'Réseau neuronal', icon: Brain },
  { to: '/modele', label: 'Modèle IA', icon: Settings },
];

export default function App() {
  return (
    <Router>
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="logo">
              <div className="logo-icon">
                <Thermometer size={20} />
                <Wind size={14} className="logo-icon-2" />
              </div>
              <div>
                <div className="logo-title">FroidAI</div>
                <div className="logo-subtitle">Prédiction Chambres Froides</div>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-footer-text">
              <span className="dot dot-green" />
              Système opérationnel
            </div>
            <div className="sidebar-version">v1.1.0 — Seeley Compatible</div>
          </div>
        </aside>

        {/* Main content */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/tableau-de-bord" replace />} />
            <Route path="/tableau-de-bord" element={<Dashboard />} />
            <Route path="/prediction" element={<Prediction />} />
            <Route path="/projets" element={<Projets />} />
            <Route path="/catalogue" element={<Catalogue />} />
            <Route path="/extraction" element={<Extraction />} />
            <Route path="/neuronal" element={<Neuronal />} />
            <Route path="/modele" element={<Modele />} />
          </Routes>
        </main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </Router>
  );
}
