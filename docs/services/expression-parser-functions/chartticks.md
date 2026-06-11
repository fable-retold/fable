# chartticks

Computes readable chart axis tick labels from a dense category-axis value
set. Returns an array of the SAME LENGTH as the input — labels kept only
at chosen tick positions, `''` elsewhere — so it drops directly into a
chart's labels array with data alignment preserved.

## Syntax

```
chartticks(values)
chartticks(values, maximumTicks)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `values` | Array | The full label/value array (one entry per data point) |
| `maximumTicks` | Number | Tick budget; default 12, clamped 2–100 |

## Returns

Array of strings, same length as the input.

`chartticks` is a projection of [`setdensity`](setdensity.md) — use that
directly when you need boundary indices/values (HTML layouts, group
headers) instead of a chart-shaped sparse array.

## Behavior by value type

- **Date-like sets** (every value parses as a date and is not a plain
  number): ticks snap to calendar boundaries, using the finest unit —
  day, week, month, quarter, year — whose boundary count fits the budget.
  Kept labels are reformatted at the unit's natural grain (`MMM D`,
  `MMM YYYY`, `[Q]Q YYYY`, `YYYY`). If even year boundaries overflow the
  budget, boundaries are strided.
- **Numbers and plain strings**: uniform positional stride.
- Sets at or under the budget pass through unchanged.

## Example

```
// Chart descriptor — 8 years of daily buckets, readable axis:
"ChartLabelsSolver": "CHARTTICKS(WalbecDaily.BucketLabel, 12)"
// → ['2019', '', '', ..., '2020', '', ...]
```
