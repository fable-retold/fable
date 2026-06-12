# stringgetsegments

Splits a string into segments by a delimiter.

## Syntax

```
stringgetsegments(text, delimiter)
stringgetsegments(text, delimiter, "")

```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | String | The string to split |
| `delimiter` | String | The delimiter to split by |

## Returns

Array - Array of string segments.

## Description

The `stringgetsegments` function splits a string by a specified delimiter and returns an array of the resulting segments.

## Examples

### Basic Usage

```expression
Result = STRINGGETSEGMENTS("a,b,c,d,e", ",")
// Result: ["a", "b", "c", "d", "e"]
```

### Path Parsing

```expression
PathParts = STRINGGETSEGMENTS("/home/user/documents", "/")
// Result: ["", "home", "user", "documents"]
```

### Data Extraction

```expression
Fields = STRINGGETSEGMENTS(CSVLine, ",")
// Returns array of field values
```

### Get Specific Segment

```expression
// Get second segment
Segments = STRINGGETSEGMENTS(Data, ",")
SecondItem = Segments[1]
```

## Use Cases

- **CSV parsing**: Split delimited lines
- **Path processing**: Extract path components
- **Data parsing**: Split structured strings
- **Text processing**: Tokenize text

## Related Functions

- [stringcountsegments](./stringcountsegments.md) - Count segments
- [join](./join.md) - Reverse operation (join segments)
- [slice](./slice.md) - Get subset of segments

## Notes

- Returns array of strings
- Empty between delimiters creates empty string
- Uses the Utility service

## Enclosure handling

By default, segments inside enclosures (`{} [] () " '`) are not split —
and an UNBALANCED quote in the data jams the enclosure stack, silently
disabling splitting for the rest of the string. Pass `""` as the third
argument for a plain split with no enclosure handling.
