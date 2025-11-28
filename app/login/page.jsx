"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API = "https://multibrokertrader-multiuser-production.up.railway.app";

export default function LoginPage() {
  const router = useRouter();

  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    setMessage("Logging in...");

    try {
      const res = await fetch(`${API}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.detail || "Login failed");
        return;
      }

      // Save session
      localStorage.setItem("auth", "true");
      localStorage.setItem("user", username);

      router.replace("/trader");
    } catch (err) {
      console.error(err);
      setMessage("Server not reachable");
    }
  };

  const handleCreateUser = async () => {
    setMessage("Creating user...");

    try {
      const res = await fetch(`${API}/users/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.detail || "User creation failed");
        return;
      }

      setMessage("✅ User created. Now login.");
      setTab("login");
    } catch (err) {
      console.error(err);
      setMessage("Server not reachable");
    }
  };

  return (
    <div style={{ maxWidth: "420px", margin: "4rem auto", fontFamily: "Arial" }}>
      <h1 style={{ textAlign: "center" }}>Wealth Ocean – Login</h1>
      <p style={{ textAlign: "center", color: "#666" }}>
        Multi-broker, multi-user trading panel
      </p>

      {message && (
        <div
          style={{
            background: "#fee",
            padding: "10px",
            border: "1px solid #faa",
            marginBottom: "10px"
          }}
        >
          {message}
        </div>
      )}

      <div style={{ display: "flex", marginBottom: "20px" }}>
        <button
          onClick={() => setTab("login")}
          style={{
            flex: 1,
            padding: 10,
            background: tab === "login" ? "#000" : "#eee",
            color: tab === "login" ? "#fff" : "#000",
            border: "1px solid #333"
          }}
        >
          Login
        </button>

        <button
          onClick={() => setTab("create")}
          style={{
            flex: 1,
            padding: 10,
            background: tab === "create" ? "#000" : "#eee",
            color: tab === "create" ? "#fff" : "#000",
            border: "1px solid #333"
          }}
        >
          Create User
        </button>
      </div>

      <div>
        <label>User ID</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: "100%", padding: 8, margin: "5px 0 10px" }}
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, margin: "5px 0 15px" }}
        />

        {tab === "login" ? (
          <button
            onClick={handleLogin}
            style={{
              width: "100%",
              padding: 12,
              background: "#2563eb",
              color: "#fff",
              border: "none"
            }}
          >
            Login
          </button>
        ) : (
          <button
            onClick={handleCreateUser}
            style={{
              width: "100%",
              padding: 12,
              background: "#16a34a",
              color: "#fff",
              border: "none"
            }}
          >
            Create User
          </button>
        )}
      </div>
    </div>
  );
}
