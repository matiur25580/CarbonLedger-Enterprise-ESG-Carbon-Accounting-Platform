# Reduction planning workspace

The authenticated dashboard's **Reduction plans** navigation entry is backed by the tenant-scoped `/reductions` API.

## Target management

- OWNER and ADMIN members can create targets with a name, scope, baseline year, target year, baseline emissions in kg CO2e and a reduction percentage.
- The target threshold is baseline emissions multiplied by one minus the target percentage.
- Baseline values are manually supplied; the workspace does not infer a baseline from activity records or calculation runs.

## Initiative management

- OWNER, ADMIN and MEMBER roles can add initiatives to an existing target.
- Each initiative records an expected annual reduction in kg CO2e and optional start/end dates.
- Authorized members can move initiatives among PLANNED, IN_PROGRESS, COMPLETED and CANCELLED.
- The scenario API includes PLANNED, IN_PROGRESS and COMPLETED initiatives; CANCELLED initiatives are excluded.

## Scenario snapshots

- A user can save a named scenario snapshot for a target.
- The API sums included expected annual reductions, subtracts the sum from the manually entered baseline and floors projected emissions at zero.
- Each snapshot stores the assumptions and included initiative IDs and is immutable.
- The workspace displays the saved projected value and target threshold.

## Interpretation and limitations

Initiative reductions are planning estimates, not measured or assured outcomes. This initial model does not derive baselines from inventory history, apply initiative timelines, discount overlapping initiatives or validate reductions against measured activity data. Presentation summaries use JavaScript number formatting; persisted values and API calculations use decimal strings and database decimal arithmetic.