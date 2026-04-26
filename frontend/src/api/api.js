import axios from 'axios';

// IMPORTANT: Backend runs on port 5001
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH API ====================
export const authAPI = {
  login: async (credentials) => {
    try {
      const response = await api.post('/api/auth/login', credentials);
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.response?.data?.message || 'Login failed'
      };
    }
  },

  register: async (userData) => {
    try {
      const response = await api.post('/api/auth/register', userData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.response?.data?.message || 'Registration failed'
      };
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },

  updateProfile: async (userData) => {
    try {
      const response = await api.put('/api/auth/profile', userData);
      if (response.data.user) {
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
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
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: isVideo ? 600000 : 120000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            console.log(`Upload Progress: ${percentCompleted}%`);
          }
        },
      });
      
      return {
        success: true,
        ...response.data
      };
    } catch (error) {
      console.error('Upload API Error:', error);
      
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          error: 'Request timed out. Video processing is taking longer than expected.',
          timeout: true
        };
      } else if (error.response) {
        return {
          success: false,
          error: error.response.data?.detail || error.response.data?.message || 'Server error occurred',
          status: error.response.status
        };
      } else if (error.request) {
        return {
          success: false,
          error: 'Network error. Please check if backend is running on port 5001.',
          networkError: true
        };
      } else {
        return {
          success: false,
          error: error.message || 'Failed to process request'
        };
      }
    }
  },

  getResults: async () => {
    try {
      const response = await api.get('/api/results');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  clearResults: async () => {
    try {
      const response = await api.get('/api/clear');
      return {
        success: true,
        message: response.data.message
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  checkHealth: async () => {
    try {
      const response = await api.get('/api/health');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: 'Server is not reachable on port 5001'
      };
    }
  }
};

// ==================== VIOLATIONS API ====================
export const violationsAPI = {
  create: async (violationData) => {
    try {
      const response = await api.post('/api/violations', violationData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  getAll: async (params = {}) => {
    try {
      const response = await api.get('/api/violations', { params });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  getById: async (id) => {
    try {
      const response = await api.get(`/api/violations/${id}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  update: async (id, updateData) => {
    try {
      const response = await api.put(`/api/violations/${id}`, updateData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  delete: async (id) => {
    try {
      const response = await api.delete(`/api/violations/${id}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  getStats: async () => {
    try {
      const response = await api.get('/api/violations/stats');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }
};

// ==================== DASHBOARD API ====================
export const dashboardAPI = {
  getStats: async () => {
    try {
      const response = await api.get('/api/dashboard/stats');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Dashboard stats error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to load dashboard data'
      };
    }
  },

  getRecentViolations: async (limit = 10) => {
    try {
      const response = await api.get('/api/dashboard/recent-violations', { 
        params: { limit } 
      });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  getViolationTrends: async (period = 'weekly') => {
    try {
      const response = await api.get('/api/dashboard/violation-trends', { 
        params: { period } 
      });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  getVehicleStats: async () => {
    try {
      const response = await api.get('/api/dashboard/vehicle-stats');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  getAuthorityStats: async () => {
    try {
      const response = await api.get('/api/dashboard/authority-stats');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  }
};

export default api;