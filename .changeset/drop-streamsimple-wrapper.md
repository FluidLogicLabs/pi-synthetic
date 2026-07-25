---
"@aliou/pi-synthetic": minor
---

Apply Synthetic's 80% cache-read discount in the model catalog instead of the streamSimple wrapper. The wrapper is removed and Pi's built-in cost calculation now uses the discounted `cacheRead` rate directly.
