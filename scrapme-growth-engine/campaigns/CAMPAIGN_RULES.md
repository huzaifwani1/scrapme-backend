# Campaign rules
Only segment audiences are valid. AND requires every requested segment; OR requires any. Execution is active-only. Lifecycle: draft→scheduled; scheduled→active/cancelled; active→paused/completed; paused→active/cancelled. Scheduling is metadata only. Marketing frequency defaults to `MAX_CAMPAIGN_MESSAGES_PER_CUSTOMER=3` over 24 hours; suppressed/cancelled intents do not count.
