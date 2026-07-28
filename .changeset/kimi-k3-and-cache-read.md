---
"@aliou/pi-synthetic": minor
---

Add Kimi-K3, drop Kimi-K2.7-Code, and store cache-read price as reported by the API.

- Add `hf:moonshotai/Kimi-K3` (text+image, 524k context). Verified reasoning
  behavior via the Synthetic connector: backend accepts `none`/`low`/`high`/
  `max`, rejects `medium`; `low` emits no reasoning content. thinkingLevelMap
  exposes off/high/max.
- Remove `hf:moonshotai/Kimi-K2.7-Code` (no longer in the Synthetic catalog).
- Update `syn:large:vision` to its current backing model pricing/context
  (524k context, $3/$15) and the Kimi-K3 reasoning map.
- Remove the automatic cache-read discount. The catalog and API-sourced
  models now store the `input_cache_reads` price as reported by the Synthetic
  API directly, with no 80% discount applied in code. `syn:large:text` and
  `hf:zai-org/GLM-5.2` cacheRead updated from 0.2 to 0.16 to match the API.
  Verified against live billing: cache-read calls are charged at the API's
  `input_cache_reads` rate (e.g. $0.45/M for Kimi-K3), cache writes are free.
- Add a thinkingLevelMap to `hf:openai/gpt-oss-120b`. Probed all efforts:
  the backend accepts `none`/`minimal`/`low`/`medium`/`high`/`xhigh` and
  rejects `max` (400). The model reasons at every accepted effort including
  `none`, so reasoning cannot be disabled (`off` hidden). Exposes
  minimal/low/medium/high/xhigh; hides `max` to avoid a 400 on the top level.
