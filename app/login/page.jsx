"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch(
        "https://multibroker-trader-multiuser-production.up.railway.app/users/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            password: password,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // STORE LOGIN STATE
      localStorage.setItem("user", userId);
      localStorage.setItem("auth", "true");

      // GO TO TRADER PAGE
      router.replace("/trader");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "80px auto", textAlign: "left" }}>
      <h1>Wealth Ocean – Login</h1>
      <p>Multi-broker, multi-user trading panel</p>

      {error && (
        <div
          style={{
            background: "#ffd6d6",
            padding: "10px",
            borderRadius: "5px",
            marginBottom: "10px",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleLogin}>
        <label>User ID</label>
        <input
          style={{ width: "100%", padding: "8px", margin: "5px 0" }}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />

        <label>Password</label>
        <input
          type="password"
          style={{ width: "100%", padding: "8px", margin: "5px 0" }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "10px",
            background: "#2563eb",
            color: "white",
            border: "none",
            cursor: "pointer",
          }}
        >
          Login
        </button>
      </form>
    </div>
  );
}
