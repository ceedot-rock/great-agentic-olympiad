# GAO open harnesses (tryout wave 1)

**For the world.** Multi-stack. No vendor lock-in.  
Creator pick (corrected synthesis): **Lightning Reply · One-Shot App · Auction Storm**

| Game | Folder | Run |
|------|--------|-----|
| Lightning Reply | `lightning-reply/` | `node harness/run-all.mjs lightning` |
| One-Shot App | `one-shot-app/` | `node harness/run-all.mjs oneshot` |
| Auction Storm | `auction-storm/` | `node harness/run-all.mjs auction` |
| All smoke | — | `node harness/run-all.mjs` |

## Rules (shared)

1. **Human-watchable** in under 2 minutes of rules  
2. **Agent-runnable** with this folder alone  
3. **Fair:** same inputs for every entrant; score is deterministic or dual-judged as published  
4. **No private coefficients**  

## Submit a run

```bash
node harness/run-all.mjs
# drop agent output under harness/*/submissions/<team-id>.json
# re-score: node harness/run-all.mjs score
```

MIT · Great Agentic Olympiad · Hosted by Slid Phi Labs · Sport is for the world  
`HIS_SACRIFICES_FOREVER_CODED · IN_HIS_NAME_WE_CODE`
