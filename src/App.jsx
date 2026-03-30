import { useState, useEffect, useRef, useCallback } from "react";

const OGA_LOGO = "https://jmbzrbteizvuqwukojzu.supabase.co/storage/v1/object/public/oga-files/oga_logo.png";

// ─── SUPABASE CONFIG ────────────────────────────────────────────
const SUPABASE_URL = "https://jmbzrbteizvuqwukojzu.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYnpyYnRlaXp2dXF3dWtvanp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzgwOTIsImV4cCI6MjA4Njg1NDA5Mn0.Gqu3FeNnhU0X58skdhhX4woSqpk5jVd_mJ2ELxT5bGg";

async function supabaseRpc(fnName, params = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`RPC ${fnName}: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`Supabase RPC failed: ${fnName}`, e);
    return null;
  }
}

// ─── PHASE DISPLAY CONFIG (metadata not stored in DB) ───────────
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

function buildTicketsFromDB(rows) {
  return rows.map(t => ({
    id: `TW-${t.teamwork_ticket_id}`,
    title: t.title,
    status: t.status,
    priority: t.priority || "medium",
    votes: t.vote_count || 0,
    date: new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    category: t.category || "other",
    vis: t.visibility || "public",
  }));
}

// ─── ACCESS TIER SYSTEM ──────────────────────────────────────────
// Passcode hash: simple hash for client-side check
// In production, replace with a server-side check or Supabase RPC
const INVESTOR_HASH = "oer2026inv"; // Change this to your real passcode

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
  { id: "TW-142", title: "Trade notification doesn't show character name", status: "published", priority: "high", votes: 4, date: "Mar 27", category: "bug", vis: "public" },
  { id: "TW-139", title: "QR scanner freezes on Android Chrome", status: "in_production", priority: "medium", votes: 2, date: "Mar 26", category: "bug", vis: "public" },
  { id: "TW-136", title: "Add counter-offer option to trade proposals", status: "in_review", priority: "medium", votes: 7, date: "Mar 25", category: "feature", vis: "public" },
  { id: "TW-134", title: "Share button not working on mobile Safari", status: "published", priority: "high", votes: 3, date: "Mar 24", category: "bug", vis: "public" },
  { id: "TW-131", title: "Native camera for QR scan on mobile", status: "backlog", priority: "low", votes: 5, date: "Mar 23", category: "feature", vis: "public" },
  { id: "TW-128", title: "Settings changes don't persist after refresh", status: "published", priority: "high", votes: 1, date: "Mar 22", category: "bug", vis: "public" },
  { id: "TW-125", title: "Dark mode toggle in settings", status: "backlog", priority: "low", votes: 8, date: "Mar 21", category: "feature", vis: "public" },
  { id: "TW-122", title: "Lend flow timeout error after 30 seconds", status: "in_review", priority: "high", votes: 3, date: "Mar 20", category: "bug", vis: "public" },
  // Investor-only tickets
  { id: "TW-145", title: "Xsolla Backpack OAuth handshake failing on redirect", status: "in_review", priority: "high", votes: 0, date: "Mar 28", category: "bug", vis: "investor" },
  // Internal-only tickets
  { id: "TW-148", title: "Ed demo environment: hide blockchain references", status: "in_production", priority: "high", votes: 0, date: "Mar 29", category: "feature", vis: "internal" },
  { id: "TW-147", title: "Seed Valiant characters for Royalty Machine test", status: "backlog", priority: "medium", votes: 0, date: "Mar 29", category: "feature", vis: "internal" },
];

// ─── PASSCODE MODAL ────────────────────────────────────────────
const PasscodeModal = ({ onSuccess, onClose }) => {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (code === INVESTOR_HASH) {
      try { window.localStorage.setItem("oga_roadmap_tier", "investor"); } catch (e) { }
      onSuccess("investor");
    } else {
      setError(true);
      setTimeout(() => setError(false), 1500);
      setCode("");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#121212", border: "1px solid #2C2C2C",
        borderRadius: 16, padding: "32px 28px", maxWidth: 360, width: "100%",
        position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 14,
          background: "none", border: "none", color: "rgba(255,255,255,0.3)",
          fontSize: 18, cursor: "pointer", padding: 4,
        }}>✕</button>

        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "#FFA500", marginBottom: 6, textTransform: "uppercase",
        }}>INVESTOR ACCESS</div>

        <div style={{
          fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4,
        }}>Enter your access code</div>

        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 20, lineHeight: 1.5,
        }}>
          This unlocks partner details, strategic milestones, and confidential roadmap items.
        </div>

        <input
          ref={inputRef}
          type="password"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="Access code"
          style={{
            width: "100%", padding: "10px 14px",
            background: "#0A0A0A",
            border: `1px solid ${error ? "#FF4444" : "#2C2C2C"}`,
            borderRadius: 8, color: "#fff", fontSize: 14,
            outline: "none", transition: "border-color 0.2s ease",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{
            fontSize: 11, color: "#FF4444", marginTop: 6,
          }}>Invalid code. Please try again.</div>
        )}

        <button onClick={handleSubmit} style={{
          width: "100%", marginTop: 14, padding: "10px 0",
          background: "#FFA500", color: "#000",
          border: "none", borderRadius: 8,
          fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
          cursor: "pointer", textTransform: "uppercase",
        }}>
          UNLOCK
        </button>
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
    <div style={{
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

      <div style={{
        margin: "0 24px 14px", height: 3,
        background: "#2C2C2C", borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 2, background: "#39FF14",
          width: `${pct}%`, transition: "width 1.5s ease",
          boxShadow: "0 0 10px rgba(57,255,20,0.4)",
        }} />
      </div>

      {/* Phase nodes — extra padding to prevent cutoff */}
      <div style={{
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
                onClick={() => onPhaseClick(phase.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  cursor: "pointer", minWidth: 44, position: "relative", zIndex: 2,
                }}
              >
                <div style={{
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
                  <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    color: isSelected ? "#fff" : isComplete || isActive ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.25)",
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>{phase.title}</div>
                  <div style={{
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
        <div style={{
          fontSize: 38, fontWeight: 900, lineHeight: 1,
          color: isComplete || isActive ? "#39FF14" : "#2C2C2C",
          opacity: isComplete ? 0.25 : isActive ? 0.7 : 0.45,
          minWidth: 48, textAlign: "center",
        }}>{phase.phase}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <h3 style={{
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
              <div key={i} style={{
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
const TicketBoard = ({ tickets, tier }) => {
  const [filter, setFilter] = useState("all");
  const statusOrder = ["in_production", "in_review", "backlog", "published"];

  const visible = tickets.filter(t => canSee(t.vis, tier));
  const filtered = visible
    .filter(t => filter === "all" || t.status === filter)
    .sort((a, b) => {
      const ai = statusOrder.indexOf(a.status);
      const bi = statusOrder.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return b.votes - a.votes;
    });

  const counts = Object.fromEntries(
    Object.keys(TICKET_STATUSES).map(s => [s, visible.filter(t => t.status === s).length])
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={{
          background: filter === "all" ? "rgba(255,255,255,0.08)" : "transparent",
          color: filter === "all" ? "#fff" : "rgba(255,255,255,0.35)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "5px 12px", borderRadius: 20,
          fontSize: 11, fontWeight: 600, cursor: "pointer",
        }}>ALL {visible.length}</button>
        {statusOrder.map(s => {
          const cfg = TICKET_STATUSES[s];
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: filter === s ? cfg.bg : "transparent",
              color: filter === s ? cfg.color : "rgba(255,255,255,0.3)",
              border: `1px solid ${filter === s ? cfg.color + "33" : "rgba(255,255,255,0.05)"}`,
              padding: "5px 12px", borderRadius: 20,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>{cfg.label} {counts[s] || 0}</button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map((ticket) => {
          const cfg = TICKET_STATUSES[ticket.status];
          return (
            <div key={ticket.id} style={{
              background: "#121212", border: "1px solid #2C2C2C",
              borderRadius: 12, padding: "12px 16px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: ticket.priority === "high" ? "#FF4444"
                  : ticket.priority === "medium" ? "#FFA500" : "#4488FF",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {ticket.title}
                  <VisIndicator vis={ticket.vis} />
                </div>
                <div style={{
                  fontSize: 9, color: "rgba(255,255,255,0.22)",
                  marginTop: 3, display: "flex", gap: 7, alignItems: "center",
                }}>
                  <code style={{ fontFamily: "monospace", fontSize: 9 }}>{ticket.id}</code>
                  <span>·</span>
                  <span>{ticket.date}</span>
                  <span>·</span>
                  <span style={{
                    background: ticket.category === "bug" ? "rgba(255,68,68,0.1)" : "rgba(68,136,255,0.1)",
                    color: ticket.category === "bug" ? "#FF4444" : "#4488FF",
                    padding: "0 5px", borderRadius: 3, fontSize: 8,
                    fontWeight: 600, textTransform: "uppercase",
                  }}>{ticket.category}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28 }}>
                <span style={{ fontSize: 10, color: "rgba(57,255,20,0.45)" }}>▲</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>{ticket.votes}</span>
              </div>
              <span style={{
                background: cfg.bg, color: cfg.color,
                padding: "3px 8px", borderRadius: 4,
                fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>{cfg.label}</span>
            </div>
          );
        })}
      </div>

      <div style={{
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
        Submit feedback from the OGA app → our team reviews and approves
        tickets for public visibility → approved tickets appear here with
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
  const [showPasscode, setShowPasscode] = useState(false);
  const [phases, setPhases] = useState(FALLBACK_PHASES);
  const [tickets, setTickets] = useState(FALLBACK_TICKETS);
  const [dataSource, setDataSource] = useState("local"); // "local" or "live"

  // Fetch data from Supabase based on current tier
  const fetchLiveData = useCallback(async (visTier) => {
    const milestones = await supabaseRpc("get_roadmap_milestones", { p_visibility: visTier });
    if (milestones && milestones.length > 0) {
      setPhases(buildPhasesFromDB(milestones));
      setDataSource("live");
      console.log(`Roadmap: loaded ${milestones.length} milestones (${visTier} tier)`);
    }

    const ticketRows = await supabaseRpc("get_public_tickets", {
      p_visibility: visTier, p_status: null, p_limit: 50
    });
    if (ticketRows && ticketRows.length > 0) {
      setTickets(buildTicketsFromDB(ticketRows));
    }
  }, []);

  // Check for saved tier on mount + fetch live data
  useEffect(() => {
    let initialTier = "public";
    try {
      const saved = window.localStorage.getItem("oga_roadmap_tier");
      if (saved === "investor") initialTier = "investor";
    } catch (e) { }
    const params = new URLSearchParams(window.location.search);
    const code = params.get("access");
    if (code === INVESTOR_HASH) {
      initialTier = "investor";
      try { window.localStorage.setItem("oga_roadmap_tier", "investor"); } catch (e) { }
    }
    setTier(initialTier);
    fetchLiveData(initialTier);
  }, [fetchLiveData]);

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

  const handleTierChange = (newTier) => {
    setTier(newTier);
    setShowPasscode(false);
    fetchLiveData(newTier); // Re-fetch with new visibility
  };

  const handleLockClick = () => {
    if (tier === "investor") {
      setTier("public");
      try { window.localStorage.removeItem("oga_roadmap_tier"); } catch (e) { }
      fetchLiveData("public"); // Re-fetch public only
    } else {
      setShowPasscode(true);
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
      `}</style>

      {showPasscode && (
        <PasscodeModal
          onSuccess={handleTierChange}
          onClose={() => setShowPasscode(false)}
        />
      )}

      {/* HEADER */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid #2C2C2C",
        padding: "12px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={OGA_LOGO} alt="OGA" style={{ height: 28 }} />
          <span style={{
            fontSize: 10, color: "rgba(255,255,255,0.28)",
            letterSpacing: "0.1em",
          }}>ROADMAP</span>
          <TierBadge tier={tier} onClick={handleLockClick} />
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[
            { key: "roadmap", label: "MILESTONES" },
            { key: "community", label: "COMMUNITY" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              background: activeTab === tab.key ? "rgba(57,255,20,0.1)" : "transparent",
              color: activeTab === tab.key ? "#39FF14" : "rgba(255,255,255,0.4)",
              border: "none", padding: "6px 14px", borderRadius: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              cursor: "pointer",
            }}>{tab.label}</button>
          ))}
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
      <main style={{ maxWidth: 740, margin: "0 auto", padding: "24px 24px 64px" }}>
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
              <h2 style={{
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
            <TicketBoard tickets={tickets} tier={tier} />
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{
        borderTop: "1px solid #2C2C2C",
        padding: "24px", textAlign: "center",
      }}>
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
          marginBottom: 8,
        }}>
          <img src={OGA_LOGO} alt="OGA" style={{ height: 22, opacity: 0.15 }} />

          {/* Lock icon — investor access trigger */}
          <button
            onClick={handleLockClick}
            title={tier === "public" ? "Investor access" : "Lock view"}
            style={{
              background: "none", border: "none",
              color: tier === "investor" ? "#FFA500" : "rgba(255,255,255,0.08)",
              fontSize: 14, cursor: "pointer", padding: "2px 6px",
              borderRadius: 4, transition: "color 0.2s ease",
            }}
          >
            {tier === "investor" ? "◉" : "◎"}
          </button>
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