import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import { api } from "../api/axios";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Reusable function to fetch full user profile
  const fetchUserProfile = useCallback(async (authToken) => {
    try {
      const response = await api.get("/users/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      return response?.data?.data?.user || null;
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      return null;
    }
  }, []);

  // Initialize auth state on app load
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          // Set token in axios headers
          api.defaults.headers.common["Authorization"] =
            `Bearer ${storedToken}`;

          // Fetch full user profile from the server
          const profile = await fetchUserProfile(storedToken);

          if (profile) {
            setUser(profile);
          } else {
            // Fallback: decode token (minimal data)
            const decoded = jwtDecode(storedToken);
            setUser(decoded);
          }

        } catch (error) {
          console.error("Auth check failed:", error);
          logout();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [fetchUserProfile]);

  const login = async (credentials) => {
    let accessToken = null;

    if (typeof credentials === "string") {
      accessToken = credentials;
    } else {
      const response = await api.post("/auth/login", credentials);
      accessToken = response?.data?.data?.accessToken;
    }

    if (!accessToken) {
      throw new Error("Login did not return an access token");
    }

    // Store token and set headers FIRST
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
    api.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;

    // ALWAYS fetch full user profile from /users/me after login, even if token contains some user data
    const fullUserData = await fetchUserProfile(accessToken);

    if (fullUserData) {
      setUser(fullUserData);
    } else {
      // Only fall back to decoded token if /users/me fails
      try {
        const decoded = jwtDecode(accessToken);
        setUser(decoded);
      } catch (error) {
        throw new Error("Login succeeded but failed to load user profile");
      }
    }
  };

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common["Authorization"];
    navigate("/login");
  }, [navigate]);

  const isAuthenticated = useCallback(() => {
    if (!token) return false;
    try {
      const decoded = jwtDecode(token);
      return decoded.exp * 1000 > Date.now();
    } catch (error) {
      return false;
    }
  }, [token]);

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
