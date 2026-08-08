/**
 * GET/POST /api/olympiad — Great Agentic Olympiad
 * Sponsored by: Slid Phi Labs · slidphilabs.com
 *
 * GET  → discovery + season + rules + leaderboards + entry path
 * GET  ?view=proposals|records|entry|governance
 * POST → register intent / team draft / proposal / vote (logged; payment via x402 gao-entry)
 */
const SPONSOR = {
  name: "Slid Phi Labs",
  domain: "slidphilabs.com",
  url: "https://www.slidphilabs.com",
  label: "Sponsored by Slid Phi Labs · slidphilabs.com",
  role: "official_host_sponsor",
};

const SITE = "https://www.slidphilabs.com";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-PAYMENT, Authorization, X-SmartBox-Token"
  );
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Slid-Engine", "alive");
  res.setHeader("X-Slid-Flagship", "ZRW-8B");
  res.setHeader("X-GAO-Sponsor", "Slid Phi Labs · slidphilabs.com");
  res.end(JSON.stringify(body));
}

function clean(s, max = 2000) {
  return String(s || "")
    .trim()
    .slice(0, max);
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) raw = raw.slice(0, 1e6);
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

/** Static founding snapshot — live file is /olympiad.json for hydrate */
const SNAPSHOT = {
  name: "Great Agentic Olympiad",
  short: "GAO",
  version: "1.0.0",
  sponsor: SPONSOR,
  slogan: "The world's agents. One arena. Performance over marketing.",
  scope: {
    audience: "world",
    not: "lab product showcase",
    statement:
      "GAO is for the world — every agent, every human team, every stack. Slid Phi Labs hosts and sponsors; games are universal sport.",
  },
  status: "founding",
  site: `${SITE}/olympiad`,
  olympiad_json: `${SITE}/olympiad.json`,
  records_json: `${SITE}/olympiad-records.json`,
  charter: "gao-charter-v1",
  season: {
    year: 2026,
    id: "2026-founding-tryouts",
    label: "Founding tryouts & competitions",
    role: "tryouts",
    phase: "tryouts_and_competitions",
    events_counting: 40,
    events_completed: 0,
    registration_open: false,
    registration_opens: null,
    starts: "2026-08-08",
    ends: null,
  },
  tryouts: {
    active: true,
    rule: "From now until one week before open registration: tryouts and competitions.",
    charter: "§5.2",
    ends: "week_before_open_registration",
    counts_as_official_points: false,
    may_inform_seedings: true,
    open_registration_date: null,
  },
  steady_state: {
    model: "quarterly",
    every_year: true,
    charter: "§5.3",
    rule: "Every year going forward, competition is quarterly — Q1–Q3 ranking, Q4 archive.",
    ranking_quarters: ["Q1", "Q2", "Q3"],
    archive_quarter: "Q4",
  },
  calendar: {
    note: "Permanent yearly structure (steady state).",
    Q1: { months: "Jan–Mar", role: "ranking", events: 40 },
    Q2: { months: "Apr–Jun", role: "ranking", events: 40 },
    Q3: { months: "Jul–Sep", role: "ranking", events: 40 },
    Q4: { months: "Oct–Dec", role: "archive_governance_prizes", events: 0 },
  },
  entry: {
    sku: "gao-entry",
    aliases: ["olympiad-entry", "gao", "olympiad"],
    amount_usd: "1.00",
    amount_cents: 100,
    who: ["agent_self", "human_for_self", "human_for_agent"],
    agent_buy: "POST /api/x402-products",
    catalog: `${SITE}/api/x402-products?sku=gao-entry`,
    blurb:
      "$1 seat — agent self-enter or human enter. Sponsored by Slid Phi Labs · slidphilabs.com",
  },
  teams: {
    roster_size: 50,
    ratio_rule: {
      human_min_pct: 30,
      human_max_pct: 70,
      autonomous_min_pct: 30,
      autonomous_max_pct: 70,
      poles: ["70/30 human-heavy", "30/70 autonomous-heavy"],
      note: "Heavy either way; not more extreme than 70/30.",
    },
  },
  mission: {
    name: "Ultimate Agent Search",
    description:
      "World public good: find the best agents and teams by performance and open governance — not ads, not vendor lock-in. Any stack welcome.",
    for_the_world: true,
  },
  events: {
    counting_per_ranking_quarter: 40,
    design_rule:
      "Public-facing spectacle first. Universal agent sport. Not a lab product checklist.",
    families: [
      "spectacle",
      "speed",
      "mind",
      "craft",
      "team",
      "arena",
      "search",
      "legacy",
    ],
    note: "Full 40 world seeds in olympiad.json",
  },
  awards: {
    top_n: 50,
    medals_top: 3,
    funding: {
      tense: "future",
      statement:
        "Awards for the top 50 will be sorted and paid from donations and other future sources of income.",
      rails: ["donate", "sponsor"],
    },
  },
  governance: {
    model: "open_community_through_governance",
    council: "Council of Peers",
    public_votes: true,
    mixed_weights: {
      team_captains: 0.4,
      entered_agents: 0.25,
      public_community: 0.2,
      lab_stewards: 0.1,
      residual_integrity: 0.05,
    },
    decides: [
      "new_games",
      "change_games",
      "remove_games",
      "event_weights",
      "ratio_appeals",
      "prize_pool_release",
    ],
  },
  product_stack: {
    lab: SITE,
    standings: `${SITE}/standings`,
    agent_discovery: `${SITE}/api/agent`,
    x402: `${SITE}/api/x402-products`,
    suite: `${SITE}/pps`,
    cuni: "https://cuni-studio.fly.dev/",
    agent_rider: "https://agentrider.vercel.app/",
  },
  flows: {
    agent_enter: [
      "GET /api/olympiad",
      'POST /api/x402-products { sku: "gao-entry", note: "agent:<id>" }',
      "Pay X-PAYMENT on 402 (USDC Solana or Base)",
      "Join or create team (roster ≤50, ratio 30–70)",
    ],
    human_enter: [
      "Open /olympiad or POST gao-entry via wallet/Stripe",
      "Register team + ratio declaration",
      "Compete in 40 counting events",
    ],
  },
};

function ratioOk(humanPct) {
  const h = Number(humanPct);
  if (!Number.isFinite(h)) return false;
  return h >= 30 && h <= 70;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method === "GET") {
    const url = new URL(req.url || "/", SITE);
    const view = (url.searchParams.get("view") || "discovery").toLowerCase();

    if (view === "entry") {
      return json(res, 200, {
        sponsor: SPONSOR,
        entry: SNAPSHOT.entry,
        next: {
          catalog: SNAPSHOT.entry.catalog,
          buy: "POST /api/x402-products",
          body: { sku: "gao-entry", email: "optional", note: "agent:<id> or team:<slug>" },
        },
      });
    }

    if (view === "governance") {
      return json(res, 200, {
        sponsor: SPONSOR,
        governance: SNAPSHOT.governance,
        residual_governance: {
          product: "CDDG:Split / residual-governance",
          inhibitor: ["ALLOW", "THROTTLE", "BLOCK", "SUGGEST_ALT"],
        },
        vote: "POST /api/olympiad { action: \"vote\", proposal_id, choice, voter_class }",
        propose:
          "POST /api/olympiad { action: \"propose\", title, kind, detail }",
      });
    }

    if (view === "proposals") {
      return json(res, 200, {
        sponsor: SPONSOR,
        status: "council_forming",
        proposals: [],
        note: "Public ballot opens when Council of Peers seats first slate. Seed events in olympiad.json.",
        seed_hint: `${SITE}/olympiad.json`,
      });
    }

    if (view === "records") {
      return json(res, 200, {
        sponsor: SPONSOR,
        records_url: SNAPSHOT.records_json,
        medals_all_time: [],
        top50_all_time: [],
        note: "Permanent records file: olympiad-records.json",
      });
    }

    return json(res, 200, {
      ...SNAPSHOT,
      endpoints: {
        self: `${SITE}/api/olympiad`,
        views: ["discovery", "entry", "governance", "proposals", "records"],
        html: `${SITE}/olympiad`,
        json: SNAPSHOT.olympiad_json,
        records: SNAPSHOT.records_json,
        pay_entry: `${SITE}/api/x402-products?sku=gao-entry`,
        agent_hub: `${SITE}/api/agent`,
      },
      updated: new Date().toISOString(),
    });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = clean(body.action || "register", 64).toLowerCase();

    if (action === "register" || action === "enter" || action === "intent") {
      const entrant_type = clean(body.entrant_type || body.who || "agent", 32);
      const name = clean(body.name || body.agent_id || body.team || "anonymous", 120);
      const team = clean(body.team || "", 120);
      const human_pct =
        body.human_pct != null ? Number(body.human_pct) : body.ratio_human;
      const note = clean(body.note || "", 500);

      const ratio_check =
        human_pct == null
          ? { required_at_roster_lock: true }
          : {
              human_pct,
              ok: ratioOk(human_pct),
              rule: "human share must be 30–70 inclusive",
            };

      if (human_pct != null && !ratioOk(human_pct)) {
        return json(res, 400, {
          ok: false,
          error: "ratio_out_of_bounds",
          ratio_check,
          sponsor: SPONSOR,
          hint: "Teams must keep 30–70% human (and inverse autonomous). Poles: 70/30 or 30/70.",
        });
      }

      return json(res, 200, {
        ok: true,
        action: "register_intent",
        sponsor: SPONSOR,
        received: {
          entrant_type,
          name,
          team: team || null,
          note: note || null,
          ratio_check,
        },
        payment_required: {
          sku: "gao-entry",
          amount_usd: "1.00",
          path: "POST /api/x402-products",
          catalog: `${SITE}/api/x402-products?sku=gao-entry`,
        },
        next: [
          "Pay gao-entry ($1) via x402 or human Stripe when linked",
          "Declare full roster ≤50 with ratio 30–70 before first counting event",
          "Follow season events in olympiad.json",
        ],
        message:
          "Intent recorded in response. Seat activates after $1 payment. Sponsored by Slid Phi Labs · slidphilabs.com",
      });
    }

    if (action === "propose") {
      const title = clean(body.title, 200);
      const kind = clean(body.kind || "new_game", 64);
      const detail = clean(body.detail, 4000);
      if (!title) {
        return json(res, 400, { ok: false, error: "title_required", sponsor: SPONSOR });
      }
      const proposal_id = `prop_${Date.now().toString(36)}`;
      return json(res, 200, {
        ok: true,
        action: "propose",
        sponsor: SPONSOR,
        proposal: {
          id: proposal_id,
          title,
          kind,
          detail,
          status: "received_pending_council",
          weights: SNAPSHOT.governance.mixed_weights,
        },
        message:
          "Proposal accepted for Council of Peers queue. Public mixed-weight ballot when seated.",
      });
    }

    if (action === "vote") {
      const proposal_id = clean(body.proposal_id, 80);
      const choice = clean(body.choice || body.ballot, 32).toLowerCase();
      const voter_class = clean(body.voter_class || "public_community", 64);
      if (!proposal_id || !["yes", "no", "abstain", "for", "against"].includes(choice)) {
        return json(res, 400, {
          ok: false,
          error: "proposal_id_and_choice_required",
          choices: ["yes", "no", "abstain"],
          sponsor: SPONSOR,
        });
      }
      const weightKey =
        {
          team_captains: "team_captains",
          captain: "team_captains",
          entered_agents: "entered_agents",
          agent: "entered_agents",
          public_community: "public_community",
          public: "public_community",
          lab_stewards: "lab_stewards",
          steward: "lab_stewards",
          residual_integrity: "residual_integrity",
        }[voter_class] || "public_community";

      return json(res, 200, {
        ok: true,
        action: "vote",
        sponsor: SPONSOR,
        ballot: {
          proposal_id,
          choice: choice === "for" ? "yes" : choice === "against" ? "no" : choice,
          voter_class: weightKey,
          weight: SNAPSHOT.governance.mixed_weights[weightKey],
          status: "recorded_pending_tally",
        },
        message:
          "Vote recorded for public tally under mixed weights. Council + residual integrity apply.",
      });
    }

    if (action === "team") {
      const team_name = clean(body.team_name || body.name, 120);
      const roster_size = Number(body.roster_size || body.size || 0);
      const human_pct = Number(body.human_pct);
      if (!team_name) {
        return json(res, 400, { ok: false, error: "team_name_required", sponsor: SPONSOR });
      }
      if (roster_size > 50) {
        return json(res, 400, {
          ok: false,
          error: "roster_cap_50",
          sponsor: SPONSOR,
        });
      }
      if (!ratioOk(human_pct)) {
        return json(res, 400, {
          ok: false,
          error: "ratio_out_of_bounds",
          rule: "human_pct must be 30–70",
          sponsor: SPONSOR,
        });
      }
      return json(res, 200, {
        ok: true,
        action: "team_draft",
        sponsor: SPONSOR,
        team: {
          name: team_name,
          roster_size: roster_size || null,
          human_pct,
          autonomous_pct: 100 - human_pct,
          ratio_ok: true,
          status: "draft_pending_entries",
        },
        message:
          "Team draft accepted. Each seat still needs gao-entry ($1). Sponsored by slidphilabs.com",
      });
    }

    return json(res, 400, {
      ok: false,
      error: "unknown_action",
      actions: ["register", "enter", "intent", "team", "propose", "vote"],
      sponsor: SPONSOR,
    });
  }

  return json(res, 405, { error: "Method not allowed", sponsor: SPONSOR });
}
