"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import api from "../components/api";           // reuse your existing axios helper
import { setCurrentUser } from "../src/lib/userSession";

export default function LoginPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("login"); // "login" or "signup"
  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });
  const [signupForm, setSignupForm] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // -------------------- handlers --------------------

  const handleLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSignupChange = (e) => {
    const { name, value } = e.target;
    setSignupForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const res = await api.post("/users/login", {
        username: loginForm.username,
        password: loginForm.password,
      });

      const data = res.data || {};

      if (!data.success || !data.token) {
        throw new Error(data.detail || "Login failed");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("username", data.username);
        localStorage.setItem("token", data.token);
      }

      // important: let frontend know who is logged in
      setCurrentUser(data.username);

      router.push("/trader");
    } catch (err) {
      console.error("Login error:", err);
      const msg =
        (err &&
          err.response &&
          err.response.data &&
          err.response.data.detail) ||
        err.message ||
        "Login failed. Please check your username or password.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const res = await api.post("/users/register", {
        username: signupForm.username,
        password: signupForm.password,
        email: signupForm.email || "",
      });

      const data = res.data || {};

      if (!data.success || !data.token) {
        throw new Error(data.detail || "User creation failed");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("username", data.username);
        localStorage.setItem("token", data.token);
      }

      setCurrentUser(data.username);

      router.push("/trader");
    } catch (err) {
      console.error("Signup error:", err);
      const msg =
        (err &&
          err.response &&
          err.response.data &&
          err.response.data.detail) ||
        err.message ||
        "User creation failed. Try a different username.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const isLogin = activeTab === "login";

  // -------------------- UI --------------------

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f7fb",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 16px 40px rgba(15,23,42,0.16)",
          padding: "32px 36px 40px",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Wealth Ocean – Login
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            marginBottom: 24,
          }}
        >
          Multi-broker, multi-user trading panel
        </p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderRadius: 999,
            background: "#e2e8f0",
            padding: 4,
            marginBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab("login");
              setErrorMsg("");
            }}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 999,
              padding: "8px 12px",
              background: isLogin ? "#ffffff" : "transparent",
              fontWeight: 600,
              color: isLogin ? "#0f172a" : "#64748b",
              cursor: "pointer",
            }}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("signup");
              setErrorMsg("");
            }}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 999,
              padding: "8px 12px",
              background: !isLogin ? "#ffffff" : "transparent",
              fontWeight: 600,
              color: !isLogin ? "#0f172a" : "#64748b",
              cursor: "pointer",
            }}
          >
            Create New User
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: 14,
            }}
          >
            {errorMsg}
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLoginSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                User ID / Username
              </label>
              <input
                name="username"
                type="text"
                value={loginForm.username}
                onChange={handleLoginChange}
                required
                placeholder="Enter your user id"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                Password
              </label>
              <input
                name="password"
                type="password"
                value={loginForm.password}
                onChange={handleLoginChange}
                required
                placeholder="Enter your password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: loading ? "#2563ebaa" : "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignupSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                User ID / Username
              </label>
              <input
                name="username"
                type="text"
                value={signupForm.username}
                onChange={handleSignupChange}
                required
                placeholder="Choose a user id"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                Email (optional)
              </label>
              <input
                name="email"
                type="email"
                value={signupForm.email}
                onChange={handleSignupChange}
                placeholder="you@example.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{ display: "block", fontSize: 14, marginBottom: 6 }}
              >
                Password
              </label>
              <input
                name="password"
                type="password"
                value={signupForm.password}
                onChange={handleSignupChange}
                required
                placeholder="Create a password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "none",
                background: loading ? "#16a34aaa" : "#16a34a",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: 15,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Creating user..." : "Create User"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
