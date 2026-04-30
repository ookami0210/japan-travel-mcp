# Architecture Decision Records

This directory holds the durable record of architectural decisions made
on the project — what changed, when, why, and what alternatives were
considered.

The format is loosely based on Michael Nygard's
[ADR template](https://github.com/joelparkerhenderson/architecture-decision-record).

## Why we keep these

The code itself records *what* the system does today. The git log records
*who* changed *what*, and roughly *when*. Neither of those answers
*why* a particular shape of the system exists. ADRs do.

For this project specifically: when the dataset structure or the
scraping pipeline looks the way it does, future contributors (and our
own future selves) should be able to read why we picked this shape and
not a different shape that, in retrospect, might look simpler.

## Index

| # | Title | Status | Date |
|:---:|:---|:---|:---|
| [0001](0001-multi-source-tourism-data.md) | Multi-source tourism data acquisition for the long tail | Accepted | 2026-04-30 |
