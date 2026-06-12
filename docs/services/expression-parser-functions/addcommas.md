# addcommas

Comma-groups a numeric string for human reading, preserving the value
VERBATIM — no float round-trip, so arbitrary-precision strings group
intact. Compose with `tofixed` for decimal control.

## Syntax

```
addcommas(value)
```

## Returns

String (`"1234567.891"` → `"1,234,567.891"`). Non-numeric strings pass
through unchanged; missing values return `''`.

For KPI *inputs*, prefer the input-level `AddCommas: true` PictForm
option — this function is for solver-built strings (chart tooltips,
tabular cells): `Cell = ADDCOMMAS(TOFIXED(x, 1))`.
