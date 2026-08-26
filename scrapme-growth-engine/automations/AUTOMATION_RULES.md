# Automation Engine Foundation — Logic & Execution Rules

This document details the schema definitions, operators, suppression rules, and safety invariants of the ScrapMe Growth Engine's automation system.

## 1. Trigger Model
Every automation must define a trigger block:
```json
{
  "type": "event | schedule | manual",
  "eventType": "request_abandoned | pickup_completed | ... (null for schedule/manual)",
  "delayMinutes": 0
}
```

## 2. Condition Model & Field Allowlist
Conditions are evaluated against a prepared Customer object. Supported fields are strictly limited to the allowlist below:

- `customerStatus`
- `completedOrders`
- `totalOrders`
- `totalRevenue`
- `acquisitionSource`
- `acquisitionMedium`
- `acquisitionCampaign`
- `influencerId`
- `referralCode`
- `tags`
- `firstSeenAt`
- `lastActivityAt`
- `segments` (Virtual field resolved from the active `CustomerSegment` records)

### Supported Operators
- `equals` / `not_equals`: Exact primitive or string matches.
- `greater_than` / `greater_than_or_equal`: Numeric or date comparisons.
- `less_than` / `less_than_or_equal`: Numeric or date comparisons.
- `exists` / `not_exists`: Checks for fields that are null/empty.
- `contains`: Checks if arrays contain a value, or strings contain a substring.
- `in` / `not_in`: Checks if the customer field value exists in an array.

---

## 3. Suppression Safety Matrix
Before actions are generated, the engine executes action-level checks:

| Channel | Condition | Result |
|---|---|---|
| Any Message | Customer is Unsubscribed | Skip (status: `skipped`, reason: `unsubscribed`) |
| Email | Customer email is missing/blank | Skip (status: `skipped`, reason: `missing_recipient_email`) |
| SMS / WhatsApp | Customer phone is missing/blank | Skip (status: `skipped`, reason: `missing_recipient_phone`) |
| Push | Customer ScrapMe User ID is missing | Skip (status: `skipped`, reason: `missing_recipient_push`) |

---

## 4. Idempotency Invariant
To prevent duplicate execution logs, the system creates a compound unique index on:
`automationId + customerId + triggerEventId`

For event-triggered automations, any attempt to run the engine on a previously processed event/customer combination returns the existing execution log immediately.

---

## 5. Dry-Run Policy
The environment variable `DRY_RUN` defaults to `true` in all environments. In dry-run mode, the engine:
- Never instantiates provider clients.
- Never runs external API connections.
- Generates queued simulation action outputs:
  ```json
  {
    "type": "send_message",
    "channel": "email",
    "recipient": "customer@example.com",
    "templateId": "first_time_seller_retention",
    "status": "queued_for_future_execution"
  }
  ```
