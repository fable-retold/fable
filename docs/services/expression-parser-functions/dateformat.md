# dateformat

Formats a date value with dayjs format tokens, rendered in a timezone.

## Syntax

```
dateformat(value, format)
dateformat(value, format, timezone)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | String/Number/Date | ISO string, epoch milliseconds, or Date |
| `format` | String | dayjs format tokens (e.g. `YYYY-MM-DD h:mm A`); default `YYYY-MM-DD HH:mm:ss` |
| `timezone` | String | Optional IANA zone override (e.g. `America/Chicago`) |

## Returns

String - the formatted date, or `undefined` for unparseable values.

## Timezone resolution

The explicit parameter wins. Without it, the dayjs **default timezone**
applies — the host application's configured zone set via
`fable.Dates.dayJS.tz.setDefault(...)` (pict applications set this to the
document's project timezone). With no configured default, the host's local
zone is used. The parameter exists so individual expressions can diverge
from the configured norm, not to replace it.

## Example

```
DATEFORMAT(Record.SampleDate, "MMM D, YYYY")                       // configured default zone
DATEFORMAT(Record.SampleDate, "YYYY-MM-DD h:mm A", "America/Chicago")  // explicit override
```
