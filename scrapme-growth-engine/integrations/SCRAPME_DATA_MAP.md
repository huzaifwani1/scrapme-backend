# ScrapMe → Growth Engine data map

This mapping was inspected from the existing ScrapMe Mongoose models. Phase 2 only reads these source collections with a separately configured, read-only connection.

| ScrapMe source | Source field | Growth Engine destination | Transformation rule |
| --- | --- | --- | --- |
| `User` | `_id` | `Customer.scrapmeUserId` | Store the ObjectId as a string; primary customer match key. |
| `User` | `name`, `email`, `phone` | `Customer.name`, `email`, `phone` | Trim identity fields; email is lowercased and phone normalized for matching. Source values do not replace existing non-empty Growth marketing data unnecessarily. |
| `User` | `createdAt`, `updatedAt` | `Customer.firstSeenAt`, `lastActivityAt` | First seen is the earliest known source activity; last activity is the latest source activity. |
| `Request` | `_id`, `userId`, `createdAt` | `CustomerEvent.scrapmeRequestId`, `customerId`, `timestamp` | One idempotent `request_submitted` event per request, keyed as `request:<id>:request_submitted`. |
| `Request` | `status` | event metadata | Preserved as metadata. No `request_abandoned` event is created: the source enum has no abandoned state. |
| `Request` | `influencerId`, `referralCode` | `Customer.influencerId`, `referralCode` | Store only when the individual Growth field is empty. Existing values always win. |
| `Request` | `influencerId` / `referralCode` | `Customer.acquisitionSource`, `acquisitionMedium` | Fill only an empty individual Growth field. `direct` is an existing value and is never replaced. For conflicts, use the earliest valid timestamped attributed request, breaking equal timestamps by request ID. |
| `PickupOrder` | `_id`, `requestId`, `startedAt` | `CustomerEvent.scrapmePickupOrderId`, `customerId`, `timestamp` | Create `pickup_assigned` only with an explicit valid `startedAt`. |
| `PickupOrder` | `_id`, `requestId`, `pickedUpAt` / `completedAt` | `CustomerEvent.scrapmePickupOrderId`, `customerId`, `timestamp` | Create `pickup_completed` only with an explicit valid pickup/completion timestamp. |
| `PickupOrder` | `status`, `finalPrice`, `completedAt` | `CustomerEvent.payment_completed` | Created only for explicit `status: completed`, valid `completedAt`, and a positive finite number (or numeric string) final price. Null, blank, zero, negative, NaN, and Infinity are rejected. |
| `Request` | count per user | `Customer.totalOrders` | Number of unique source requests for that user. |
| `PickupOrder` | completed status / `finalPrice` | `Customer.completedOrders`, `totalRevenue` | Completed orders count only `status: completed`; revenue sums finite `finalPrice` values from those orders. |
| `Influencer` | `_id`, `referralCode` | Not read independently in Phase 2 | Requests already contain the source `influencerId` and `referralCode` needed for customer attribution. |

The actual source status enums are: request `pending`, `evaluated`, `approved`, `completed`, `rejected`, `contacted`, `accepted`, `purchased`; pickup order `assigned`, `picked_up`, `completed`, `cancelled`.

Historical events never use the current time as a fallback. Missing explicit source timestamps skip the event and are reported; customer first/last-seen fields remain null when their source timestamps are absent. The source connection exposes only a frozen `find`/`lean` reader façade and applies Mongoose write guards; production credentials must additionally use MongoDB's read-only role.
