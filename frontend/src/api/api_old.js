import axios from 'axios';

const API = axios.create({
    baseURL: 'http://localhost:5001/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

const handleResponse = (response) => ({ success: true, ...response.data });

// Add token to requests if available
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

// ========== AUTHENTICATION API ==========
export const authAPI = {
    // User login
    login: async (email, password) => {
        try {
            const response = await API.post('/auth/login', { email, password });
            return response.data;
        } catch (error) {
            console.error('Login error:', error);
            return { 
                success: false, 
                error: error.response?.data?.error || error.message 
            };
        }
    },
    
    // User registration
    register: async (userData) => {
        try {
            const response = await API.post('/auth/register', userData);
            return response.data;
        } catch (error) {
            console.error('Registration error:', error);
            return { 
                success: false, 
                error: error.response?.data?.error || error.message 
            };
        }
    },
    
    // Logout (clear local storage)
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        localStorage.removeItem('authMethod');
        localStorage.removeItem('rememberEmail');
    },
    
    // Get current user from token
    getCurrentUser: async () => {
        try {
            const response = await API.get('/auth/me');
            return response.data;
        } catch (error) {
            console.error('Get user error:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Update user profile
    updateProfile: async (profileData) => {
        try {
            const response = await API.put('/auth/profile', profileData);
            return response.data;
        } catch (error) {
            console.error('Update profile error:', error);
            return { 
                success: false, 
                error: error.response?.data?.error || error.message 
            };
        }
    },
    
    // Change password
    changePassword: async (passwordData) => {
        try {
            const response = await API.post('/auth/change-password', passwordData);
            return response.data;
        } catch (error) {
            console.error('Change password error:', error);
            return { 
                success: false, 
                error: error.response?.data?.error || error.message 
            };
        }
    },
    
    // Forgot password
    forgotPassword: async (email) => {
        try {
            const response = await API.post('/auth/forgot-password', { email });
            return response.data;
        } catch (error) {
            console.error('Forgot password error:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Reset password
    resetPassword: async (token, newPassword) => {
        try {
            const response = await API.post('/auth/reset-password', { token, newPassword });
            return response.data;
        } catch (error) {
            console.error('Reset password error:', error);
            return { success: false, error: error.message };
        }
    }
};

// ========== VIOLATIONS API ==========
export const violationsAPI = {
    getAll: async (params = {}) => {
        try {
            const response = await API.get('/violations', { params });
            return response.data;
        } catch (error) {
            console.error('Error fetching violations:', error);
            return { success: false, violations: [], pagination: { total: 0, pages: 1, page: 1 } };
        }
    },
    
    create: async (violationData) => {
        try {
            const response = await API.post('/violations', violationData);
            return response.data;
        } catch (error) {
            console.error('Error creating violation:', error);
            return { success: false, error: error.message };
        }
    },
    
    update: async (id, updateData) => {
        try {
            const response = await API.put(`/violations/${id}`, updateData);
            return response.data;
        } catch (error) {
            console.error('Error updating violation:', error);
            return { success: false, error: error.message };
        }
    },
    
    getById: async (id) => {
        try {
            const response = await API.get(`/violations/${id}`);
            return handleResponse(response);
        } catch (error) {
            console.error('Error fetching violation:', error);
            return { success: false, error: error.message };
        }
    },

    detectVideo: async (formData) => {
        try {
            const response = await API.post('/violations/detect', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return handleResponse(response);
        } catch (error) {
            console.error('Error detecting video:', error);
            return { success: false, error: error.response?.data?.error || error.message };
        }
    }
};

// ========== DASHBOARD API ==========
export const dashboardAPI = {
    getStats: async () => {
        try {
            const response = await API.get('/dashboard/stats');
            return response.data;
        } catch (error) {
            console.error('Error fetching stats:', error);
            return { 
                success: false, 
                stats: {
                    totalViolations: 0,
                    todayViolations: 0,
                    pendingReview: 0,
                    totalFines: 0
                },
                byType: [],
                recent: []
            };
        }
    },
};

// ========== UPLOAD API ==========
export const uploadAPI = {
    uploadImage: async (formData) => {
        try {
            const response = await API.post('/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        } catch (error) {
            console.error('Error uploading image:', error);
            return { 
                success: false, 
                error: error.response?.data?.error || error.message,
                violations: [] 
            };
        }
    },
};

// ========== PROFILE API ==========
export const profileAPI = {
    // Get user profile
    getProfile: async () => {
        try {
            const response = await API.get('/profile');
            return response.data;
        } catch (error) {
            console.error('Error fetching profile:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Update profile
    updateProfile: async (profileData) => {
        try {
            const response = await API.put('/profile', profileData);
            return response.data;
        } catch (error) {
            console.error('Error updating profile:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Upload profile picture
    uploadProfilePicture: async (formData) => {
        try {
            const response = await API.post('/profile/picture', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            return { success: false, error: error.message };
        }
    }
};

export default API;