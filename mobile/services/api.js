import axios from 'axios';
import { Platform } from 'react-native';

// Configurable backend URL: uses EXPO_PUBLIC_API_URL when deploying, or defaults for local dev
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000');


const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export const apiService = {
  // Auth
  signup: async (name, email, password) => {
    const res = await api.post('/auth/signup', { name, email, password });
    if (res.data?.access_token) {
      setAuthToken(res.data.access_token);
    }
    return res.data;
  },

  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.access_token) {
      setAuthToken(res.data.access_token);
    }
    return res.data;
  },

  getProfile: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },

  // Routing
  compareRoutes: async (originLat, originLon, destLat, destLon) => {
    const res = await api.get('/routes/compare', {
      params: {
        origin_lat: originLat,
        origin_lon: originLon,
        dest_lat: destLat,
        dest_lon: destLon,
      },
    });
    return res.data;
  },

  getRoute: async (originLat, originLon, destLat, destLon, mode = 'safest') => {
    const res = await api.get('/route', {
      params: {
        origin_lat: originLat,
        origin_lon: originLon,
        dest_lat: destLat,
        dest_lon: destLon,
        mode,
      },
    });
    return res.data;
  },

  // POIs
  getPOIs: async (category = null, lat = null, lon = null, radius = 5000) => {
    const params = { limit: 100 };
    if (category) params.category = category;
    if (lat && lon) {
      params.lat = lat;
      params.lon = lon;
      params.radius_meters = radius;
    }
    const res = await api.get('/pois', { params });
    return res.data;
  },

  getEmergencyFacilities: async (lat, lon) => {
    const res = await api.get('/pois/emergency', {
      params: { lat, lon },
    });
    return res.data;
  },

  // Safety Heatmap
  getHeatmap: async (minLat = 19.95, minLon = 73.72, maxLat = 20.05, maxLon = 73.85) => {
    const res = await api.get('/heatmap', {
      params: { min_lat: minLat, min_lon: minLon, max_lat: maxLat, max_lon: maxLon, limit: 300 },
    });
    return res.data;
  },

  // Places & Geocoding Search
  searchPlaces: async (query, limit = 8) => {
    const res = await api.get('/places/search', {
      params: { q: query, limit },
    });
    return res.data;
  },

  // Reports
  submitReport: async (reportData) => {
    const res = await api.post('/reports', reportData);
    return res.data;
  },

  getReports: async () => {
    const res = await api.get('/reports');
    return res.data;
  },
};


export default apiService;
