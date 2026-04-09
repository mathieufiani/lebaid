"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Submission } from "@/lib/supabase";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminQueue() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string | null } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchSubmissions = useCallback(async () => {
    const res = await fetch("/api/admin/submissions");
    const data = await res.json();
    setSubmissions(data.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubmissions();

    // Realtime subscription
    const channel = supabase
      .channel("submissions-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, () => {
        fetchSubmissions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSubmissions]);

  async function handleApprove(sub: Submission) {
    setActionLoading(sub.id);
    await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sub.id, action: "approve" }),
    });
    setSubmissions(prev => prev.filter(s => s.id !== sub.id));
    setActionLoading(null);
  }

  async function handleReject() {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id);
    await fetch("/api/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rejectModal.id, action: "reject", reason: rejectReason }),
    });
    setSubmissions(prev => prev.filter(s => s.id !== rejectModal.id));
    setRejectModal(null);
    setRejectReason("");
    setActionLoading(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  const typeEmojis: Record<string, string> = {
    shelter: "🏠", food: "🍞", health: "🏥", pharmacy: "💊", other: "📍",
  };
  const typeLabels: Record<string, string> = {
    shelter: "Abri", food: "Nourriture", health: "Santé", pharmacy: "Pharmacie", other: "Autre",
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    if (h > 24) return `${Math.floor(h / 24)}j`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#CC0001] text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>🇱🇧</span>
          <span className="font-bold">LebAid Admin</span>
          {submissions.length > 0 && (
            <span className="bg-white text-[#CC0001] text-xs font-bold px-2 py-0.5 rounded-full">
              {submissions.length}
            </span>
          )}
        </div>
        <button onClick={handleLogout} className="text-sm opacity-80 hover:opacity-100">
          Déconnexion
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        <h1 className="font-bold text-lg mb-4">File de modération</h1>

        {loading ? (
          <p className="text-gray-500 text-sm">Chargement...</p>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-2">🎉</div>
            <p>Aucun signalement en attente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map(sub => (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{typeEmojis[sub.type] ?? "📍"}</span>
                    <div>
                      <p className="font-semibold text-gray-900">{sub.name ?? "Sans nom"}</p>
                      <p className="text-xs text-gray-500">
                        {typeLabels[sub.type]} · {sub.governorate} · il y a {timeAgo(sub.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Details */}
                {sub.notes && (
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2 mb-3">{sub.notes}</p>
                )}
                <div className="text-xs text-gray-500 space-y-1 mb-3">
                  <p>📍 {sub.lat.toFixed(4)}, {sub.lng.toFixed(4)}</p>
                  {sub.contact_phone && <p>📞 {sub.contact_phone}</p>}
                  {sub.submitter_email && <p>✉️ {sub.submitter_email}</p>}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(sub)}
                    disabled={actionLoading === sub.id}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => setRejectModal({ id: sub.id, name: sub.name })}
                    disabled={actionLoading === sub.id}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h2 className="font-bold mb-1">Rejeter le signalement</h2>
            <p className="text-sm text-gray-500 mb-3">{rejectModal.name ?? "Sans nom"}</p>
            <select
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
            >
              <option value="">Choisir une raison (optionnel)</option>
              <option value="Doublon">Doublon</option>
              <option value="Localisation incorrecte">Localisation incorrecte</option>
              <option value="Informations insuffisantes">Informations insuffisantes</option>
              <option value="Contenu inapproprié">Contenu inapproprié</option>
              <option value="Autre">Autre</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal.id}
                className="flex-1 bg-[#CC0001] text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
