# sorthistogram

Sorts a histogram object by its values, ascending.

## Syntax

```
sorthistogram(histogram)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `histogram` | Object | The histogram object to sort |

## Returns

Object - the same `{ key: value }` shape with keys re-inserted in
ascending-value order (NOT an array of pairs). There is no descending
flag.

## Descending / top-N recipe

Sort is ascending-only and `MAP` cannot index pair structures, so for a
"top N by count" presentation: carry a NEGATED measure alongside the real
one, sort ascending over the negated values, then flip signs back:

```
NegSorted = SORTHISTOGRAM(AGGREGATIONHISTOGRAMBYOBJECT(Rows, "Material", "NegCount"))
TopLabels = OBJECTKEYSTOARRAY(NegSorted)
_negs = OBJECTVALUESTOARRAY(NegSorted)
TopCounts = MAP VAR v FROM _negs : 0 - v
```
