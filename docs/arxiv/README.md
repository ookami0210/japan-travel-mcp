# arXiv submission package

`japan_travel_mcp.tex` — full LaTeX source, ~6 pages, target categories `cs.CL` (primary) + `cs.IR` (cross-list).

## Compile

```bash
cd docs/arxiv
pdflatex japan_travel_mcp.tex
bibtex   japan_travel_mcp        # only if BibTeX entries are externalised
pdflatex japan_travel_mcp.tex
pdflatex japan_travel_mcp.tex
```

(or use Overleaf — paste the .tex into a new project)

## Pre-submission checklist

- [ ] Compiles without warnings (`\hbox` overfull warnings are OK if minor)
- [ ] All URLs resolve (GitHub, HF dataset, npm package)
- [ ] Coverage table numbers match `data/r3/translations/r3_translations.jsonl` line count
- [ ] Author email is current
- [ ] BibTeX entries verified (currently 2 entries inline; add more if reviewers request)
- [ ] **arXiv endorsement obtained** for `cs.CL` (first-time submitters need one)

## arXiv endorsement — how to get it

If the submitter has never submitted to arXiv before, the system requires an endorsement
from an existing arXiv author in the same primary category (`cs.CL`).

Options:
1. Ask a known NLP / IR researcher in your network to endorse you.
2. Post on the MCP Discord / X with #arxiv-endorsement — researchers
   periodically endorse open-data submissions.
3. Email the arXiv help desk explaining the dataset's nature; they
   sometimes auto-endorse for bona fide research artifacts.

## Submission flow

1. Compile → `japan_travel_mcp.pdf`
2. Tar the directory: `tar -czf japan-travel-mcp-arxiv.tar.gz japan_travel_mcp.tex`
3. arXiv requires: source (.tex / .bib), no compiled PDF (they recompile)
4. Categories: primary `cs.CL`, cross-list `cs.IR`
5. License: CC BY 4.0
6. Once accepted, paste the arXiv ID into:
   - GitHub README.md (the "see also" links section)
   - HF dataset card
   - HF Space landing page
7. After 24h, cross-list on Hugging Face Papers (huggingface.co/papers)

## Reviewer ask

Before submission, get one external reviewer (academic colleague or
research engineer) for a sanity pass on:
- Are the coverage numbers correct?
- Is the methodology section sufficient for replication?
- Are limitations honestly stated?
- Are claims of novelty defensible?
