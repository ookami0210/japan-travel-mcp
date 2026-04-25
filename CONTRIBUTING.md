# Contributing to Japan Travel MCP

PRs are not just welcome — they're the whole point.

This project exists because one person can't know every corner of Japan.  
You do.

---

## What we need most

### Add a missing hotel or ryokan
If your favorite place isn't in the data, add it.  
Open a PR with the name, address, coordinates, and source URL.  
Even a single property matters.

### Fix a wrong match
The entity matching engine isn't perfect.  
If two different properties got merged into one,  
or one property got split into two entries —  
open a PR against `/data/hotels/review/`.  
That folder exists exactly for this.

### Add a scraper for a new municipality
If your hometown's tourism site isn't covered,  
write a scraper and send it in.  
Look at `/scrapers/municipal/` for examples.  
Even a rough first version is more than we had before.

### Improve multilingual content
Native speakers of English, Chinese, Korean, and other languages —  
if the translation of a tourism description feels off, fix it.  
Official sources aren't always well-translated.

### Report a source that should be added
Know a public registry, government dataset, or open-licensed tourism feed
that we're not using yet? Open an issue.

We add sources only when they meet the project's source selection rule:
public registries, content published by the subject itself (a city, a hotel),
or open data with traceable provenance. OTA inventories, paid aggregators,
and third-party review feeds are out of scope by design.

---

## The bar for merging

**Low. Intentionally.**

If the data is accurate, the source is public, and it helps someone  
understand Japan better — it gets merged.

We are not optimizing for perfect code.  
We are optimizing for coverage.

---

## How to submit a PR

1. Fork the repository
2. Make your change
3. Include the source URL for any data you add
4. Open a pull request with a short description

That's it. No templates, no checklists.

---

## Questions

Open an issue. We'll respond.

— KJ Sunada
