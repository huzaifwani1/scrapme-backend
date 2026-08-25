# Segmentation rules

Configuration defaults: `NEW_CUSTOMER_DAYS=14`, `INACTIVE_DAYS=30`, `DORMANT_DAYS=90`, `HIGH_VALUE_REVENUE_THRESHOLD=10000`. All are positive environment-configurable values, and startup/refresh fails clearly unless `DORMANT_DAYS > INACTIVE_DAYS`.

Segments overlap. A customer can be, for example, `repeat_seller`, `high_value_customer`, and `influencer_acquired` simultaneously. The sole deliberate exclusion is that a dormant customer is not also labelled inactive.

Each assignment includes a human-readable reason and supporting metadata. Refresh upserts the current assignments and removes only stale Growth Engine segment records; it never changes customers, events, attribution, orders, or source data.

Examples:

- A customer with `completedOrders: 3` and `totalRevenue: 15000` is a repeat and high-value seller with default configuration.
- A customer with a real `request_abandoned` event is abandoned-request regardless of completed-order count.
- A customer whose two newest meaningful events are 45 days apart, with the latter 2 days ago, is reactivated with default configuration. `page_visit` and `request_abandoned` do not count as meaningful reactivation activity.
- A customer with no valid activity date is never labelled inactive or dormant.
