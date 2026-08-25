# Segmentation data map

All input is Growth Engine data; segmentation never reads or changes ScrapMe transaction collections.

| Segment | Required data | Calculation | Limitation |
| --- | --- | --- | --- |
| `new_customer` | `firstSeenAt`, `completedOrders` | First seen within `NEW_CUSTOMER_DAYS` and zero completed orders | Requires a valid source first-seen timestamp. |
| `first_time_seller` | `completedOrders` | Exactly 1 | Depends on Phase 2 completed pickup mapping. |
| `repeat_seller` | `completedOrders` | At least 2 | Same limitation as first-time seller. |
| `high_value_customer` | `totalRevenue` | Revenue at least `HIGH_VALUE_REVENUE_THRESHOLD` | Revenue comes only from positive valid completed pickup final prices. |
| `abandoned_request` | `CustomerEvent` | At least one explicit `request_abandoned` event | Phase 2 does not infer abandoned requests. |
| `never_completed` | `totalOrders` or event count, `completedOrders` | Has request/activity history and zero completions | Does not claim a request was abandoned. |
| `inactive_customer` | `lastActivityAt` | Inactive for `INACTIVE_DAYS` through one day before `DORMANT_DAYS` | Missing/malformed activity dates produce no inactivity segment. |
| `dormant_customer` | `lastActivityAt` | Inactive at least `DORMANT_DAYS` | Exclusive with `inactive_customer` to give one clear inactivity state. |
| `reactivated_customer` | Two latest meaningful timestamped events | The newer event is recent and follows older meaningful activity by at least `INACTIVE_DAYS` | Meaningful types are quote/request/pickup/payment/review/referral activity only; `page_visit` and `request_abandoned` never qualify. |
| acquisition segments | `acquisitionSource` | Exact normalized source: google, instagram, influencer, direct, referral | Unknown sources do not create a segment. |
| `influencer_acquired` | `influencerId` | Non-empty ID | Independent of acquisition source. |
