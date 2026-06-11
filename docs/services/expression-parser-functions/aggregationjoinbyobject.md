# aggregationjoinbyobject

Collects (joins) per-key string values from a set of objects — the
string-valued sibling of `aggregationhistogrambyobject`.

## Syntax

```
aggregationjoinbyobject(records, keyAddress, valueAddress, separator)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `records` | Array | The set of objects to group |
| `keyAddress` | String | Address of the grouping key on each object |
| `valueAddress` | String | Address of the value to collect |
| `separator` | String | Placed between collected values (default `,`) |

## Returns

Object - insertion-ordered `{ key: "v1<separator>v2..." }`. Keys appear in
first-seen order, so `objectkeystoarray` / `objectvaluestoarray` produce
aligned parallel arrays. Values join verbatim (no numeric coercion); rows
with an undefined/null key or value are skipped.

## Example

```
// rows: [{Day:'06-01', Docs:'900,901'}, {Day:'06-01', Docs:'900,902'}, {Day:'06-02', Docs:'903'}]
ByDay = AGGREGATIONJOINBYOBJECT(Rows, "Day", "Docs", ",")
// → { '06-01': '900,901,900,902', '06-02': '903' }

// Per-key DISTINCT counts (CSV set columns):
_csvs = OBJECTVALUESTOARRAY(AGGREGATIONJOINBYOBJECT(Rows, "Day", "Docs", ","))
PerDay = MAP VAR v FROM _csvs : COUNTSETELEMENTS(DISTRIBUTIONHISTOGRAM(STRINGGETSEGMENTS(v, ",")))
// → [3, 1]
```
