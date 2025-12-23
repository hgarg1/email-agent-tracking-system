"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    if (!res.ok) {
      const data = await res.json();
      setStatus(data.error ?? "Reset failed");
      return;
    }
    setStatus("Password updated");
    setTimeout(() => router.replace("/login"), 1200);
  };

  return (
    <main style={{ padding: "80px 8vw" }}>
      <section className="hero" style={{ gridTemplateColumns: "1fr" }}>
        <div className="hero-card" style={{ maxWidth: 520 }}>
          <span className="badge">Password Reset</span>
          <h1 style={{ marginTop: 16 }}>Set a new password</h1>
          <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "grid", gap: 12 }}>
            <input
              className="filter-input"
              placeholder="Reset token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <input
              className="filter-input"
              placeholder="New password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="button primary" type="submit">
              Update password
            </button>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>{status}</p>
          </form>
        </div>
      </section>
    </main>
  );
}
