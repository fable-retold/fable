# setdensity

Analyzes the density of an ordered value set and returns natural boundary
positions fitting a budget — the generic core for any "too many labels"
presentation problem: chart axes, HTML group headers, timeline scrubbers.
`chartticks` is the chart-shaped projection of this function.

## Syntax

```
setdensity(values)
setdensity(values, maximumBoundaries)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `values` | Array | Ordered values, one per position |
| `maximumBoundaries` | Number | Boundary budget; default 12, clamped 2–100 |

## Returns

```
{
  SetType: 'date' | 'number' | 'ordinal',
  Unit: 'month' | 'step:50' | 'position' | ...,
  Boundaries: [ { Index, Value, Label }, ... ]
}
```

## Domain handling

- **Date-like sets**: boundaries where values cross calendar units, using
  the finest unit (day → week → month → quarter → year) fitting the
  budget; `Label` formatted at the unit's grain (`MMM D`, `MMM YYYY`,
  `[Q]Q YYYY`, `YYYY`).
- **Numeric sets**: boundaries where values cross multiples of a nice
  step (1 / 2 / 2.5 / 5 × 10^k) chosen from the value range; `Label` is
  the crossed multiple.
- **Ordinal (everything else)**: uniform positional stride.

Assumes ordered input (it analyzes a sequence); non-monotonic numeric
data that crosses steps too often degrades to ordinal handling.

## Example

```
D = SETDENSITY(Rows.SampleDate, 12)
// → { SetType: 'date', Unit: 'month',
//     Boundaries: [ {Index: 0, Value: '2026-01-01', Label: 'Jan 2026'},
//                   {Index: 31, Value: '2026-02-01', Label: 'Feb 2026'}, ... ] }
// Use Index for row-group header placement, Label for the header text.
```
