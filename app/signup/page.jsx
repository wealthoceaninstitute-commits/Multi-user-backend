"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Uses Railway environment variable
const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export default function Signup() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const signup = async () => {
    if (!name || !email || !password) {
      alert("All fields are required");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        // BACKEND MAPPING:
        // email -> username inside backend
        body: JSON.stringify({
          username: email.toLowerCase(),
          name: name,
          email: email.toLowerCase(),
          password: password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.detail || data?.message || "Signup failed");
        setLoading(false);
        return;
      }

      alert("✅ User Created Successfully");
      router.push("/login");

    } catch (err) {
      console.error(err);
      alert("Server not reachable. Check backend.");
    }

    setLoading(false);
  };

  return (
    <div style={styles.page}>

      <div style={styles.card}>
        <h2 style={{ marginBottom: 25 }}>Create User</h2>

        <input
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button
          style={styles.button}
          onClick={signup}
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Account"}
        </button>

        <p
          style={styles.loginLink}
          onClick={() => router.push("/login")}
        >
          Already have account? Login
        </p>

      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    background: "linear-gradient(135deg, #0f172a, #1e3a8a)"
  },

  card: {
    width: 350,
    background: "white",
    padding: 30,
    borderRadius: 12,
    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
    textAlign: "center"
  },

  input: {
    width: "100%",
    padding: "12px",
    marginBottom: 15,
    borderRadius: 8,
    border: "1px solid #ccc",
    outline: "none",
    fontSize: 14
  },

  button: {
    width: "100%",
    padding: "12px",
    background: "#1e40af",
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "15px"
  },

  loginLink: {
    marginTop: 15,
    cursor: "pointer",
    color: "#1e40af",
    fontSize: "14px"
  }
};
