import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH API ====================
export const authAPI = {
  // In the login function, update error handling:
login: async (credentials) => {
    try {
      const response = await api.post('/api/auth/login', credentials);
      console.log('Login API Response:', response.data); // Debug log
      
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        localStorage.setItem('userRole', response.data.user.role);
      }
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Login error details:', error.response?.data); // Debug log
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
      return { success: false, error: error.response?.data?.detail || error.response?.data?.message || 'Registration failed' };
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
        return { success: false, error: error.response.data?.detail || 'Server error', status: error.response.status };
      } else if (error.request) {
        return { success: false, error: 'Network error. Check if backend is running on port 5001.', networkError: true };
      }
      return { success: false, error: error.message || 'Failed to process request' };
    }
  },

  getResults: async () => {
    try {
      const response = await api.get('/api/results');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
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
      return { success: true, violations: response.data.violations || response.data.data || response.data, data: response.data };
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

  // ===== PAYMENT API =====
  payFine: async (violationId, paymentData) => {
    try {
      const response = await api.post(`/api/violations/${violationId}/pay`, paymentData);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  // Simulate payment (for demo/local use)
  simulatePayment: async (violationId) => {
    try {
      // Try API first
      const response = await api.post(`/api/violations/${violationId}/pay`, {
        paymentMethod: 'simulated',
        transactionId: `TXN_${Date.now()}`,
        amount: 0,
        paidAt: new Date().toISOString()
      });
      return { success: true, data: response.data };
    } catch (error) {
      // If API fails, handle locally
      return { 
        success: true, 
        local: true,
        message: 'Payment processed locally'
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
      console.error('Dashboard stats error:', error);
      return { success: false, error: error.response?.data?.error || 'Failed to load dashboard data' };
    }
  },

  getRecentViolations: async (limit = 10) => {
    try {
      const response = await api.get('/api/dashboard/recent-violations', { params: { limit } });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  },

  getViolationTrends: async (period = 'weekly') => {
    try {
      const response = await api.get('/api/dashboard/violation-trends', { params: { period } });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || error.message };
    }
  }
};

export default api;