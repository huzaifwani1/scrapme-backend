# Automation Engine Foundation — Architecture

This document describes the architectural layout, components, and data flows of the ScrapMe Growth Engine's automation system (Phase 4).

## System Flowchart

```
       [ CustomerEvent / Trigger ]
                    │
                    ▼
     ┌─────────────────────────────┐
     │  Suppression Service:       │
     │  - Check duplicate execution│ ──(Duplicate)──► [ Skip (idempotent) ]
     │  - Check customer exists    │
     └──────────────┬──────────────┘
                    │ (Not Suppressed)
                    ▼
     ┌─────────────────────────────┐
     │  Condition Engine:          │
     │  - Resolve active segments  │
     │  - Evaluate criteria        │ ──(No Match)───► [ Skip / Log skipped ]
     │  - Check field allowlist    │
     └──────────────┬──────────────┘
                    │ (Matches conditions)
                    ▼
     ┌─────────────────────────────┐
     │  Execution Scheduler:       │
     │  - Evaluate trigger delay   │ ──(Delay > 0)──► [ Queue 'pending' ]
     │  - Immediate or scheduled   │
     └──────────────┬──────────────┘
                    │ (Immediate Execution)
                    ▼
     ┌─────────────────────────────┐
     │  Action Generator (Dry-Run): │
     │  - Verify action suppression│ ──(Suppressed)─► [ Skip action / log ]
     │  - Generate mock action     │
     │  - Save execution log       │
     └─────────────────────────────┘
```

## Architectural Components

### 1. Automation Model (`Automation.js`)
Defines the schema for creating marketing automations. It contains metadata (`name`, `description`, `status`), the triggering event or schedule criteria, a series of conditions evaluated against allowlisted customer properties, and the list of actions to run when conditions are met.

### 2. Automation Execution Model (`AutomationExecution.js`)
Tracks the history and lifecycle of all automation executions. It links an `Automation` definition to a `Customer` and the triggering `CustomerEvent`. Uniqueness is protected by a compound index ensuring strict event-level idempotency.

### 3. Condition Engine (`conditionEvaluator.js`)
A deterministic, sandbox-safe condition evaluator. It reads customer metadata in-memory, resolving virtual references (like `segments`), and compares them against allowed properties without running dynamic expressions or database queries.

### 4. Suppression Service (`suppressionService.js`)
Enforces marketing safety and delivery policies, checking:
- Unsubscribe status (suppresses message delivery).
- Missing recipient metadata (omits actions for channels lacking valid contact info).
- Duplicate execution guard (prevents dual-triggering).

### 5. Automation Service (`automationService.js`)
The orchestrator coordinating trigger evaluation, scheduling, condition validation, suppression evaluation, and action generation.

---

## Security Boundaries & Safe Provider Boundaries

### In-Memory Evaluation
No user-controlled inputs can construct database queries or execute arbitrary code. The Condition Engine uses a strict allowlist of properties. It does not use `eval()` or construct Mongoose queries dynamically.

### Dry-Run Safeguard
By default, the engine runs with `DRY_RUN=true`. All generated `send_message` action results are tagged with `status: "queued_for_future_execution"`, preventing any connection to external messaging SDKs or APIs.
