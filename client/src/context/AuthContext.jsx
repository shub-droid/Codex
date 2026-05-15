import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../services/api.js';
import { newSessionAPI } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for stored user info on load
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Failed to parse user info', err);
        localStorage.removeItem('userInfo');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await API.post('/auth/login', { email, password });
      const data = response.data;

      setUser(data);
      localStorage.setItem('userInfo', JSON.stringify(data));

      // Reset server to a fresh empty project directory
      try { await newSessionAPI(); } catch { /* ignore if fails */ }

      navigate('/editor');
      return { success: true };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Login failed';
      return { success: false, error: errorMsg };
    }
  };

  const register = async (email, password) => {
    try {
      const response = await API.post('/auth/register', { email, password });
      const data = response.data;

      setUser(data);
      localStorage.setItem('userInfo', JSON.stringify(data));

      // Reset server to a fresh empty project directory
      try { await newSessionAPI(); } catch { /* ignore if fails */ }

      navigate('/editor');
      return { success: true };
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Registration failed';
      return { success: false, error: errorMsg };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('userInfo');
    navigate('/');
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
