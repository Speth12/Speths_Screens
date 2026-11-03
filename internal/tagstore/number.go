package tagstore

// Number reads a tag value as a float64. Drivers deliver numbers in many Go
// types: OPC UA gives PLC integers in their own sizes (SINT int8, INT int16,
// BYTE uint8, WORD uint16, DWORD uint32, ...), JSON gives float64. Booleans
// count as 0 and 1. Anything else (text, nil) is not a number.
func Number(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int8:
		return float64(x), true
	case int16:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint:
		return float64(x), true
	case uint8:
		return float64(x), true
	case uint16:
		return float64(x), true
	case uint32:
		return float64(x), true
	case uint64:
		return float64(x), true
	case bool:
		if x {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}
