---
"@aliou/pi-synthetic": patch
---

Keep Synthetic listed in `/model` without an API key. `check` returned `undefined` when no key existed, so pi's availability gate filtered the provider out even though `resolve` already falls back to an anonymous credential (the catalog endpoints are public, and aperture proxy mode authenticates gateway-side). `check` now returns that same anonymous credential.
