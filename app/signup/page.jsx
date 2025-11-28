"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  const router = useRouter();

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

  async function signup() {
    if (!username || !email || !password) {
      alert("Please fill all fields");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,   // ✅ FIXED
          email,
          password,
        }),
      });

      const data = await res.json();

      console.log("Signup response:", data);

      if (res.ok) {
        alert("✅ User Created Successfully");
        router.push("/login");
      } else {
        alert(data.detail || data.message || "Signup failed");
      }

    } catch (err) {
      console.error(err);
      alert("Server not reachable");
    }
  }

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "linear-gradient(135deg, #0f172a, #1e3a8a)"
    }}>

      <div style={{
        width: 360,
        background: "white",
        padding: 32,
        borderRadius: 14,
        boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        textAlign: "center"
      }}>

        <h2 style={{ marginBottom: 22 }}>Create User</h2>

        <input
          style={inputStyle}
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />

        <input
          style={inputStyle}
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          style={inputStyle}
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <button style={btnStyle} onClick={signup}>
          Create Account
        </button>

        <p
          style={{ marginTop: 16, cursor: "pointer", color: "#1e40af" }}
          onClick={() => router.push("/login")}
        >
          Already have account? Login
        </p>

      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "12px",
  marginBottom: 16,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: 14
};

const btnStyle = {
  width: "100%",
  padding: "12px",
  background: "#1e40af",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: "600",
  fontSize: 15
};
