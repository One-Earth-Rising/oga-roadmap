import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, rpc } from "./supabase.js";

const OGA_LOGO = "https://jmbzrbteizvuqwukojzu.supabase.co/storage/v1/object/public/oga-files/oga_logo.png";

// ─── ACCESS TIER SYSTEM ──────────────────────────────────────────
const PHASE_CONFIG = {
  foundation: { phase: "01", title: "FOUNDATION", subtitle: "Core Platform & Identity", period: "FEB 2026" },
  social: { phase: "02", title: "SOCIAL & TRADING", subtitle: "Peer-to-Peer Economy", period: "FEB — MAR" },
  creator: { phase: "03", title: "CREATOR TOOLS", subtitle: "Content Pipeline", period: "MAR 2026" },
  beta: { phase: "04", title: "BETA LAUNCH", subtitle: "Hardening & Ops", period: "MAR — APR" },
  partners: { phase: "05", title: "PARTNERS", subtitle: "Distribution & Game Studios", period: "APR — JUL" },
  gamescom: { phase: "06", title: "GAMESCOM", subtitle: "Live Activation", period: "AUG 2026" },
};
const PHASE_ORDER = ["foundation", "social", "creator", "beta", "partners", "gamescom"];

function buildPhasesFromDB(milestones) {
  return PHASE_ORDER.map(id => {
    const cfg = PHASE_CONFIG[id];
    const phaseMilestones = milestones
      .filter(m => m.phase === id)
      .map(m => ({
        text: m.title,
        done: m.status === "complete",
        vis: m.visibility || "public",
        highlight: m.title.includes("Patent"),
      }));
    const doneCount = phaseMilestones.filter(m => m.done).length;
    const total = phaseMilestones.length;
    const allDone = total > 0 && doneCount === total;
    const anyInProgress = milestones.some(m => m.phase === id && m.status === "in_progress");
    return {
      id,
      ...cfg,
      status: allDone ? "complete" : (anyInProgress || (doneCount > 0 && doneCount < total)) ? "active" : "upcoming",
      progress: total > 0 ? Math.round((doneCount / total) * 100) : 0,
      milestones: phaseMilestones,
    };
  });
}

function cleanTicketTitle(raw) {
  return (raw || "Untitled")
    .replace(/^\[User App\]\s*/i, "")
    .replace(/^\[Creator Portal\]\s*/i, "")
    .replace(/^(BUG|FEATURE|UX):\s*/i, "")
    .trim();
}

function buildTicketsFromDB(rows) {
  return rows
    .filter(t => t.category !== "bug") // No bugs on roadmap
    .map(t => ({
      id: `TW-${t.teamwork_ticket_id}`,
      dbId: t.id,
      title: cleanTicketTitle(t.title),
      fullTitle: t.title, // Keep original for expand view
      status: t.status,
      priority: t.priority || "medium",
      votes: t.vote_count || 0,
      date: new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      category: t.category === "ux" ? "ux/ui" : (t.category || "other"),
      source: t.source || "user_app",
      vis: t.visibility || "public",
    }));
}

// ─── ACCESS TIER SYSTEM ──────────────────────────────────────────
const ACCESS_TIERS = {
  public: { level: 0, label: "PUBLIC", color: "#39FF14" },
  investor: { level: 1, label: "INVESTOR", color: "#FFA500" },
  internal: { level: 2, label: "INTERNAL", color: "#8B5CF6" },
};

function canSee(itemVisibility, currentTier) {
  const tierLevel = ACCESS_TIERS[currentTier]?.level ?? 0;
  const itemLevel = ACCESS_TIERS[itemVisibility]?.level ?? 0;
  return tierLevel >= itemLevel;
}

// ─── FALLBACK DATA (used when Supabase is unreachable) ──────────
const FALLBACK_PHASES = [
  {
    id: "foundation", phase: "01", title: "FOUNDATION",
    subtitle: "Core Platform & Identity", period: "FEB 2026",
    status: "complete",
    milestones: [
      { text: "Authentication with scanner protection", done: true, vis: "public" },
      { text: "Character library & detail screens", done: true, vis: "public" },
      { text: "Campaign routing engine", done: true, vis: "public" },
      { text: "Invite & friend system", done: true, vis: "public" },
      { text: "Guest browsing & share flows", done: true, vis: "public" },
    ],
  },
  {
    id: "social", phase: "02", title: "SOCIAL & TRADING",
    subtitle: "Peer-to-Peer Economy", period: "FEB — MAR",
    status: "complete",
    milestones: [
      { text: "Asset trading (propose, accept, revoke)", done: true, vis: "public" },
      { text: "QR code verification system", done: true, vis: "public" },
      { text: "Engagement analytics (6 RPCs)", done: true, vis: "public" },
      { text: "Notification system with trade enrichment", done: true, vis: "public" },
      { text: "Public asset verification pages", done: true, vis: "public" },
      { text: "Trade counteroffers (P2-11)", done: false, vis: "internal" },
      { text: "Scan QR native camera fix (P2-12)", done: false, vis: "internal" },
    ],
  },
  {
    id: "creator", phase: "03", title: "CREATOR TOOLS",
    subtitle: "Content Pipeline", period: "MAR 2026",
    status: "complete",
    milestones: [
      { text: "Creator Portal (character editor, brand management)", done: true, vis: "public" },
      { text: "Portal Pass builder (visual drag-and-drop)", done: true, vis: "public" },
      { text: "Feedback pipeline (app → Teamwork Desk)", done: true, vis: "public" },
      { text: "Game variations panel (7-platform URLs)", done: true, vis: "public" },
      { text: "Gameplay video management", done: true, vis: "public" },
    ],
  },
  {
    id: "beta", phase: "04", title: "BETA LAUNCH",
    subtitle: "Hardening & Ops", period: "MAR — APR",
    status: "active",
    milestones: [
      { text: "Schema consolidation (single source of truth)", done: true, vis: "public" },
      { text: "Beta backlog cleared (all P0/P1 resolved)", done: true, vis: "public" },
      { text: "Public roadmap", done: true, vis: "public" },
      { text: "Sprint task automation (Teamwork + n8n)", done: false, vis: "public" },
      { text: "Public ticket visibility for beta testers", done: false, vis: "public" },
      { text: "U.S. Patent granted (March 22, 2026)", done: true, vis: "public", highlight: true },
      { text: "Unique constraint on active ownership", done: false, vis: "internal" },
      { text: "go.oga.games URL switch in qr_service.dart", done: false, vis: "internal" },
    ],
  },
  {
    id: "partners", phase: "05", title: "PARTNERS",
    subtitle: "Distribution & Game Studios", period: "APR — JUL",
    status: "upcoming",
    milestones: [
      // Public sees sanitized versions
      { text: "Distribution partner OAuth integration", done: false, vis: "public" },
      { text: "Game studio partnership & character deployment", done: false, vis: "public" },
      { text: "IP licensing pilot program", done: false, vis: "public" },
      { text: "On-chain asset settlement", done: false, vis: "public" },
      // Investors see real names
      { text: "Xsolla OAuth bridge (bidirectional login)", done: false, vis: "investor" },
      { text: "Backpack API endpoints (connect, task, pass)", done: false, vis: "investor" },
      { text: "Royalty Machine pilot (Valiant Comics IP)", done: false, vis: "investor" },
      { text: "Soneium on-chain settlement (Sony blockchain)", done: false, vis: "investor" },
      // Internal only
      { text: "Ed-facing budget scenarios doc (low/mid/high)", done: false, vis: "internal" },
      { text: "Consumer workflow visual for Ed (zero Web3 terms)", done: false, vis: "internal" },
      { text: "Factions schema (6 tables, Dunbar caps, STV)", done: false, vis: "internal" },
    ],
  },
  {
    id: "gamescom", phase: "06", title: "GAMESCOM",
    subtitle: "Live Activation", period: "AUG 2026",
    status: "upcoming",
    milestones: [
      // Public
      { text: "Gamescom 2026 live activation", done: false, vis: "public" },
      { text: "Interactive quest experience for attendees", done: false, vis: "public" },
      { text: "Cross-game character demo", done: false, vis: "public" },
      // Investor
      { text: "Xsolla Backpack powered by OGA™ activation", done: false, vis: "investor" },
      { text: "Multi-day treasure hunt (5 quests → character unlock)", done: false, vis: "investor" },
      { text: "Physical NFC collectible cards (Legitimate)", done: false, vis: "investor" },
      { text: "Case study for $1.3M campaign unlock", done: false, vis: "investor" },
      // Internal
      { text: "Offline-first quest design (Gamescom Wi-Fi unreliable)", done: false, vis: "internal" },
      { text: "RFID/NFC ambassador cards (~100 completers)", done: false, vis: "internal" },
    ],
  },
];

const TICKET_STATUSES = {
  backlog: { label: "BACKLOG", color: "#666666", bg: "rgba(102,102,102,0.15)" },
  in_review: { label: "IN REVIEW", color: "#FFA500", bg: "rgba(255,165,0,0.12)" },
  in_production: { label: "IN PRODUCTION", color: "#4488FF", bg: "rgba(68,136,255,0.12)" },
  published: { label: "PUBLISHED", color: "#39FF14", bg: "rgba(57,255,20,0.12)" },
};

const FALLBACK_TICKETS = [
  // User App features
  { id: "TW-136", title: "Add counter-offer option to trade proposals", status: "in_review", priority: "medium", votes: 7, date: "Mar 25", category: "feature", source: "user_app", vis: "public" },
  { id: "TW-131", title: "Native camera for QR scan on mobile", status: "backlog", priority: "low", votes: 5, date: "Mar 23", category: "feature", source: "user_app", vis: "public" },
  { id: "TW-125", title: "Dark mode toggle in settings", status: "backlog", priority: "low", votes: 8, date: "Mar 21", category: "feature", source: "user_app", vis: "public" },
  { id: "TW-120", title: "Character comparison view side-by-side", status: "in_review", priority: "medium", votes: 4, date: "Mar 19", category: "ux", source: "user_app", vis: "public" },
  // Creator Portal features
  { id: "TW-133", title: "Reorder portal pass sections with drag-and-drop", status: "backlog", priority: "medium", votes: 3, date: "Mar 24", category: "feature", source: "creator_portal", vis: "public" },
  { id: "TW-129", title: "Bulk character import from CSV", status: "in_production", priority: "high", votes: 6, date: "Mar 22", category: "feature", source: "creator_portal", vis: "public" },
  { id: "TW-126", title: "Preview portal pass as end user", status: "in_review", priority: "medium", votes: 4, date: "Mar 21", category: "ux", source: "creator_portal", vis: "public" },
  // Internal
  { id: "TW-148", title: "Ed demo environment: hide blockchain references", status: "in_production", priority: "high", votes: 0, date: "Mar 29", category: "feature", source: "creator_portal", vis: "internal" },
  { id: "TW-147", title: "Seed Valiant characters for Royalty Machine test", status: "backlog", priority: "medium", votes: 0, date: "Mar 29", category: "feature", source: "user_app", vis: "internal" },
];

// ─── ACCESS MODAL (Request Access + Sign In) ──────────────────
const AccessModal = ({ onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState("request"); // "request", "signin", "verify"
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [firm, setFirm] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  const handleRequest = async () => {
    if (!email.trim() || !fullName.trim()) {
      setMessage({ type: "error", text: "Name and email are required." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const result = await rpc("request_roadmap_access", {
      p_email: email.trim(),
      p_full_name: fullName.trim(),
      p_firm: firm.trim() || null,
    });
    setLoading(false);
    if (result) {
      if (result.status === "submitted" || result.status === "already_pending") {
        setMessage({ type: "success", text: result.message });
      } else if (result.status === "already_approved") {
        setMessage({ type: "info", text: result.message });
        setMode("signin");
        setEmail(email.trim());
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } else {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    }
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setMessage({ type: "error", text: "Please enter your email." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMode("verify");
      setMessage({ type: "success", text: "An 8-digit code has been sent to your email." });
    }
  };

  const handleVerifyCode = async () => {
    if (!otpCode.trim() || otpCode.trim().length < 8) {
      setMessage({ type: "error", text: "Please enter the 8-digit code." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: "Invalid or expired code. Please try again." });
      setOtpCode("");
    }
    // Auth state change listener in parent handles the rest
  };

  const msgColors = { success: "#39FF14", error: "#FF4444", info: "#FFA500" };

  const inputStyle = {
    width: "100%", padding: "10px 14px",
    background: "#0A0A0A", border: "1px solid #2C2C2C",
    borderRadius: 8, color: "#fff", fontSize: 14,
    outline: "none", boxSizing: "border-box",
    marginBottom: 10,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }} onClick={onClose}>
      <div className="rm-access-modal" onClick={e => e.stopPropagation()} style={{
        background: "#121212", border: "1px solid #2C2C2C",
        borderRadius: 16, padding: "28px 24px", maxWidth: 380, width: "100%",
        position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 14,
          background: "none", border: "none", color: "rgba(255,255,255,0.3)",
          fontSize: 18, cursor: "pointer", padding: 4,
        }}>✕</button>

        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "#FFA500", marginBottom: 12, textTransform: "uppercase",
        }}>INVESTOR ACCESS</div>

        {/* Tab toggle */}
        <div style={{
          display: "flex", gap: 2, marginBottom: 18,
          background: "#0A0A0A", borderRadius: 8, padding: 3,
        }}>
          {[
            { key: "request", label: "Request access" },
            { key: "signin", label: "Sign in" },
          ].map(t => (
            <button key={t.key} onClick={() => { setMode(t.key); setMessage(null); setOtpCode(""); }} style={{
              flex: 1, padding: "7px 0", borderRadius: 6,
              background: (mode === t.key || (mode === "verify" && t.key === "signin")) ? "#2C2C2C" : "transparent",
              color: (mode === t.key || (mode === "verify" && t.key === "signin")) ? "#fff" : "rgba(255,255,255,0.35)",
              border: "none", fontSize: 12, fontWeight: 600,
              cursor: "pointer", transition: "all 0.15s ease",
            }}>{t.label}</button>
          ))}
        </div>

        {mode === "request" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>
              Request access to see partner details, strategic milestones, and confidential roadmap data.
            </div>
            <input
              ref={inputRef}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Full name *"
              style={inputStyle}
            />
            <input
              value={firm}
              onChange={e => setFirm(e.target.value)}
              placeholder="Firm or company (optional)"
              style={inputStyle}
            />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRequest()}
              placeholder="Email address *"
              style={inputStyle}
            />
            <button onClick={handleRequest} disabled={loading} style={{
              width: "100%", padding: "10px 0", marginTop: 4,
              background: loading ? "#555" : "#FFA500", color: "#000",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              cursor: loading ? "default" : "pointer", textTransform: "uppercase",
              opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "SUBMITTING..." : "REQUEST ACCESS"}
            </button>
          </>
        )}

        {mode === "signin" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>
              Enter the email you registered with. We'll send an 8-digit verification code.
            </div>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSendCode()}
              placeholder="Email address"
              style={inputStyle}
            />
            <button onClick={handleSendCode} disabled={loading} style={{
              width: "100%", padding: "10px 0", marginTop: 4,
              background: loading ? "#555" : "#39FF14", color: "#000",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              cursor: loading ? "default" : "pointer", textTransform: "uppercase",
              opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "SENDING..." : "SEND CODE"}
            </button>
          </>
        )}

        {mode === "verify" && (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>
              Enter the 8-digit code sent to <span style={{ color: "#fff" }}>{email}</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && handleVerifyCode()}
              placeholder="00000000"
              style={{
                ...inputStyle,
                textAlign: "center",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "0.3em",
                fontFamily: "monospace",
              }}
            />
            <button onClick={handleVerifyCode} disabled={loading} style={{
              width: "100%", padding: "10px 0", marginTop: 4,
              background: loading ? "#555" : "#39FF14", color: "#000",
              border: "none", borderRadius: 8,
              fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
              cursor: loading ? "default" : "pointer", textTransform: "uppercase",
              opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "VERIFYING..." : "VERIFY"}
            </button>
            <button onClick={() => { setMode("signin"); setMessage(null); setOtpCode(""); }} style={{
              width: "100%", padding: "8px 0", marginTop: 6,
              background: "transparent", color: "rgba(255,255,255,0.35)",
              border: "none", fontSize: 11, cursor: "pointer",
            }}>
              Didn't receive it? Go back
            </button>
          </>
        )}

        {message && (
          <div style={{
            marginTop: 12, padding: "10px 14px",
            background: `${msgColors[message.type]}10`,
            border: `1px solid ${msgColors[message.type]}30`,
            borderRadius: 8, fontSize: 12,
            color: msgColors[message.type], lineHeight: 1.5,
          }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TIER BADGE ──────────────────────────────────────────────────
const TierBadge = ({ tier, onClick }) => {
  if (tier === "public") return null;
  const cfg = ACCESS_TIERS[tier];
  return (
    <button onClick={onClick} style={{
      background: `${cfg.color}18`, color: cfg.color,
      border: `1px solid ${cfg.color}33`,
      padding: "3px 10px", borderRadius: 12,
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      cursor: "pointer", textTransform: "uppercase",
      display: "flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ fontSize: 11 }}>●</span> {cfg.label} VIEW
    </button>
  );
};

// ─── VISIBILITY INDICATOR (small dot on restricted items) ───────
const VisIndicator = ({ vis }) => {
  if (vis === "public") return null;
  const c = vis === "investor" ? "#FFA500" : "#8B5CF6";
  return (
    <span title={`${vis} only`} style={{
      width: 6, height: 6, borderRadius: "50%",
      background: c, opacity: 0.6, flexShrink: 0,
      display: "inline-block",
    }} />
  );
};

// ─── HORIZONTAL TIMELINE ────────────────────────────────────────
const Timeline = ({ phases, activePhaseId, onPhaseClick, tier }) => {
  const getVisibleMilestones = (phase) =>
    phase.milestones.filter(m => canSee(m.vis, tier));

  const totalM = phases.reduce((s, p) => s + getVisibleMilestones(p).length, 0);
  const doneM = phases.reduce((s, p) => s + getVisibleMilestones(p).filter(m => m.done).length, 0);
  const pct = totalM > 0 ? Math.round((doneM / totalM) * 100) : 0;

  return (
    <div className="rm-timeline" style={{
      background: "#0A0A0A",
      borderBottom: "1px solid #2C2C2C",
      padding: "18px 0 14px",
      position: "sticky", top: 56, zIndex: 90,
    }}>
      {/* Overall progress */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 24px", marginBottom: 10,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
          color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
        }}>OVERALL PROGRESS</span>
        <span style={{
          fontSize: 14, fontWeight: 900, color: "#39FF14",
          letterSpacing: "0.04em",
        }}>{pct}%</span>
      </div>

      <div className="rm-timeline-bar" style={{
        margin: "0 24px 14px", height: 3,
        background: "#2C2C2C", borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2, background: "#39FF14",
          width: `${pct}%`, transition: "width 1.5s ease",
          boxShadow: "0 0 10px rgba(57,255,20,0.4)",
        }} />
      </div>

      {/* Phase nodes */}
      <div className="rm-timeline-nodes" style={{
        display: "flex", alignItems: "flex-start",
        padding: "4px 24px 0",
        gap: 0, overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {phases.map((phase, i) => {
          const isComplete = phase.status === "complete";
          const isActive = phase.status === "active";
          const isSelected = phase.id === activePhaseId;
          const sz = 28;

          return (
            <div key={phase.id} style={{
              display: "flex", alignItems: "flex-start", flex: 1, minWidth: 0,
            }}>
              <div
                className="rm-tl-wrap"
                onClick={() => onPhaseClick(phase.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  cursor: "pointer", minWidth: 44, position: "relative", zIndex: 2,
                }}
              >
                <div className="rm-tl-circle" style={{
                  width: sz, height: sz, borderRadius: "50%",
                  border: `2px solid ${isComplete || isActive ? "#39FF14" : "#2C2C2C"}`,
                  background: isComplete ? "rgba(57,255,20,0.2)" : isActive ? "rgba(57,255,20,0.1)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: isComplete || isActive ? "#39FF14" : "#555",
                  transition: "all 0.3s ease",
                  boxShadow: isSelected ? "0 0 14px rgba(57,255,20,0.35)" : "none",
                  transform: isSelected ? "scale(1.2)" : "scale(1)",
                }}>
                  {isComplete ? "✓" : phase.phase}
                </div>
                <div style={{ marginTop: 6, textAlign: "center", lineHeight: 1.2 }}>
                  <div className="rm-tl-title" style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    color: isSelected ? "#fff" : isComplete || isActive ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.25)",
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>{phase.title}</div>
                  <div className="rm-tl-period" style={{
                    fontSize: 8, color: "rgba(255,255,255,0.18)", marginTop: 1, whiteSpace: "nowrap",
                  }}>{phase.period}</div>
                </div>
              </div>

              {i < phases.length - 1 && (
                <div style={{
                  flex: 1, height: 2, minWidth: 8,
                  marginTop: sz / 2 - 1,
                  background: phases[i + 1].status === "upcoming" && !isActive
                    ? "#2C2C2C"
                    : isComplete ? "rgba(57,255,20,0.3)" : "#39FF14",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── PHASE DETAIL CARD ──────────────────────────────────────────
const PhaseCard = ({ phase, isExpanded, onToggle, tier }) => {
  const isActive = phase.status === "active";
  const isComplete = phase.status === "complete";
  const visible = phase.milestones.filter(m => canSee(m.vis, tier));
  const doneVisible = visible.filter(m => m.done).length;
  const progress = visible.length > 0 ? Math.round((doneVisible / visible.length) * 100) : 0;

  return (
    <div
      className="rm-phase-card"
      onClick={onToggle}
      style={{
        background: "#121212",
        border: `1px solid ${isExpanded ? "#39FF14" : isActive ? "rgba(57,255,20,0.35)" : "#2C2C2C"}`,
        borderRadius: 16, padding: "20px 24px",
        cursor: "pointer", transition: "all 0.25s ease",
        position: "relative", overflow: "hidden",
      }}
    >
      {isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, #39FF14, transparent)",
          animation: "shimmer 3s ease infinite",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div className="rm-phase-num" style={{
          fontSize: 38, fontWeight: 900, lineHeight: 1,
          color: isComplete || isActive ? "#39FF14" : "#2C2C2C",
          opacity: isComplete ? 0.25 : isActive ? 0.7 : 0.45,
          minWidth: 48, textAlign: "center",
        }}>{phase.phase}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <h3 className="rm-phase-title" style={{
              margin: 0, fontSize: 16, fontWeight: 800,
              letterSpacing: "0.07em", textTransform: "uppercase",
            }}>{phase.title}</h3>
            {isComplete && (
              <span style={{
                background: "rgba(57,255,20,0.1)", color: "#39FF14",
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
              }}>COMPLETE</span>
            )}
            {isActive && (
              <span style={{
                background: "rgba(57,255,20,0.12)", color: "#39FF14",
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                animation: "pulse 2s ease infinite",
              }}>ACTIVE</span>
            )}
            <span style={{
              marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.25)",
              fontWeight: 600,
            }}>{doneVisible}/{visible.length}</span>
          </div>

          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            {phase.subtitle}
          </div>

          <div style={{
            marginTop: 10, height: 3, background: "#2C2C2C",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: isComplete ? "rgba(57,255,20,0.3)" : "#39FF14",
              width: `${progress}%`, transition: "width 1s ease",
              boxShadow: isActive ? "0 0 8px rgba(57,255,20,0.4)" : "none",
            }} />
          </div>

          {/* Expanded milestones */}
          <div style={{
            maxHeight: isExpanded ? 600 : 0,
            overflow: "hidden", transition: "max-height 0.4s ease",
            marginTop: isExpanded ? 14 : 0,
          }}>
            {visible.map((m, i) => (
              <div key={i} className="rm-milestone-row" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "5px 0",
                borderBottom: i < visible.length - 1 ? "1px solid rgba(44,44,44,0.35)" : "none",
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: `2px solid ${m.done ? "#39FF14" : "#2C2C2C"}`,
                  background: m.done ? "rgba(57,255,20,0.12)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, color: "#39FF14", flexShrink: 0,
                }}>{m.done && "✓"}</div>
                <span style={{
                  fontSize: 13, color: m.done ? "rgba(255,255,255,0.45)" : "#fff",
                  flex: 1,
                }}>{m.text}</span>
                <VisIndicator vis={m.vis} />
                {m.highlight && (
                  <span style={{
                    background: "rgba(57,255,20,0.1)", color: "#39FF14",
                    padding: "1px 6px", borderRadius: 3, fontSize: 8,
                    fontWeight: 700, flexShrink: 0,
                  }}>★ MILESTONE</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.18)" }}>
            {isExpanded ? "▲ collapse" : `▼ ${visible.length} milestones`}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── TICKET BOARD ───────────────────────────────────────────────
const TicketBoard = ({ tickets, tier, user }) => {
  const [votedIds, setVotedIds] = useState(new Set());
  const [localVotes, setLocalVotes] = useState({});
  const [voteLoginId, setVoteLoginId] = useState(null);
  const [voteEmail, setVoteEmail] = useState("");
  const [voteCode, setVoteCode] = useState("");
  const [voteStep, setVoteStep] = useState("email");
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteMsg, setVoteMsg] = useState(null);

  const handleVote = async (ticket, e) => {
    e.stopPropagation();
    if (!user) {
      setVoteLoginId(voteLoginId === ticket.id ? null : ticket.id);
      setVoteStep("email");
      setVoteMsg(null);
      setVoteEmail("");
      setVoteCode("");
      return;
    }
    if (!ticket.dbId || votedIds.has(ticket.id)) return;
    console.log("Voting for ticket:", ticket.dbId, ticket.id);
    // Optimistic update — vote is recorded even if RPC response format varies
    setVotedIds(prev => new Set([...prev, ticket.id]));
    setLocalVotes(prev => ({ ...prev, [ticket.id]: (prev[ticket.id] || ticket.votes) + 1 }));
    // Fire and forget — the DB write works, response parsing is unreliable
    rpc("vote_ticket", { p_ticket_id: ticket.dbId });
  };

  const handleVoteSendCode = async (e) => {
    e.stopPropagation();
    if (!voteEmail.trim()) return;
    setVoteLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: voteEmail.trim() });
    setVoteLoading(false);
    if (error) {
      setVoteMsg("Could not send code. Try again.");
    } else {
      setVoteStep("code");
      setVoteMsg("Check your email for the 8-digit code.");
    }
  };

  const handleVoteVerify = async (e) => {
    e.stopPropagation();
    if (!voteCode.trim() || voteCode.length < 8) return;
    setVoteLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: voteEmail.trim(), token: voteCode.trim(), type: "email",
    });
    setVoteLoading(false);
    if (error) {
      setVoteMsg("Invalid or expired code.");
      setVoteCode("");
    }
  };

  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const statusOrder = ["in_production", "in_review", "backlog", "published"];

  const visible = tickets.filter(t => canSee(t.vis, tier) && t.category !== "bug");
  const filtered = visible
    .filter(t => filter === "all" || t.status === filter)
    .sort((a, b) => {
      const ai = statusOrder.indexOf(a.status);
      const bi = statusOrder.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return b.votes - a.votes;
    });

  const userAppTickets = filtered.filter(t => t.source === "user_app");
  const creatorTickets = filtered.filter(t => t.source === "creator_portal");

  const counts = Object.fromEntries(
    Object.keys(TICKET_STATUSES).map(s => [s, visible.filter(t => t.status === s).length])
  );

  const categoryColors = {
    feature: { bg: "rgba(68,136,255,0.1)", color: "#4488FF" },
    ux: { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6" },
    "ux/ui": { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6" },
    other: { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" },
  };

  const TicketRow = ({ ticket }) => {
    const cfg = TICKET_STATUSES[ticket.status];
    const catCfg = categoryColors[ticket.category] || categoryColors.other;
    const isExpanded = expandedId === ticket.id;

    return (
      <div
        onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
        className="rm-ticket-row"
        style={{
          background: "#121212", border: "1px solid #2C2C2C",
          borderRadius: 12, padding: "12px 16px",
          cursor: "pointer", transition: "border-color 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: ticket.priority === "high" ? "#FF4444"
              : ticket.priority === "medium" ? "#FFA500" : "#4488FF",
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rm-ticket-title" style={{
              fontSize: 13, fontWeight: 600,
              overflow: isExpanded ? "visible" : "hidden",
              textOverflow: isExpanded ? "unset" : "ellipsis",
              whiteSpace: isExpanded ? "normal" : "nowrap",
              lineHeight: 1.4,
            }}>
              {ticket.title}
            </div>
            <div className="rm-ticket-meta" style={{
              fontSize: 9, color: "rgba(255,255,255,0.22)",
              marginTop: 3, display: "flex", gap: 7, alignItems: "center",
            }}>
              <code style={{ fontFamily: "monospace", fontSize: 9 }}>{ticket.id}</code>
              <span>·</span>
              <span>{ticket.date}</span>
              <span>·</span>
              <span style={{
                background: catCfg.bg, color: catCfg.color,
                padding: "0 5px", borderRadius: 3, fontSize: 8,
                fontWeight: 600, textTransform: "uppercase",
              }}>{ticket.category}</span>
              <VisIndicator vis={ticket.vis} />
            </div>
          </div>
          <div
            className="rm-ticket-votes"
            onClick={(e) => handleVote(ticket, e)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28,
              cursor: user ? "pointer" : "default",
              opacity: votedIds.has(ticket.id) ? 1 : 0.6,
              transition: "opacity 0.2s ease",
            }}
            title={user ? (votedIds.has(ticket.id) ? "You voted!" : "Vote for this feature") : "Sign in to vote"}
          >
            <span style={{
              fontSize: 10,
              color: votedIds.has(ticket.id) ? "#39FF14" : "rgba(57,255,20,0.45)",
              transition: "color 0.2s ease",
            }}>▲</span>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: votedIds.has(ticket.id) ? "#39FF14" : "rgba(255,255,255,0.45)",
              transition: "color 0.2s ease",
            }}>{localVotes[ticket.id] ?? ticket.votes}</span>
          </div>
          <span className="rm-ticket-status" style={{
            background: cfg.bg, color: cfg.color,
            padding: "3px 8px", borderRadius: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>{cfg.label}</span>
        </div>

      </div>
    );
  };

  const VoteLoginInline = ({ ticketId }) => {
    if (user || voteLoginId !== ticketId) return null;
    return (
      <div className="rm-vote-login" onClick={e => e.stopPropagation()} style={{
        marginTop: -4, marginBottom: 6, padding: "10px 12px",
        background: "#0A0A0A", border: "1px solid #2C2C2C",
        borderTop: "none", borderRadius: "0 0 12px 12px",
      }}>
        {voteStep === "email" ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="email"
              value={voteEmail}
              onChange={e => setVoteEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleVoteSendCode(e)}
              placeholder="Your OGA email"
              onClick={e => e.stopPropagation()}
              autoFocus
              style={{
                flex: 1, padding: "6px 10px",
                background: "#121212", border: "1px solid #2C2C2C",
                borderRadius: 6, color: "#fff", fontSize: 12,
                outline: "none",
              }}
            />
            <button
              onClick={handleVoteSendCode}
              disabled={voteLoading}
              style={{
                padding: "6px 12px", background: voteLoading ? "#555" : "#39FF14",
                color: "#000", border: "none", borderRadius: 6,
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{voteLoading ? "..." : "SEND CODE"}</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              value={voteCode}
              onChange={e => setVoteCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && handleVoteVerify(e)}
              placeholder="8-digit code"
              onClick={e => e.stopPropagation()}
              autoFocus
              style={{
                flex: 1, padding: "6px 10px",
                background: "#121212", border: "1px solid #2C2C2C",
                borderRadius: 6, color: "#fff", fontSize: 14,
                fontFamily: "monospace", letterSpacing: "0.15em",
                outline: "none", textAlign: "center",
              }}
            />
            <button
              onClick={handleVoteVerify}
              disabled={voteLoading}
              style={{
                padding: "6px 12px", background: voteLoading ? "#555" : "#39FF14",
                color: "#000", border: "none", borderRadius: 6,
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >{voteLoading ? "..." : "VERIFY"}</button>
          </div>
        )}
        {voteMsg && (
          <div style={{
            marginTop: 6, fontSize: 10,
            color: voteMsg.includes("Check") ? "#39FF14" : "#FF4444",
          }}>{voteMsg}</div>
        )}
        <div style={{
          marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.2)",
        }}>Sign in with your OGA account to vote</div>
      </div>
    );
  };

  const SectionHeader = ({ icon, title, count }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "16px 0 8px",
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
        color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
      }}>{title}</span>
      <span style={{
        background: "rgba(255,255,255,0.06)", padding: "1px 7px",
        borderRadius: 10, fontSize: 10, fontWeight: 600,
        color: "rgba(255,255,255,0.3)",
      }}>{count}</span>
    </div>
  );

  return (
    <div>
      {/* Status filter pills */}
      <div className="rm-filter-pills" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="rm-filter-pill" onClick={() => setFilter("all")} style={{
          background: filter === "all" ? "rgba(255,255,255,0.08)" : "transparent",
          color: filter === "all" ? "#fff" : "rgba(255,255,255,0.35)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "5px 12px", borderRadius: 20,
          fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}>ALL {visible.length}</button>
        {statusOrder.map(s => {
          const cfg = TICKET_STATUSES[s];
          return (
            <button className="rm-filter-pill" key={s} onClick={() => setFilter(s)} style={{
              background: filter === s ? cfg.bg : "transparent",
              color: filter === s ? cfg.color : "rgba(255,255,255,0.3)",
              border: `1px solid ${filter === s ? cfg.color + "33" : "rgba(255,255,255,0.05)"}`,
              padding: "5px 12px", borderRadius: 20,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>{cfg.label} {counts[s] || 0}</button>
          );
        })}
      </div>

      {/* User App section */}
      <SectionHeader icon="🎮" title="User App" count={userAppTickets.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {userAppTickets.length > 0 ? userAppTickets.map(t => (
          <div key={t.id}>
            <TicketRow ticket={t} />
            <VoteLoginInline ticketId={t.id} />
          </div>
        )) : (
          <div style={{
            padding: "16px", textAlign: "center",
            fontSize: 12, color: "rgba(255,255,255,0.2)",
          }}>No feature requests yet</div>
        )}
      </div>

      {/* Creator Portal section */}
      <SectionHeader icon="🛠" title="Creator Portal" count={creatorTickets.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {creatorTickets.length > 0 ? creatorTickets.map(t => (
          <div key={t.id}>
            <TicketRow ticket={t} />
            <VoteLoginInline ticketId={t.id} />
          </div>
        )) : (
          <div style={{
            padding: "16px", textAlign: "center",
            fontSize: 12, color: "rgba(255,255,255,0.2)",
          }}>No feature requests yet</div>
        )}
      </div>

      {/* How this works */}
      <div className="rm-how-it-works" style={{
        marginTop: 20, padding: "14px 18px",
        background: "rgba(57,255,20,0.03)",
        border: "1px solid rgba(57,255,20,0.06)",
        borderRadius: 12, fontSize: 12,
        color: "rgba(255,255,255,0.35)", lineHeight: 1.6,
      }}>
        <span style={{
          color: "#39FF14", fontWeight: 700, fontSize: 9,
          letterSpacing: "0.08em", display: "block", marginBottom: 3,
        }}>HOW THIS WORKS</span>
        Submit feedback from the OGA app → our team reviews feature requests
        for public visibility → approved requests appear here with
        live status updates as they move through production.
      </div>
    </div>
  );
};

// ─── MAIN APP ───────────────────────────────────────────────────
export default function OGARoadmap() {
  const [activeTab, setActiveTab] = useState("roadmap");
  const [activePhaseId, setActivePhaseId] = useState("beta");
  const [expandedPhases, setExpandedPhases] = useState(new Set(["beta"]));
  const [tier, setTier] = useState("public");
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [phases, setPhases] = useState(FALLBACK_PHASES);
  const [tickets, setTickets] = useState(FALLBACK_TICKETS);
  const [dataSource, setDataSource] = useState("local");
  const [user, setUser] = useState(null); // Supabase auth user
  const [accessStatus, setAccessStatus] = useState(null); // pending, approved, denied, revoked, none

  // Fetch roadmap data based on tier
  const fetchLiveData = useCallback(async (visTier) => {
    const milestones = await rpc("get_roadmap_milestones", { p_visibility: visTier });
    if (milestones && milestones.length > 0) {
      setPhases(buildPhasesFromDB(milestones));
      setDataSource("live");
      console.log(`Roadmap: loaded ${milestones.length} milestones (${visTier} tier)`);
    }
    const ticketRows = await rpc("get_public_tickets", {
      p_visibility: visTier, p_status: null, p_limit: 50
    });
    if (ticketRows && ticketRows.length > 0) {
      setTickets(buildTicketsFromDB(ticketRows));
    }
  }, []);

  // Check access tier for authenticated user
  const checkAccess = useCallback(async () => {
    const result = await rpc("check_roadmap_access");
    if (result) {
      setTier(result.tier || "public");
      setAccessStatus(result.status);
      fetchLiveData(result.tier || "public");
      console.log(`Roadmap access: tier=${result.tier}, status=${result.status}`);
    }
  }, [fetchLiveData]);

  // Auth state listener
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAccess();
      } else {
        fetchLiveData("public");
      }
    });

    // Listen for auth changes (magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("Auth event:", event);
        setUser(session?.user ?? null);
        if (session?.user) {
          checkAccess();
          setShowAccessModal(false);
        } else {
          setTier("public");
          setAccessStatus(null);
          fetchLiveData("public");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [checkAccess, fetchLiveData]);

  const togglePhase = useCallback((id) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setActivePhaseId(id);
  }, []);

  const handleTimelineClick = useCallback((id) => {
    setActivePhaseId(id);
    setActiveTab("roadmap");
    setExpandedPhases(prev => new Set([...prev, id]));
    setTimeout(() => {
      document.getElementById(`phase-${id}`)?.scrollIntoView({
        behavior: "smooth", block: "center",
      });
    }, 100);
  }, []);

  const handleLockClick = async () => {
    if (user && tier !== "public") {
      // Sign out → revert to public
      await supabase.auth.signOut();
      setUser(null);
      setTier("public");
      setAccessStatus(null);
      fetchLiveData("public");
    } else {
      setShowAccessModal(true);
    }
  };

  const getVisibleMilestones = (phase) =>
    phase.milestones.filter(m => canSee(m.vis, tier));
  const totalM = phases.reduce((s, p) => s + getVisibleMilestones(p).length, 0);
  const doneM = phases.reduce((s, p) => s + getVisibleMilestones(p).filter(m => m.done).length, 0);

  return (
    <div style={{
      minHeight: "100vh", background: "#000",
      fontFamily: "'Helvetica Neue', Arial, Helvetica, sans-serif",
      color: "#fff",
    }}>
      <style>{`
        @keyframes shimmer { 0%,100%{opacity:0.3} 50%{opacity:1} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        * { box-sizing: border-box; }
        body { margin: 0; background: #000; }
        ::-webkit-scrollbar { width: 5px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2C2C2C; border-radius: 3px; }
        input::placeholder { color: rgba(255,255,255,0.25); }

        @media (max-width: 640px) {
          .rm-header { padding: 10px 12px !important; }
          .rm-header-logo { height: 22px !important; }
          .rm-header-label { display: none !important; }
          .rm-header-tabs { gap: 0 !important; }
          .rm-header-tab { padding: 5px 8px !important; font-size: 9px !important; }
          .rm-header-lock span { display: none !important; }
          .rm-header-lock { padding: 5px 8px !important; margin-left: 0 !important; }
          .rm-header-user { max-width: 100px !important; font-size: 8px !important; }
          .rm-vote-login { padding: 8px !important; }
          .rm-vote-login input { font-size: 12px !important; }
          .rm-timeline { padding: 12px 0 10px !important; }
          .rm-timeline-bar { margin: 0 12px 10px !important; }
          .rm-timeline-nodes { padding: 4px 8px 0 !important; }
          .rm-tl-circle { width: 22px !important; height: 22px !important; font-size: 8px !important; }
          .rm-tl-title { font-size: 7px !important; }
          .rm-tl-period { display: none !important; }
          .rm-tl-wrap { min-width: 32px !important; }
          .rm-main { padding: 16px 12px 48px !important; }
          .rm-phase-card { padding: 14px !important; border-radius: 12px !important; }
          .rm-phase-num { font-size: 28px !important; min-width: 36px !important; }
          .rm-phase-title { font-size: 13px !important; }
          .rm-milestone-row { font-size: 11px !important; }
          .rm-section-title { font-size: 16px !important; }
          .rm-filter-pills { gap: 4px !important; }
          .rm-filter-pill { padding: 4px 8px !important; font-size: 9px !important; }
          .rm-ticket-row { padding: 10px 12px !important; }
          .rm-ticket-title { font-size: 12px !important; }
          .rm-ticket-meta { font-size: 8px !important; }
          .rm-ticket-status { font-size: 8px !important; padding: 2px 6px !important; }
          .rm-ticket-votes { min-width: 22px !important; }
          .rm-ticket-votes span:last-child { font-size: 11px !important; }
          .rm-how-it-works { padding: 12px 14px !important; font-size: 11px !important; }
          .rm-access-modal { padding: 20px 16px !important; max-width: 340px !important; }
        }
        @media (max-width: 380px) {
          .rm-header-tab { padding: 4px 6px !important; font-size: 8px !important; }
          .rm-tl-title { font-size: 6px !important; }
          .rm-phase-num { font-size: 24px !important; min-width: 30px !important; }
          .rm-phase-title { font-size: 12px !important; }
          .rm-header-user { display: none !important; }
        }
      `}</style>

      {showAccessModal && (
        <AccessModal
          onClose={() => setShowAccessModal(false)}
          onAuthSuccess={() => checkAccess()}
        />
      )}

      {/* HEADER */}
      <header className="rm-header" style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid #2C2C2C",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img className="rm-header-logo" src={OGA_LOGO} alt="OGA" style={{ height: 28 }} />
          <span className="rm-header-label" style={{
            fontSize: 10, color: "rgba(255,255,255,0.28)",
            letterSpacing: "0.1em",
          }}>ROADMAP</span>
        </div>
        <div className="rm-header-tabs" style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {[
            { key: "roadmap", label: "MILESTONES" },
            { key: "community", label: "COMMUNITY" },
          ].map(tab => (
            <button className="rm-header-tab" key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              background: activeTab === tab.key ? "rgba(57,255,20,0.1)" : "transparent",
              color: activeTab === tab.key ? "#39FF14" : "rgba(255,255,255,0.4)",
              border: "none", padding: "6px 14px", borderRadius: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              cursor: "pointer",
            }}>{tab.label}</button>
          ))}
          {user && (
            <div className="rm-header-user" style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 6,
              background: "rgba(57,255,20,0.06)",
              border: "1px solid rgba(57,255,20,0.1)",
              maxWidth: 140, overflow: "hidden",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%",
                background: "rgba(57,255,20,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, color: "#39FF14", fontWeight: 700, flexShrink: 0,
              }}>{(user.email || "?")[0].toUpperCase()}</div>
              <span style={{
                fontSize: 9, color: "rgba(255,255,255,0.4)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{user.email}</span>
            </div>
          )}
          <button
            className="rm-header-lock"
            onClick={handleLockClick}
            title={user && tier !== "public" ? `Signed in as ${user.email} — click to sign out` : "Investor access"}
            style={{
              background: tier === "investor" ? "rgba(255,165,0,0.1)" : tier === "internal" ? "rgba(139,92,246,0.1)" : "transparent",
              border: tier !== "public" ? `1px solid ${ACCESS_TIERS[tier]?.color || "#FFA500"}40` : "1px solid transparent",
              color: tier !== "public" ? (ACCESS_TIERS[tier]?.color || "#FFA500") : "rgba(255,255,255,0.2)",
              padding: "5px 10px", borderRadius: 6,
              cursor: "pointer",
              marginLeft: 4, transition: "all 0.2s ease",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="10" height="7" rx="1.5" />
              {tier !== "public"
                ? <path d="M5 8V5a3 3 0 0 1 6 0" />
                : <path d="M5 8V5a3 3 0 0 1 6 0V8" />
              }
            </svg>
            {tier !== "public" && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>
                {ACCESS_TIERS[tier]?.label || "INVESTOR"}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* TIMELINE */}
      <Timeline
        phases={phases}
        activePhaseId={activePhaseId}
        onPhaseClick={handleTimelineClick}
        tier={tier}
      />

      {/* CONTENT */}
      <main className="rm-main" style={{ maxWidth: 740, margin: "0 auto", padding: "24px 24px 64px" }}>
        {activeTab === "roadmap" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <h1 style={{
                fontSize: "clamp(24px, 4vw, 40px)",
                fontWeight: 900, letterSpacing: "0.05em",
                margin: 0, lineHeight: 1.15, textTransform: "uppercase",
              }}>
                BUILDING THE <span style={{ color: "#39FF14" }}>OGA ECOSYSTEM</span>
              </h1>
              <p style={{
                fontSize: 13, color: "rgba(255,255,255,0.35)",
                maxWidth: 440, margin: "10px auto 0", lineHeight: 1.6,
              }}>
                One Character. Infinite Worlds. Track our progress from platform
                foundation to Gamescom 2026.
              </p>
              <div style={{
                display: "flex", justifyContent: "center", gap: 28, marginTop: 16,
              }}>
                {[
                  { v: `${doneM}/${totalM}`, l: "MILESTONES" },
                  { v: "44", l: "SPRINT" },
                  { v: "GRANTED", l: "U.S. PATENT", green: true },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{
                      fontSize: 20, fontWeight: 900, color: s.green ? "#39FF14" : "#fff",
                    }}>{s.v}</div>
                    <div style={{
                      fontSize: 8, color: "rgba(255,255,255,0.25)",
                      letterSpacing: "0.12em",
                    }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {phases.map((phase) => (
                <div key={phase.id} id={`phase-${phase.id}`}>
                  <PhaseCard
                    phase={phase}
                    isExpanded={expandedPhases.has(phase.id)}
                    onToggle={() => togglePhase(phase.id)}
                    tier={tier}
                  />
                </div>
              ))}
            </div>

            <div style={{
              textAlign: "center", padding: "28px 0 0",
              fontSize: 11, color: "rgba(255,255,255,0.18)", lineHeight: 1.6,
            }}>
              Roadmap reflects current planning and may shift based on
              partner timelines and beta feedback.
              <br />
              <span style={{ color: "rgba(57,255,20,0.3)" }}>
                Last updated: Sprint 44 — March 29, 2026
              </span>
            </div>
          </div>
        )}

        {activeTab === "community" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 className="rm-section-title" style={{
                fontSize: 20, fontWeight: 900, letterSpacing: "0.06em",
                textTransform: "uppercase", margin: 0,
              }}>
                COMMUNITY <span style={{ color: "#39FF14" }}>PULSE</span>
              </h2>
              <p style={{
                fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4,
              }}>
                Approved beta feedback — live status from our sprint pipeline
              </p>
            </div>
            <TicketBoard tickets={tickets} tier={tier} user={user} />
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{
        borderTop: "1px solid #2C2C2C",
        padding: "24px", textAlign: "center",
      }}>
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          marginBottom: 8,
        }}>
          <img src={OGA_LOGO} alt="OGA" style={{ height: 22, opacity: 0.15 }} />
        </div>
        <div style={{
          fontSize: 9, color: "rgba(255,255,255,0.08)",
          letterSpacing: "0.06em",
        }}>
          ONE EARTH RISING P.B.C. — THE INFRASTRUCTURE FOR THE NEXT ERA OF GAMING
        </div>
        {dataSource === "live" && (
          <div style={{
            fontSize: 8, color: "rgba(57,255,20,0.25)",
            marginTop: 6, letterSpacing: "0.06em",
          }}>● LIVE DATA</div>
        )}
      </footer>
    </div>
  );
}