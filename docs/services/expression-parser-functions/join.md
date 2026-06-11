# join

Joins array elements into a string with a specified separator.

## Syntax

```
join(separator, array)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `separator` | String | The separator to place between elements |
| `array` | Array | The array of values to join |

## Returns

String - All array elements joined with the specified separator.

## Description

The `join` function combines all elements of an array into a single string, placing the specified separator between each element.

## Examples

### Basic Usage

```expression
Result = JOIN(["a", "b", "c"], ", ")
// Result: "a, b, c"
```

### With Data Array

```expression
// Join city names with semicolons
CityList = JOIN(FLATTEN(AppData.Cities.name), "; ")
// Result: "New York; Los Angeles; Chicago"
```

### Creating CSV Line

```expression
CSVLine = JOIN(DataRow, ",")
// Result: "value1,value2,value3"
```

### Path Building

```expression
FilePath = JOIN(PathParts, "/")
// Result: "home/user/documents"
```

## Use Cases

- **Display lists**: Format lists for display
- **CSV generation**: Build CSV lines
- **Path construction**: Build file paths
- **Report generation**: Format data for output

## Related Functions

- [joinraw](./joinraw.md) - Join without separator
- [concat](./concat.md) - Concatenate with spaces
- [flatten](./flatten.md) - Flatten nested arrays before joining

## Notes

- Separator is placed between elements only
- Empty arrays return empty string
- Uses the DataFormat service internally
- Converts all elements to strings
