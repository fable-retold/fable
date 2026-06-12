# trim / rtrim / ltrim

Trim whitespace from a value (stringified first). `trim` = both ends,
`rtrim` = trailing only (e.g. SQL `CHAR(n)` padding), `ltrim` = leading.

## Syntax

```
trim(value)    rtrim(value)    ltrim(value)
```

## Returns

String. Missing/null values return `''`. MAP-body safe:
`Clean = MAP VAR v FROM Labels : RTRIM(v)`.
