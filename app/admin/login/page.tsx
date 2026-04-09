"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${appUrl}/admin` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🇱🇧</span>
          <span className="font-bold text-lg">LebAid — Admin</span>
        </div>
        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-3">📧</div>
            <p className="font-medium text-gray-900">Lien envoyé</p>
            <p className="text-sm text-gray-500 mt-1">Vérifiez votre boîte email et cliquez sur le lien.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001]"
                placeholder="moderateur@example.com"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#CC0001] text-white py-2.5 rounded-lg font-medium text-sm disabled:opacity-50"
            >
              {loading ? "Envoi..." : "Recevoir le lien de connexion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
