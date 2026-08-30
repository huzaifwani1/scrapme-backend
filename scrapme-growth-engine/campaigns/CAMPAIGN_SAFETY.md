# Campaign safety
All campaign routes require integration authentication. Inputs are validated against fixed allowlists; no audience object becomes a raw Mongo selector. Every execution is forced dry-run and NullProvider remains the sole provider. No production database, provider credential, worker, timer, or automatic scheduled execution is used.
