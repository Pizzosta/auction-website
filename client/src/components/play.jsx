import { createContext, useState, useEffect, useContext } from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { api } from "../api/axios";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  /*useEffect(() => {
    // Check if user is logged in on initial load
    const checkAuth = async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          // Set the token in axios headers
          api.defaults.headers.common["Authorization"] =
            `Bearer ${storedToken}`;

          // Decode token to get user info
          const decoded = jwtDecode(storedToken);
          setUser(decoded);
        } catch (error) {
          console.error("Error decoding token:", error);
          // If the token is invalid/expired, log out
          logout();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);*/

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          // Set token in axios headers
          api.defaults.headers.common["Authorization"] =
            `Bearer ${storedToken}`;

          // Fetch full user profile from the server
          const response = await api.get("/users/me");
          const userData = response?.data?.data?.user;

          if (userData) {
            setUser(userData);
          } else {
            // Fallback: decode token (minimal data)
            const decoded = jwtDecode(storedToken);
            setUser(decoded);
          }
        } catch (error) {
          console.error("Auth check failed:", error);
          // If the token is invalid/expired, log out
          logout();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (payload) => {
    // payload can be either a token string or credentials {email, password}
    let tokenStr = null;
    let userFromResponse = null;

    if (typeof payload === "string") {
      tokenStr = payload;
    } else {
      const response = await api.post("/auth/login", payload);
      tokenStr = response?.data?.data?.accessToken;
      userFromResponse = response?.data?.data?.user || null;
    }

    if (!tokenStr) {
      throw new Error("Login did not return an access token");
    }

    localStorage.setItem("token", tokenStr);
    setToken(tokenStr);
    // Set the token in axios headers
    api.defaults.headers.common["Authorization"] = `Bearer ${tokenStr}`;

    // Set user from the response (contains full profile)
    if (userFromResponse) {
      setUser(userFromResponse);
    } else {
      // Fallback: try to decode token (minimal data)
      try {
        const decoded = jwtDecode(tokenStr);
        setUser(decoded);
      } catch (error) {
        throw error;
      }
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common["Authorization"];
    navigate("/login");
  };

  const isAuthenticated = () => {
    if (!token) return false;
    try {
      const decoded = jwtDecode(token);
      return decoded.exp * 1000 > Date.now();
    } catch (error) {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: isAuthenticated(),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};




// src/contexts/AuthContext.jsx
import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch full user profile from /users/me
  const fetchUserProfile = useCallback(async (authToken) => {
    try {
      const response = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      return response.data?.data?.user;
    } catch (error) {
      console.error('Profile fetch failed:', error);
      return null;
    }
  }, []);

  // Initialize auth state on app load
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          setToken(storedToken);
          api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
          const profile = await fetchUserProfile(storedToken);
          setUser(profile || jwtDecode(storedToken)); // fallback to decoded token
        } catch (err) {
          logout();
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, [fetchUserProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    const { accessToken, user: userData } = response.data?.data;
    localStorage.setItem('token', accessToken);
    setToken(accessToken);
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
    // Always fetch full profile (or use userData from response if it's complete)
    const profile = userData || await fetchUserProfile(accessToken);
    setUser(profile);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common.Authorization;
    navigate('/login');
  }, [navigate]);

  const isAuthenticated = useCallback(() => {
    if (!token) return false;
    try {
      const { exp } = jwtDecode(token);
      return exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }, [token]);

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: isAuthenticated(),
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage
.nyc_output

# Production
/build
/dist

# Environment variables
.DS_Store
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Docker
postgres_data/
redis_data/
*.data/
.docker/
.dockerignore
docker-compose.*.yml

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS
.DS_Store
Thumbs.db

# Local development
.vercel
.next

# Misc
*.pem
*.p8
*.key
*.crt
*.cert
*.cer
*.pfx
*.p12
*.der
