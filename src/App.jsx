import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, rpc } from "./supabase.js";

const OGA_LOGO = "https://jmbzrbteizvuqwukojzu.supabase.co/storage/v1/object/public/oga-files/oga_logo.png";

// ─── ACCESS TIER SYSTEM ──────────────────────────────────────────
const ACCESS_TIERS = {
  public: { level: 0, label: "PUBLIC", color: "#39FF14" },
  partner: { level: 1, label: "PARTNER", color: "#4FC3F7" },
  investor: { level: 1, label: "INVESTOR", color: "#FFA500" },
  internal: { level: 3, label: "INTERNAL", color: "#8B5CF6" },
};

function canSee(itemVis, currentTier) {
  if (itemVis === "public") return true;
  if (currentTier === "internal") return true;
  if (itemVis === "partner" && currentTier === "partner") return true;
  if (itemVis === "investor" && currentTier === "investor") return true;
  return false;
}

function getCurrentQuarterId() {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q}-${d.getFullYear()}`;
}

// cleanTicketTitle removed — community tasks use public_label or title directly

function buildCommunityTasks(rows) {
  return rows.map(t => ({
    id: t.teamwork_task_id ? `TW-${t.teamwork_task_id}` : t.id,
    dbId: t.id,
    title: t.title,
    status: t.status === "complete" ? "published" : t.status === "in_progress" ? "in_production" : t.status === "in_review" ? "in_review" : "backlog",
    priority: t.priority || "medium",
    votes: t.vote_count || 0,
    date: new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    category: t.category || "feature",
    source: t.source || "user_app",
    vis: t.visibility || "internal",
  }));
}

// ─── TICKET STATUSES ────────────────────────────────────────────
const TICKET_STATUSES = {
  backlog: { label: "BACKLOG", color: "#666666", bg: "rgba(102,102,102,0.15)" },
  in_review: { label: "IN REVIEW", color: "#FFA500", bg: "rgba(255,165,0,0.12)" },
  in_production: { label: "IN PRODUCTION", color: "#4488FF", bg: "rgba(68,136,255,0.12)" },
  published: { label: "PUBLISHED", color: "#39FF14", bg: "rgba(57,255,20,0.12)" },
};

// ─── FALLBACK QUARTER DATA ──────────────────────────────────────
// Hardcoded to match Teamwork import. Once sprint_tasks are populated
// with target:Q* tags and flowing through n8n, this switches to live data.
const FALLBACK_QUARTERS = [
  {
    id: "Q1-2026", label: "Q1", year: "2026",
    tasks: [
      { name: "Trading System", done: true, vis: "public" },
      { name: "Lending System", done: true, vis: "public" },
      { name: "Character Detail Screen", done: true, vis: "public" },
      { name: "Notification System", done: true, vis: "public" },
      { name: "Public Profiles & Privacy", done: true, vis: "public" },
      { name: "QR Verification System", done: true, vis: "public", milestone: true },
      { name: "Beta Version Launched", done: true, vis: "public", milestone: true },
    ],
  },
  {
    id: "Q2-2026", label: "Q2", year: "2026",
    tasks: [
      { name: "U.S. Patent Granted", done: true, vis: "public", milestone: true },
      { name: "Portal Pass Builder", done: true, vis: "public" },
      { name: "Community Voting", done: true, vis: "public" },
      { name: "Game Variations Manager", done: true, vis: "public" },
      { name: "Portal Pass Campaigns", done: false, vis: "public" },
      { name: "Trade Counteroffers", done: false, vis: "public" },
      { name: "Native Camera QR Scan", done: false, vis: "public" },
      { name: "Scoped Invite Tokens", done: false, vis: "public" },
      { name: "Enhanced Friend System", done: false, vis: "public" },
      { name: "Xsolla OAuth Bridge", done: false, vis: "investor" },
      { name: "Portal Pass API Endpoints", done: false, vis: "investor" },
      { name: "Ed / Shurick Budget Gate", done: false, vis: "investor", milestone: true },
    ],
  },
  {
    id: "Q3-2026", label: "Q3", year: "2026",
    tasks: [
      { name: "Gamescom 2026 Live", done: false, vis: "public", milestone: true },
      { name: "Cross-Game Connections", done: false, vis: "public" },
      { name: "OGA Marketplace", done: false, vis: "public" },
      { name: "Factions — Community Identity", done: false, vis: "public" },
      { name: "Ambassador Tiers", done: false, vis: "public" },
      { name: "Full Lending Trust Ladder", done: false, vis: "public" },
      { name: "Creator Analytics Dashboard", done: false, vis: "public" },
      { name: "Soneium On-Chain Settlement", done: false, vis: "investor" },
      { name: "Xsolla Backpack Activation", done: false, vis: "investor" },
      { name: "NFC Ambassador Cards", done: false, vis: "investor" },
    ],
  },
  {
    id: "Q4-2026", label: "Q4", year: "2026",
    tasks: [
      { name: "Royalty Machine Pilot", done: false, vis: "public", milestone: true },
      { name: "Automated Royalty Distribution", done: false, vis: "public" },
      { name: "The Portal — AI Transfers", done: false, vis: "public" },
      { name: "Progressive KYC System", done: false, vis: "public" },
    ],
  },
  {
    id: "Q1-2027", label: "Q1", year: "2027",
    tasks: [
      { name: "Multi-Game Deployment", done: false, vis: "public" },
      { name: "Conference Series Expansion", done: false, vis: "public", milestone: true },
      { name: "IP Licensing Marketplace", done: false, vis: "public" },
    ],
  },
];

const FALLBACK_TICKETS = [];

// ─── SMALL COMPONENTS ───────────────────────────────────────────

function Check({ done, s = 18 }) {
  if (done) return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="9" fill="rgba(57,255,20,0.12)" stroke="#39FF14" strokeWidth="1.5" />
      <path d="M6 10.5L8.5 13L14 7.5" stroke="#39FF14" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="10" cy="10" r="9" stroke="#39FF14" strokeWidth="1.2" strokeOpacity="0.3" />
    </svg>
  );
}

function MilestoneBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.18)",
      borderRadius: 4, padding: "1px 6px 1px 4px",
      fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
      color: "#39FF14", textTransform: "uppercase", flexShrink: 0, whiteSpace: "nowrap",
    }}>
      <svg width="7" height="7" viewBox="0 0 10 10" fill="#39FF14">
        <path d="M5 0l1.12 3.44H9.9L6.89 5.56l1.12 3.44L5 6.88 2 9l1.12-3.44L0.1 3.44h3.78z" />
      </svg>
      MILESTONE
    </span>
  );
}

function CatBadge({ cat }) {
  const isUx = cat === "ux" || cat === "ux/ui";
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      padding: "2px 6px", borderRadius: 3, flexShrink: 0,
      background: isUx ? "rgba(160,100,255,0.12)" : "rgba(68,136,255,0.12)",
      color: isUx ? "#A064FF" : "#4488FF",
      border: `1px solid ${isUx ? "rgba(160,100,255,0.2)" : "rgba(68,136,255,0.2)"}`,
    }}>{cat}</span>
  );
}

function VisIndicator({ vis }) {
  if (vis === "public") return null;
  const c = vis === "partner" ? "#4FC3F7" : vis === "investor" ? "#FFA500" : "#8B5CF6";
  return <span title={`${vis} only`} style={{
    width: 6, height: 6, borderRadius: "50%", background: c, opacity: 0.6,
    flexShrink: 0, display: "inline-block",
  }} />;
}

// ─── ACCESS MODAL ───────────────────────────────────────────────
const AccessModal = ({ onClose }) => {
  const [mode, setMode] = useState("request");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [firm, setFirm] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  const handleRequest = async () => {
    if (!email.trim() || !fullName.trim()) { setMessage({ type: "error", text: "Name and email are required." }); return; }
    setLoading(true); setMessage(null);
    const result = await rpc("request_roadmap_access", { p_email: email.trim(), p_full_name: fullName.trim(), p_firm: firm.trim() || null });
    setLoading(false);
    if (result) {
      if (result.status === "submitted" || result.status === "already_pending") setMessage({ type: "success", text: result.message });
      else if (result.status === "already_approved") { setMessage({ type: "info", text: result.message }); setMode("signin"); }
      else setMessage({ type: "error", text: result.message });
    } else setMessage({ type: "error", text: "Something went wrong. Please try again." });
  };

  const handleSendCode = async () => {
    if (!email.trim()) { setMessage({ type: "error", text: "Please enter your email." }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);
    if (error) setMessage({ type: "error", text: error.message });
    else { setMode("verify"); setMessage({ type: "success", text: "An 8-digit code has been sent to your email." }); }
  };

  const handleVerifyCode = async () => {
    if (!otpCode.trim() || otpCode.trim().length < 8) { setMessage({ type: "error", text: "Please enter the 8-digit code." }); return; }
    setLoading(true); setMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otpCode.trim(), type: "email" });
    setLoading(false);
    if (error) { setMessage({ type: "error", text: "Invalid or expired code. Please try again." }); setOtpCode(""); }
  };

  const msgColors = { success: "#39FF14", error: "#FF4444", info: "#FFA500" };
  const inputStyle = {
    width: "100%", padding: "10px 14px", background: "#0A0A0A",
    border: "1px solid #2C2C2C", borderRadius: 8, color: "#fff",
    fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24,
    }} onClick={onClose}>
      <div className="rm-access-modal" onClick={e => e.stopPropagation()} style={{
        background: "#121212", border: "1px solid #2C2C2C", borderRadius: 16,
        padding: "28px 24px", maxWidth: 380, width: "100%", position: "relative",
      }}>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 14, background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer" }}>✕</button>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#FFA500", marginBottom: 12, textTransform: "uppercase" }}>INVESTOR ACCESS</div>
        <div style={{ display: "flex", gap: 2, marginBottom: 18, background: "#0A0A0A", borderRadius: 8, padding: 3 }}>
          {[{ key: "request", label: "Request access" }, { key: "signin", label: "Sign in" }].map(t => (
            <button key={t.key} onClick={() => { setMode(t.key); setMessage(null); setOtpCode(""); }} style={{
              flex: 1, padding: "7px 0", borderRadius: 6,
              background: (mode === t.key || (mode === "verify" && t.key === "signin")) ? "#2C2C2C" : "transparent",
              color: (mode === t.key || (mode === "verify" && t.key === "signin")) ? "#fff" : "rgba(255,255,255,0.35)",
              border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {mode === "request" && (<>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>Request access to see partner details, strategic milestones, and confidential roadmap data.</div>
          <div style={{ fontSize: 10, color: "rgba(255,165,0,0.5)", marginBottom: 10, lineHeight: 1.4 }}>Please use your professional email for faster verification.</div>
          <input ref={inputRef} value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name *" style={inputStyle} />
          <input value={firm} onChange={e => setFirm(e.target.value)} placeholder="Firm or company (optional)" style={inputStyle} />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleRequest()} placeholder="Email address *" style={inputStyle} />
          <button onClick={handleRequest} disabled={loading} style={{ width: "100%", padding: "10px 0", marginTop: 4, background: loading ? "#555" : "#FFA500", color: "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", cursor: loading ? "default" : "pointer", textTransform: "uppercase" }}>{loading ? "SUBMITTING..." : "REQUEST ACCESS"}</button>
        </>)}

        {mode === "signin" && (<>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>Enter the email you registered with. We'll send an 8-digit verification code.</div>
          <input ref={inputRef} type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendCode()} placeholder="Email address" style={inputStyle} />
          <button onClick={handleSendCode} disabled={loading} style={{ width: "100%", padding: "10px 0", marginTop: 4, background: loading ? "#555" : "#39FF14", color: "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", cursor: loading ? "default" : "pointer", textTransform: "uppercase" }}>{loading ? "SENDING..." : "SEND CODE"}</button>
        </>)}

        {mode === "verify" && (<>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 14, lineHeight: 1.5 }}>Enter the 8-digit code sent to <span style={{ color: "#fff" }}>{email}</span></div>
          <input ref={inputRef} type="text" inputMode="numeric" maxLength={8} value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && handleVerifyCode()} placeholder="00000000" style={{ ...inputStyle, textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: "0.3em", fontFamily: "monospace" }} />
          <button onClick={handleVerifyCode} disabled={loading} style={{ width: "100%", padding: "10px 0", marginTop: 4, background: loading ? "#555" : "#39FF14", color: "#000", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", textTransform: "uppercase" }}>{loading ? "VERIFYING..." : "VERIFY"}</button>
          <button onClick={() => { setMode("signin"); setMessage(null); setOtpCode(""); }} style={{ width: "100%", padding: "8px 0", marginTop: 6, background: "transparent", color: "rgba(255,255,255,0.35)", border: "none", fontSize: 11, cursor: "pointer" }}>Didn't receive it? Go back</button>
        </>)}

        {message && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: `${msgColors[message.type]}10`, border: `1px solid ${msgColors[message.type]}30`, borderRadius: 8, fontSize: 12, color: msgColors[message.type], lineHeight: 1.5 }}>{message.text}</div>
        )}
      </div>
    </div>
  );
};

// ─── QUARTER CARD ───────────────────────────────────────────────
const CARD_W = 320;
const GAP = 20;
const COLLAPSE_THRESHOLD = 12;  // cards with > this many tasks collapse by default
const COLLAPSED_VISIBLE = 8;   // show this many when collapsed (must be < threshold)

function QuarterCard({ q, active, mobile, tier }) {
  const tasks = q.tasks.filter(t => canSee(t.vis, tier));
  const cur = q.status === "current";
  const done = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const lbl = q.status === "completed" ? "COMPLETED" : cur ? "CURRENT" : "PLANNED";

  // Collapse logic. Cards over the threshold start collapsed.
  // Milestones are pinned to the top of the visible set — they're load-bearing
  // for investor scanning and should never hide behind a "show more" click.
  const shouldCollapse = total > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);

  const visibleTasks = (() => {
    if (!shouldCollapse || expanded) return tasks;
    // Hard cap at COLLAPSED_VISIBLE total. Milestones get priority for the
    // visible slots but don't get to overflow the budget — otherwise cards
    // with lots of milestones (like Q2) stay tall even when "collapsed".
    const milestones = tasks.filter(t => t.milestone);
    const nonMilestones = tasks.filter(t => !t.milestone);
    const visibleMilestones = milestones.slice(0, COLLAPSED_VISIBLE);
    const remainingSlots = Math.max(0, COLLAPSED_VISIBLE - visibleMilestones.length);
    return [...visibleMilestones, ...nonMilestones.slice(0, remainingSlots)];
  })();
  const hiddenCount = tasks.length - visibleTasks.length;

  return (
    <div style={{
      width: mobile ? "100%" : CARD_W, minWidth: mobile ? 0 : CARD_W, flexShrink: 0,
      background: "#0A0A0A", borderRadius: 14,
      border: cur ? "1.5px solid #39FF14" : "1px solid #1E1E1E",
      boxShadow: cur ? "0 0 28px rgba(57,255,20,0.1), 0 0 56px rgba(57,255,20,0.03)" : "none",
      overflow: "hidden",
      transition: "transform 0.35s cubic-bezier(.22,1,.36,1), opacity 0.35s ease",
      transform: mobile ? "none" : active ? "scale(1)" : "scale(0.92)",
      opacity: mobile ? 1 : active ? 1 : 0.5,
    }}>
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: q.status !== "planned" ? "#39FF14" : "rgba(255,255,255,0.25)" }}>{lbl}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>{done}/{total}</span>
        </div>
        <div style={{ marginTop: 7, height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 1 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#39FF14", borderRadius: 1, transition: "width .5s ease" }} />
        </div>
      </div>
      <div style={{ display: "flex", padding: "14px 0 16px" }}>
        <div style={{ width: 56, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2, userSelect: "none" }}>
          <span style={{ fontSize: 30, fontWeight: 900, color: "#39FF14", lineHeight: 1, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>{q.label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1, color: "rgba(57,255,20,0.35)", marginTop: 3, letterSpacing: "0.03em", fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>{q.year}</span>
        </div>
        <div style={{ flex: 1, paddingRight: 14, display: "flex", flexDirection: "column", gap: 2 }}>
          {visibleTasks.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 26 }}>
              <Check done={t.done} s={16} />
              <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.25, flex: 1, minWidth: 0, color: t.done ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.38)" }}>{t.name}</span>
              {t.milestone && <MilestoneBadge />}
              <VisIndicator vis={t.vis} />
            </div>
          ))}
          {shouldCollapse && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              style={{
                marginTop: 6, padding: "6px 10px",
                background: "rgba(57,255,20,0.04)",
                border: "1px solid rgba(57,255,20,0.12)",
                borderRadius: 6,
                color: "#39FF14",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "background 0.2s ease, border-color 0.2s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "rgba(57,255,20,0.08)";
                e.currentTarget.style.borderColor = "rgba(57,255,20,0.2)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(57,255,20,0.04)";
                e.currentTarget.style.borderColor = "rgba(57,255,20,0.12)";
              }}
            >
              {expanded
                ? <>SHOW LESS <span style={{ fontSize: 8 }}>▲</span></>
                : <>SHOW {hiddenCount} MORE <span style={{ fontSize: 8 }}>▼</span></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── COMMUNITY VOTING ───────────────────────────────────────────
const CommunityVoting = ({ tickets, tier, user, mobile }) => {
  const [votedIds, setVotedIds] = useState(new Set());
  const [localVotes, setLocalVotes] = useState({});
  const [voteLoginId, setVoteLoginId] = useState(null);
  const [voteEmail, setVoteEmail] = useState("");
  const [voteCode, setVoteCode] = useState("");
  const [voteStep, setVoteStep] = useState("email");
  const [voteLoading, setVoteLoading] = useState(false);
  const [voteMsg, setVoteMsg] = useState(null);
  const [section, setSection] = useState("user_app");

  const handleVote = async (ticket, e) => {
    e.stopPropagation();
    if (!user) {
      setVoteLoginId(voteLoginId === ticket.id ? null : ticket.id);
      setVoteStep("email"); setVoteMsg(null); setVoteEmail(""); setVoteCode("");
      return;
    }
    if (!ticket.dbId || votedIds.has(ticket.id)) return;
    const newCount = (localVotes[ticket.id] || ticket.votes) + 1;
    setVotedIds(prev => new Set([...prev, ticket.id]));
    setLocalVotes(prev => ({ ...prev, [ticket.id]: newCount }));
    rpc("vote_community_task", { p_task_id: ticket.dbId });
    // Sync to Teamwork if this task has a TW ID
    if (ticket.id.startsWith("TW-")) {
      const twId = ticket.id.replace("TW-", "");
      fetch("https://oer.app.n8n.cloud/webhook/vote-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamwork_id: twId, vote_count: newCount }),
      }).catch(() => { });
    }
  };

  const handleVoteSendCode = async (e) => {
    e.stopPropagation();
    if (!voteEmail.trim()) return;
    setVoteLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: voteEmail.trim() });
    setVoteLoading(false);
    if (error) setVoteMsg("Could not send code. Try again.");
    else { setVoteStep("code"); setVoteMsg("Check your email for the 8-digit code."); }
  };

  const handleVoteVerify = async (e) => {
    e.stopPropagation();
    if (!voteCode.trim() || voteCode.length < 8) return;
    setVoteLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email: voteEmail.trim(), token: voteCode.trim(), type: "email" });
    setVoteLoading(false);
    if (error) { setVoteMsg("Invalid or expired code."); setVoteCode(""); }
  };

  const visible = tickets.filter(t => canSee(t.vis, tier) && t.category !== "bug");
  const sectionTickets = visible.filter(t => t.source === section).sort((a, b) => (localVotes[b.id] ?? b.votes) - (localVotes[a.id] ?? a.votes));
  const px = mobile ? 16 : 32;

  const VoteLoginInline = ({ ticketId }) => {
    if (user || voteLoginId !== ticketId) return null;
    return (
      <div onClick={e => e.stopPropagation()} style={{
        marginTop: -4, marginBottom: 6, padding: "10px 12px",
        background: "#0A0A0A", border: "1px solid #2C2C2C",
        borderTop: "none", borderRadius: "0 0 12px 12px",
      }}>
        {voteStep === "email" ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="email" value={voteEmail} onChange={e => setVoteEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleVoteSendCode(e)} placeholder="Your existing OGA email" onClick={e => e.stopPropagation()} autoFocus style={{ flex: 1, padding: "6px 10px", background: "#121212", border: "1px solid #2C2C2C", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none" }} />
            <button onClick={handleVoteSendCode} disabled={voteLoading} style={{ padding: "6px 12px", background: voteLoading ? "#555" : "#39FF14", color: "#000", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{voteLoading ? "..." : "SEND CODE"}</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" inputMode="numeric" maxLength={8} value={voteCode} onChange={e => setVoteCode(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && handleVoteVerify(e)} placeholder="8-digit code" onClick={e => e.stopPropagation()} autoFocus style={{ flex: 1, padding: "6px 10px", background: "#121212", border: "1px solid #2C2C2C", borderRadius: 6, color: "#fff", fontSize: 14, fontFamily: "monospace", letterSpacing: "0.15em", outline: "none", textAlign: "center" }} />
            <button onClick={handleVoteVerify} disabled={voteLoading} style={{ padding: "6px 12px", background: voteLoading ? "#555" : "#39FF14", color: "#000", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{voteLoading ? "..." : "VERIFY"}</button>
          </div>
        )}
        {voteMsg && <div style={{ marginTop: 6, fontSize: 10, color: voteMsg.includes("Check") ? "#39FF14" : "#FF4444" }}>{voteMsg}</div>}
        <div style={{ marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.2)" }}>Sign in with your existing OGA account email to vote</div>
      </div>
    );
  };

  return (
    <div style={{ padding: `0 ${px}px 40px` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#39FF14", textTransform: "uppercase" }}>COMMUNITY VOICE</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Vote on what we build next</span>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
        {[["user_app", "User App"], ["creator_portal", "Creator Portal"]].map(([k, l]) => (
          <button key={k} onClick={() => setSection(k)} style={{
            padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
            background: section === k ? "rgba(57,255,20,0.1)" : "rgba(255,255,255,0.03)",
            color: section === k ? "#39FF14" : "rgba(255,255,255,0.35)",
          }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sectionTickets.map(ticket => {
          const cfg = TICKET_STATUSES[ticket.status] || TICKET_STATUSES.backlog;
          return (
            <div key={ticket.id}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 8,
                background: "#0A0A0A", border: "1px solid #1E1E1E",
              }}>
                <button onClick={(e) => handleVote(ticket, e)} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                  background: "none", border: "none", cursor: "pointer", padding: 0, minWidth: 32,
                }}>
                  <svg width="14" height="8" viewBox="0 0 14 8">
                    <path d="M1 7L7 1L13 7" stroke={votedIds.has(ticket.id) ? "#39FF14" : "rgba(255,255,255,0.25)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: votedIds.has(ticket.id) ? "#39FF14" : "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{localVotes[ticket.id] ?? ticket.votes}</span>
                </button>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)", lineHeight: 1.3, minWidth: 0 }}>{ticket.title}</span>
                <VisIndicator vis={ticket.vis} />
                <CatBadge cat={ticket.category} />
                <span style={{ background: cfg.bg, color: cfg.color, padding: "2px 7px", borderRadius: 4, fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap", flexShrink: 0 }}>{cfg.label}</span>
              </div>
              <VoteLoginInline ticketId={ticket.id} />
            </div>
          );
        })}
        {sectionTickets.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>No feature requests yet</div>
        )}
      </div>
      <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(57,255,20,0.03)", border: "1px solid rgba(57,255,20,0.06)", borderRadius: 10, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
        <span style={{ color: "#39FF14", fontWeight: 700, fontSize: 9, letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>HOW THIS WORKS</span>
        Submit feedback from the OGA app → our team reviews feature requests for public visibility → approved requests appear here. Vote to influence sprint priority.
      </div>
    </div>
  );
};

// ─── MAIN APP ───────────────────────────────────────────────────
export default function OGARoadmap() {
  const scrollRef = useRef(null);
  const [quarters, setQuarters] = useState(FALLBACK_QUARTERS);
  const [tickets, setTickets] = useState(FALLBACK_TICKETS);
  const [currentSprint, setCurrentSprint] = useState(46);
  const [tier, setTier] = useState("public");
  const [user, setUser] = useState(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [mob, setMob] = useState(false);
  const [center, setCenter] = useState(0);

  // Compute quarter statuses
  const currentQId = getCurrentQuarterId();
  const quartersWithStatus = quarters.map(q => {
    const isCurrent = q.id === currentQId;
    const allDone = q.tasks.filter(t => canSee(t.vis, tier)).every(t => t.done);
    const qIdx = quarters.findIndex(qq => qq.id === currentQId);
    const thisIdx = quarters.indexOf(q);
    return { ...q, status: allDone && thisIdx < qIdx ? "completed" : isCurrent ? "current" : thisIdx < qIdx ? "completed" : "planned" };
  });
  const curIdx = quartersWithStatus.findIndex(q => q.status === "current");

  // Responsive
  useEffect(() => {
    const f = () => setMob(window.innerWidth < 640);
    f(); window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // Initialize center to current quarter
  useEffect(() => { if (curIdx >= 0) setCenter(curIdx); }, [curIdx]);

  // Carousel scrolling
  const go = useCallback((i) => setCenter(Math.max(0, Math.min(quartersWithStatus.length - 1, i))), [quartersWithStatus.length]);

  const scrollToCard = useCallback((idx) => {
    const el = scrollRef.current;
    if (!el || mob) return;
    const card = el.children[idx + 1]; // +1 for spacer
    if (!card) return;
    el.scrollTo({ left: card.offsetLeft - el.offsetWidth / 2 + card.offsetWidth / 2, behavior: "smooth" });
  }, [mob]);

  useEffect(() => { scrollToCard(center); }, [center, scrollToCard]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || mob) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = el.scrollLeft + el.offsetWidth / 2;
        let best = 0, bestD = Infinity;
        Array.from(el.children).forEach((ch, i) => {
          if (i === 0 || i === el.children.length - 1) return;
          const d = Math.abs(ch.offsetLeft + ch.offsetWidth / 2 - mid);
          if (d < bestD) { bestD = d; best = i - 1; }
        });
        setCenter(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [mob]);

  // ── Supabase data fetching ──
  const fetchLiveData = useCallback(async (visTier) => {
    // Fetch quarter data for carousel
    const quarterData = await rpc("get_roadmap_quarters", { p_visibility: visTier });
    if (quarterData && Array.isArray(quarterData) && quarterData.length > 0) {
      setQuarters(quarterData);
      console.log(`Roadmap: loaded ${quarterData.length} quarters (${visTier} tier)`);
    }
    // Fetch community voice tasks
    const communityRows = await rpc("get_community_tasks", { p_visibility: visTier });
    if (communityRows && communityRows.length > 0) setTickets(buildCommunityTasks(communityRows));
    // Fetch sprint number
    const sprintRows = await rpc("get_current_sprint");
    if (sprintRows && sprintRows.sprint_number) setCurrentSprint(sprintRows.sprint_number);
  }, []);

  const checkAccess = useCallback(async () => {
    const result = await rpc("check_roadmap_access");
    if (result) {
      setTier(result.tier || "public");
      fetchLiveData(result.tier || "public");
    }
  }, [fetchLiveData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) checkAccess();
      else fetchLiveData("public");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) { checkAccess(); setShowAccessModal(false); }
      else { setTier("public"); fetchLiveData("public"); }
    });
    return () => subscription.unsubscribe();
  }, [checkAccess, fetchLiveData]);

  const handleLockClick = async () => {
    if (user) {
      await supabase.auth.signOut();
      setUser(null); setTier("public"); fetchLiveData("public");
    } else setShowAccessModal(true);
  };

  // Stats
  const allTasks = quartersWithStatus.flatMap(q => q.tasks.filter(t => canSee(t.vis, tier)));
  const doneCount = allTasks.filter(t => t.done).length;
  const totalCount = allTasks.length;
  const timelineProg = curIdx >= 0 ? ((curIdx + 0.5) / quartersWithStatus.length) * 100 : 0;
  const px = mob ? 16 : 32;

  return (
    <div style={{ minHeight: "100vh", background: "#000", fontFamily: "'Helvetica Neue',Arial,sans-serif", color: "#fff" }}>
      <style>{`
        @keyframes yah { 0%,100%{opacity:1;transform:translateY(0)} 50%{opacity:.45;transform:translateY(-2px)} }
        *::-webkit-scrollbar{display:none}
        * { box-sizing: border-box; }
        body { margin: 0; background: #000; }
        input::placeholder { color: rgba(255,255,255,0.25); }
        @media(max-width:640px){
          .rm-access-modal{padding:20px 16px!important;max-width:340px!important}
        }
      `}</style>

      {showAccessModal && <AccessModal onClose={() => setShowAccessModal(false)} />}

      {/* ── HEADER ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid #1E1E1E", padding: `12px ${px}px`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={OGA_LOGO} alt="OGA" style={{ height: mob ? 22 : 28 }} />
          {!mob && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em" }}>ROADMAP</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {user && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5, padding: "3px 8px",
              borderRadius: 6, background: "rgba(57,255,20,0.06)", border: "1px solid rgba(57,255,20,0.1)",
              maxWidth: mob ? 80 : 140, overflow: "hidden",
            }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(57,255,20,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#39FF14", fontWeight: 700, flexShrink: 0 }}>{(user.email || "?")[0].toUpperCase()}</div>
              {!mob && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</span>}
            </div>
          )}
          <button onClick={handleLockClick} title={user ? `Signed in as ${user.email} — click to sign out` : "Investor access"} style={{
            background: tier === "investor" ? "rgba(255,165,0,0.1)" : tier === "internal" ? "rgba(139,92,246,0.1)" : user ? "rgba(57,255,20,0.06)" : "transparent",
            border: tier !== "public" ? `1px solid ${ACCESS_TIERS[tier]?.color || "#FFA500"}40` : user ? "1px solid rgba(57,255,20,0.15)" : "1px solid transparent",
            color: tier !== "public" ? (ACCESS_TIERS[tier]?.color || "#FFA500") : user ? "rgba(57,255,20,0.6)" : "rgba(255,255,255,0.2)",
            padding: "5px 10px", borderRadius: 6, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="10" height="7" rx="1.5" />
              {user ? <path d="M5 8V5a3 3 0 0 1 6 0" /> : <path d="M5 8V5a3 3 0 0 1 6 0V8" />}
            </svg>
            {user && !mob && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>{tier !== "public" ? ACCESS_TIERS[tier]?.label : "SIGN OUT"}</span>}
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <div style={{ padding: `${mob ? 24 : 32}px ${px}px ${mob ? 16 : 18}px` }}>
        <h1 style={{ fontSize: mob ? 24 : 30, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1, margin: 0, textTransform: "uppercase" }}>
          Building the future of<br /><span style={{ color: "#39FF14" }}>player ownership.</span>
        </h1>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 10, lineHeight: 1.55, maxWidth: 440 }}>
          Track our progress as we build the infrastructure for cross-game character ownership. Vote on what matters to you.
        </p>
        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          {[
            { v: `${quartersWithStatus.flatMap(q => q.tasks.filter(t => canSee(t.vis, tier) && t.milestone && t.done)).length}/${quartersWithStatus.flatMap(q => q.tasks.filter(t => canSee(t.vis, tier) && t.milestone)).length}`, l: "MILESTONES" },
            { v: `${doneCount}/${totalCount}`, l: "TASKS" },
            { v: String(currentSprint), l: "SPRINT" },
            { v: "GRANTED", l: "U.S. PATENT", green: true },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.green ? "#39FF14" : "#fff" }}>{s.v}</div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.2)", letterSpacing: "0.12em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TIMELINE DOTS ── */}
      <div style={{ padding: `0 ${px}px 6px`, marginTop: 8 }}>
        {/* Dot row — line runs through center of dots */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", height: 12 }}>
          {/* Base line — centered vertically in the 12px row */}
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.05)", transform: "translateY(-50%)" }} />
          {/* Green progress line */}
          <div style={{ position: "absolute", top: "50%", left: 0, width: `${timelineProg}%`, height: 2, background: "#39FF14", transform: "translateY(-50%)", transition: "width .5s ease" }} />
          {quartersWithStatus.map((q, i) => {
            const on = i <= curIdx;
            const here = q.status === "current";
            return (
              <div key={q.id} onClick={() => go(i)} style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative", cursor: "pointer", zIndex: 1 }}>
                {/* "YOU ARE HERE" floats above */}
                {here && (
                  <div style={{ position: "absolute", bottom: "100%", marginBottom: 6, display: "flex", flexDirection: "column", alignItems: "center", animation: "yah 2s ease-in-out infinite", pointerEvents: "none" }}>
                    <span style={{ fontSize: mob ? 6 : 7, fontWeight: 800, letterSpacing: "0.12em", color: "#39FF14", whiteSpace: "nowrap" }}>YOU ARE HERE</span>
                    <svg width="8" height="4" viewBox="0 0 8 4" style={{ marginTop: 2 }}><path d="M0 0L4 4L8 0" fill="#39FF14" /></svg>
                  </div>
                )}
                {/* Dot — naturally centered in the flex row, line passes through it */}
                <div style={{ width: here ? 10 : 7, height: here ? 10 : 7, borderRadius: "50%", background: on ? "#39FF14" : "rgba(255,255,255,0.1)", boxShadow: here ? "0 0 8px rgba(57,255,20,0.5)" : "none", transition: "all .3s ease" }} />
              </div>
            );
          })}
        </div>
        {/* Labels row — separate from dots so alignment isn't affected */}
        <div style={{ display: "flex", marginTop: 6 }}>
          {quartersWithStatus.map((q, i) => {
            const on = i <= curIdx;
            return (
              <div key={q.id} onClick={() => go(i)} style={{ flex: 1, textAlign: "center", cursor: "pointer" }}>
                <span style={{ fontSize: mob ? 7 : 8, fontWeight: 600, letterSpacing: "0.03em", color: on ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)" }}>{q.label} {q.year}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CAROUSEL ── */}
      {mob ? (
        <div style={{ padding: "16px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {quartersWithStatus.map(q => <QuarterCard key={q.id} q={q} active={q.status === "current"} mobile tier={tier} />)}
        </div>
      ) : (
        <div style={{ position: "relative", marginTop: 16 }}>
          {[{ dir: -1, disabled: center === 0, side: "left" }, { dir: 1, disabled: center === quartersWithStatus.length - 1, side: "right" }].map(({ dir, disabled, side }) => (
            <button key={side} onClick={() => go(center + dir)} disabled={disabled} style={{
              position: "absolute", [side]: 14, top: "42%", transform: "translateY(-50%)",
              zIndex: 10, width: 34, height: 34, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.9)",
              color: disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)",
              cursor: disabled ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, backdropFilter: "blur(6px)", transition: "color .2s",
            }}>{dir < 0 ? "‹" : "›"}</button>
          ))}
          <div ref={scrollRef} style={{ display: "flex", gap: GAP, overflowX: "auto", scrollSnapType: "x mandatory", padding: "12px 0 32px", scrollbarWidth: "none" }}>
            <div style={{ minWidth: `calc(50% - ${CARD_W / 2}px)`, flexShrink: 0 }} />
            {quartersWithStatus.map((q, i) => (
              <div key={q.id} onClick={() => go(i)} style={{ scrollSnapAlign: "center", flexShrink: 0, cursor: "pointer" }}>
                <QuarterCard q={q} active={i === center} mobile={false} tier={tier} />
              </div>
            ))}
            <div style={{ minWidth: `calc(50% - ${CARD_W / 2}px)`, flexShrink: 0 }} />
          </div>
        </div>
      )}

      {/* ── LEGEND ── */}
      <div style={{ padding: `0 ${px}px 16px`, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Check done s={14} /><span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Completed</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Check done={false} s={14} /><span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Planned</span></div>
        <MilestoneBadge />
        {tier !== "public" && <>
          {(tier === "partner" || tier === "internal") && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><VisIndicator vis="partner" /><span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Partner</span></div>}
          {(tier === "investor" || tier === "internal") && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><VisIndicator vis="investor" /><span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Investor</span></div>}
          {tier === "internal" && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><VisIndicator vis="internal" /><span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>Internal</span></div>}
        </>}
      </div>

      {/* ── COMMUNITY VOTING ── */}
      <CommunityVoting tickets={tickets} tier={tier} user={user} mobile={mob} />

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid #1E1E1E", padding: 24, textAlign: "center" }}>
        <img src={OGA_LOGO} alt="OGA" style={{ height: 20, opacity: 0.12 }} />
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.07)", letterSpacing: "0.06em", marginTop: 8 }}>
          ONE EARTH RISING P.B.C. — THE INFRASTRUCTURE FOR THE NEXT ERA OF GAMING
        </div>
        <div style={{ fontSize: 8, color: "rgba(57,255,20,0.2)", marginTop: 6, letterSpacing: "0.06em" }}>
          Sprint {currentSprint} • {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
      </footer>
    </div>
  );
}