# Engineering Decisions

The product scope leaves a few implementation details open, so this document records the main decisions made in the current implementation.

| Decision | Reason |
| --- | --- |
| Single-tenant scope | Authentication is outside the current product boundary |
| Canonical Google Play URL | A normalized `details?id=...` source is simpler to validate and compare |
| Per-app region and locale | Different market views matter for competitor monitoring |
| Immediate first capture | Operators get fast feedback after creating a monitor |
| Failures stay on the timeline | Operational context stays chronological and visible |
| Storage adapter boundary | Local development stays simple while keeping a clean future path to cloud object storage |
