import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Projets
export const projetService = {
  lister: (params = {}) => api.get('/projets/', { params }),
  obtenir: (id) => api.get(`/projets/${id}`),
  creer: (data) => api.post('/projets/', data),
  modifier: (id, data) => api.put(`/projets/${id}`, data),
  supprimer: (id) => api.delete(`/projets/${id}`),
  statistiques: () => api.get('/projets/statistiques'),
};

// Prédictions
export const predictionService = {
  predire: (params) => api.post('/predictions/', params),
  valider: (id) => api.post(`/predictions/valider/${id}`),
  corriger: (data) => api.post('/predictions/corriger', data),
  historique: (limite = 20) => api.get('/predictions/historique', { params: { limite } }),
  sauvegarderCommeProjet: (data) => api.post('/predictions/sauvegarder-comme-projet', data),
};

// Extraction
export const extractionService = {
  depuisFichier: (fichier) => {
    const formData = new FormData();
    formData.append('fichier', fichier);
    return api.post('/extraction/fichier', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  depuisUrl: (url) => api.post('/extraction/url', { url }),
  depuisTexte: (texte) => api.post('/extraction/texte', { texte }),
};

// Modèle
export const modeleService = {
  entrainer: () => api.post('/modele/entrainer'),
  statut: () => api.get('/modele/statut'),
  metriques: () => api.get('/modele/metriques'),
  corrections: () => api.get('/modele/corrections'),
  reinitialiser: () => api.delete('/modele/reinitialiser'),
};

export default api;
