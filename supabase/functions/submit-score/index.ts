// Supabase Edge Function: submit-score
// ---------------------------------------------------------------------------
// Server-authoritative score submission for the SKYFALL leaderboard.
//
// WHY: previously the browser inserted directly into public.leaderboard with
// the anon key, so anyone could POST score=999999 with one curl and top the
// prize board. This function becomes the ONLY write path: it validates the
// submission, applies basic plausibility + bounds checks, and inserts with the
// service-role key. RLS must then REVOKE direct INSERT on leaderboard /
// game_sessions from the anon + authenticated roles (see the deployment guide
// at docs/backend-hardening-deployment.md — do that step LAST, together with
// shipping the matching client change, or live scoring breaks).
//
// This is Phase 0 hardening: it stops trivial/egregious cheating and makes the
// server the source of truth. Full anti-cheat (signed run token + deterministic
// replay validation of the seeded run) is Phase 5 and layers on top of this.
//
// Deploy:  supabase functions deploy submit-score --no-verify-jwt
//   (--no-verify-jwt because players are anonymous and have no session JWT.)
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Bounds (must match the RLS CHECK constraints already in the DB) ──
const MAX_SCORE = 999_999;
const MAX_WAVES = 1_000;
const MAX_LEVEL = 1_000;
const MAX_DURATION = 36_000; // seconds
const NAME_MAX = 20;

// ── Plausibility heuristics (generous so legit runs are never rejected) ──
// The game accrues ~1 pt/sec plus event/kill bonuses; even with max combos a
// sustained rate far above this is not reachable by human play.
const MAX_SCORE_PER_SECOND = 500;
// Each wave takes at least a few seconds; a run claiming many waves in almost
// no time is impossible.
const MIN_SECONDS_PER_WAVE = 3;

interface Payload {
  playerName?: unknown;
  score?: unknown;
  wavesReached?: unknown;
  levelReached?: unknown;
  stats?: {
    timeSurvived?: unknown;
    dronesDestroyed?: unknown;
    powerUpsCollected?: unknown;
    closeCalls?: unknown;
    bossesDefeated?: unknown;
  };
}

function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // ── Normalise + bound the inputs ──
  const playerName = String(payload.playerName ?? "").slice(0, NAME_MAX).trim();
  const score = asInt(payload.score);
  const wavesReached = asInt(payload.wavesReached);
  const levelReached = asInt(payload.levelReached, 1);
  const duration = asInt(payload.stats?.timeSurvived);

  // ── Hard bounds (reject, do not clamp — clamping would silently accept a cheat) ──
  if (playerName.length < 1 || playerName.length > NAME_MAX) {
    return json({ error: "invalid_name" }, 422);
  }
  if (score < 0 || score > MAX_SCORE) return json({ error: "score_out_of_range" }, 422);
  if (wavesReached < 0 || wavesReached > MAX_WAVES) {
    return json({ error: "waves_out_of_range" }, 422);
  }
  if (levelReached < 0 || levelReached > MAX_LEVEL) {
    return json({ error: "level_out_of_range" }, 422);
  }
  if (duration < 0 || duration > MAX_DURATION) {
    return json({ error: "duration_out_of_range" }, 422);
  }

  // ── Plausibility cross-checks ──
  // These catch the trivially-impossible (score 999999 at wave 1, or a huge
  // score in near-zero time). They are not a full anti-cheat — a determined
  // attacker can supply internally-consistent fake fields — but they raise the
  // floor and, combined with revoked direct INSERT, stop the curl-one-liner.
  if (duration > 0 && score > duration * MAX_SCORE_PER_SECOND) {
    return json({ error: "implausible_score_rate" }, 422);
  }
  if (wavesReached > 1 && duration < wavesReached * MIN_SECONDS_PER_WAVE) {
    return json({ error: "implausible_wave_time" }, 422);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // ── Insert leaderboard row (service role bypasses RLS) ──
  const { error: lbErr } = await db.from("leaderboard").insert({
    player_name: playerName,
    score,
    waves_reached: wavesReached,
    level_reached: levelReached,
  });
  if (lbErr) {
    return json({ error: "insert_failed", detail: lbErr.message }, 500);
  }

  // ── Insert session analytics (best-effort; don't fail the whole request) ──
  await db.from("game_sessions").insert({
    player_name: playerName,
    score,
    waves_reached: wavesReached,
    level_reached: levelReached,
    duration_seconds: duration,
    drones_destroyed: asInt(payload.stats?.dronesDestroyed),
    powerups_collected: asInt(payload.stats?.powerUpsCollected),
    close_calls: asInt(payload.stats?.closeCalls),
    bosses_defeated: asInt(payload.stats?.bossesDefeated),
  });

  // ── Compute rank (number of scores strictly greater, + 1) ──
  const { count } = await db
    .from("leaderboard")
    .select("*", { count: "exact", head: true })
    .gt("score", score);

  return json({ rank: (count ?? 0) + 1 });
});
