# Phase 5 communication foundation

Phase 5 uses `MessageIntent` as the idempotent delivery intention and `MessageLog` as the delivery-attempt audit record. Automations communicate only through `automationMessageBridge`; they never select or call providers.

`providerRegistry` is the provider choke point. `DRY_RUN` defaults to true and `MESSAGING_LIVE_MODE` must also be explicitly true; Phase 5 nevertheless registers only `NullProvider`, which never makes a network call. There is no worker, scheduler, retry loop, live credential, or live dispatch path.

Preferences are keyed by customer, channel, and marketing/transactional/all scope. Webhooks require provider signature validation before ingestion and use idempotency keys; administrative APIs require integration authentication.
