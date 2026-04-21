import axios from 'axios';

// ================= BASE API =================
const API = axios.create({
  baseURL: 'http://localhost:5001/api'
});

// ================= INTERCEPTOR =================
// Attach token to every request
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const getErrorMessage = (error) => {
  if (!error) return 'Unknown error';
  const responseData = error.response?.data;
  if (responseData) {
    if (typeof responseData === 'string') return responseData;
    if (responseData.error) return responseData.error;
    if (responseData.detail) {
      return typeof responseData.detail === 'string'
        ? responseData.detail
        : JSON.stringify(responseData.detail);
    }
    return JSON.stringify(responseData);
  }
  return error.message || 'Unknown error';
};

// ================= AUTH =================
export const authAPI = {
  login: async (email, password) => {
    try {
      const res = await API.post('/auth/login', { email, password });

      if (res.data.success) {
        // ✅ STORE DATA CORRECTLY
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('userRole', res.data.user.role);

        console.log("✅ Logged in as:", res.data.user.role);
      }

      return res.data;

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  },

  register: async (data) => {
    try {
      const res = await API.post('/auth/register', data);

      if (res.data.success) {
        // ✅ Auto-login after register (optional but useful)
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('userRole', res.data.user.role);
      }

      return res.data;

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  },

  logout: () => {
    localStorage.clear();
  }
};

// ================= VIOLATIONS =================
export const violationsAPI = {
  getAll: async () => {
    try {
      const res = await API.get('/violations');

      return {
        success: true,
        violations: res.data.violations || [],
        pagination: res.data.pagination || {}
      };

    } catch (error) {
      return {
        success: false,
        violations: [],
        error: getErrorMessage(error)
      };
    }
  },

  create: async (data) => {
    try {
      const res = await API.post('/violations', data);
      return res.data;
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  },

  update: async (id, data) => {
    try {
      const res = await API.put(`/violations/${id}`, data);
      return res.data;
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }
};

// ================= DASHBOARD =================
export const dashboardAPI = {
  getStats: async () => {
    try {
      const res = await API.get('/dashboard/stats');

      return {
        success: true,
        stats: res.data.stats || {},
        byType: res.data.byType || []
      };

    } catch (error) {
      return {
        success: false,
        stats: {},
        byType: []
      };
    }
  }
};

// ================= UPLOAD =================
export const uploadAPI = {
  uploadImage: async (formData) => {
    try {
      const res = await API.post('/upload', formData);

      return res.data;

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  },
  uploadMedia: async (formData) => {
    try {
      const res = await API.post('/upload', formData);

      return res.data;

    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }
};

// ================= EXPORT =================
export default API;