"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [status, setStatus] = useState<string>("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("Signing in...");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, mfaCode })
    });
    if (!res.ok) {
      setStatus("Invalid credentials");
      return;
    }
    const data = await res.json();
    localStorage.setItem("authToken", data.token);
    router.replace("/inbox");
  };

  return (
    <main style={{ padding: "80px 8vw" }}>
      <section className="hero" style={{ gridTemplateColumns: "1fr" }}>
        <div className="hero-card" style={{ maxWidth: 520 }}>
          <span className="badge">Agent Access</span>
          <h1 style={{ marginTop: 16 }}>Sign in to Mission Control</h1>
          <p>Use the agent credentials in your data store to access assignments and triage.</p>
          <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "grid", gap: 12 }}>
            <input
              className="filter-input"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="filter-input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              className="filter-input"
              placeholder="MFA code (if enabled)"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
            />
            <button className="button primary" type="submit">
              Sign in
            </button>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>{status}</p>
          </form>
        </div>
      </section>
    </main>
  );
}
