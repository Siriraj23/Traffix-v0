import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH API ====================
export const authAPI = {
  login: async (credentials) => {
    try {
      const response = await api.post('/api/auth/login', credentials);
      console.log('Login API Response:', response.data);
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('userRole', response.data.user.role);
      }
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Login error:', error.response?.data);
      return { 
        success: false, 
        error: error.response?.data?.detail || error.response?.data?.message || 'Login failed' 
      };
    }
  },

  register: async (userData) => {
    try {
      const response = await api.post('/api/auth/register', userData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Registration failed' };
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userRole');
  },

  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => !!localStorage.getItem('token'),

  updateProfile: async (userData) => {
    try {
      const response = await api.put('/api/auth/profile', userData);
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  }
};

// ==================== UPLOAD API ====================
export const uploadAPI = {
  uploadMedia: async (formData) => {
    const file = formData.get('file');
    const isVideo = file && file.type.startsWith('video/');
    try {
      const response = await api.post('/api/detect', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: isVideo ? 600000 : 120000,
      });
      return { success: true, ...response.data };
    } catch (error) {
      console.error('Upload API Error:', error);
      if (error.code === 'ECONNABORTED') {
        return { success: false, error: 'Request timed out.', timeout: true };
      } else if (error.response) {
        return { success: false, error: error.response.data?.detail || 'Server error' };
      } else if (error.request) {
        return { success: false, error: 'Network error. Check if backend is running on port 5001.' };
      }
      return { success: false, error: error.message || 'Failed to process request' };
    }
  },

  checkHealth: async () => {
    try {
      const response = await api.get('/api/health');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Server not reachable on port 5001' };
    }
  }
};

// ==================== VIOLATIONS API ====================
export const violationsAPI = {
  create: async (violationData) => {
    try {
      const response = await api.post('/api/violations', violationData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  getAll: async (params = {}) => {
    try {
      const response = await api.get('/api/violations', { params });
      return { success: true, violations: response.data.violations || response.data.data || response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/api/violations/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  update: async (id, updateData) => {
    try {
      const response = await api.put(`/api/violations/${id}`, updateData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/api/violations/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  getStats: async () => {
    try {
      const response = await api.get('/api/violations/stats');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  payFine: async (violationId, paymentData) => {
    try {
      const response = await api.post(`/api/violations/${violationId}/pay`, paymentData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  }
};

// ==================== CCTV API ====================
export const cctvAPI = {
  startStream: async (streamId, source, maxDuration = 300) => {
    try {
      console.log(`📡 Starting CCTV via API: ${streamId} -> ${source}`);
      const response = await api.post('/api/cctv/start', {
        stream_id: streamId,
        source: String(source),
        max_duration: maxDuration
      });
      console.log('📡 CCTV start response:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ CCTV start error:', error);
      if (error.code === 'ECONNREFUSED' || error.response?.status === 503) {
        return { 
          success: false, 
          error: 'AI Detection Service is not running. Please start the AI model on port 8000.',
          serviceUnavailable: true
        };
      }
      return { 
        success: false, 
        error: error.response?.data?.error || error.response?.data?.message || error.message 
      };
    }
  },

  stopStream: async (streamId) => {
    try {
      console.log(`🛑 Stopping CCTV via API: ${streamId}`);
      const response = await api.post('/api/cctv/stop', {
        stream_id: streamId
      });
      console.log('🛑 CCTV stop response:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ CCTV stop error:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || error.message 
      };
    }
  },

  getStatus: async (streamId = null) => {
    try {
      const url = streamId 
        ? `/api/cctv/status?stream_id=${streamId}`
        : '/api/cctv/status';
      const response = await api.get(url);
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        data: { active_streams: 0, streams: {} }
      };
    }
  },

  getViolations: async (streamId) => {
    try {
      const response = await api.get(`/api/cctv/violations?stream_id=${streamId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        data: { 
          stats: { violations: { no_helmet: 0, triple_riding: 0, overloading: 0 } },
          total_fine: 0 
        }
      };
    }
  },

  getPreview: async (streamId) => {
    try {
      const response = await api.get(`/api/cctv/preview?stream_id=${streamId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        data: { image: null, message: 'No frame available' }
      };
    }
  }
};

// ==================== DASHBOARD API ====================
export const dashboardAPI = {
  getStats: async () => {
    try {
      const response = await api.get('/api/dashboard/stats');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to load dashboard data' };
    }
  },

  getRecentViolations: async (limit = 10) => {
    try {
      const response = await api.get('/api/violations', { params: { limit } });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

export default api;