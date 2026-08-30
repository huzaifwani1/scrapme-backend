# Phase 6 campaign orchestration
Campaign audiences resolve only approved `CustomerSegment` keys with AND/OR semantics. Preview never writes. Execute-preview creates idempotent, forced-dry-run MessageIntents and CampaignExecution audits, terminating at NullProvider; no scheduler, worker, provider SDK, or network dispatch exists.
