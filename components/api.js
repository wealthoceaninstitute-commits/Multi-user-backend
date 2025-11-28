import axios from "axios";

// ✅ Uses Railway / .env in production
// ✅ Falls back to localhost in development
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json"
  }
});

// ✅ Automatically attach user token (for multi-user system)
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken"); // or woi_token

      if (token) {
        config.headers["X-Auth-Token"] = token;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
