package opcua

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

// typeNames maps the OPC UA built-in data types a write can convert to.
// PLCnext types map as BOOL→Boolean, SINT→SByte, USINT/BYTE→Byte,
// INT→Int16, UINT/WORD→UInt16, DINT→Int32, UDINT/DWORD→UInt32,
// LINT→Int64, ULINT/LWORD→UInt64, REAL→Float, LREAL→Double, STRING→String.
var typeNames = map[uint32]string{
	id.Boolean: "Boolean", id.SByte: "SByte", id.Byte: "Byte",
	id.Int16: "Int16", id.UInt16: "UInt16", id.Int32: "Int32", id.UInt32: "UInt32",
	id.Int64: "Int64", id.UInt64: "UInt64", id.Float: "Float", id.Double: "Double",
	id.String: "String",
}

// intRanges holds the limits of the integer types converted via int64.
var intRanges = map[uint32][2]int64{
	id.SByte: {math.MinInt8, math.MaxInt8}, id.Byte: {0, math.MaxUint8},
	id.Int16: {math.MinInt16, math.MaxInt16}, id.UInt16: {0, math.MaxUint16},
	id.Int32: {math.MinInt32, math.MaxInt32}, id.UInt32: {0, math.MaxUint32},
	id.Int64: {math.MinInt64, math.MaxInt64},
}

// convertForType converts a written value (as decoded from JSON: float64,
// bool, string, …) to the Go type the OPC UA variant needs for dataType.
// It refuses values that would change on the way: fractions for integer
// types, out-of-range numbers, and numbers other than 0/1 for Boolean.
func convertForType(value any, dataType *ua.NodeID) (any, error) {
	if dataType == nil || dataType.Namespace() != 0 || dataType.Type() == ua.NodeIDTypeString {
		return nil, fmt.Errorf("unsupported data type %v", dataType)
	}
	typeID := dataType.IntID()
	name, ok := typeNames[typeID]
	if !ok {
		return nil, fmt.Errorf("unsupported data type %v", dataType)
	}
	fail := func(why string) error {
		return fmt.Errorf("cannot write %v (%T) to %s: %s", value, value, name, why)
	}

	switch typeID {
	case id.Boolean:
		switch v := value.(type) {
		case bool:
			return v, nil
		case string:
			b, err := strconv.ParseBool(strings.TrimSpace(v))
			if err != nil {
				return nil, fail("not true/false/1/0")
			}
			return b, nil
		}
		f, err := toFloat64(value)
		if err != nil || (f != 0 && f != 1) {
			return nil, fail("only 0 or 1")
		}
		return f == 1, nil

	case id.String:
		switch v := value.(type) {
		case string:
			return v, nil
		case bool:
			return strconv.FormatBool(v), nil
		}
		f, err := toFloat64(value)
		if err != nil {
			return nil, fail(err.Error())
		}
		return strconv.FormatFloat(f, 'g', -1, 64), nil

	case id.Float:
		f, err := toFloat64(value)
		if err != nil {
			return nil, fail(err.Error())
		}
		if math.Abs(f) > math.MaxFloat32 {
			return nil, fail("out of range")
		}
		return float32(f), nil

	case id.Double:
		f, err := toFloat64(value)
		if err != nil {
			return nil, fail(err.Error())
		}
		return f, nil

	case id.UInt64:
		u, err := toUint64(value)
		if err != nil {
			return nil, fail(err.Error())
		}
		return u, nil
	}

	// Signed and narrower unsigned integers.
	rng := intRanges[typeID]
	lo, hi := rng[0], rng[1]
	n, err := toInt64(value)
	if err != nil {
		return nil, fail(err.Error())
	}
	if n < lo || n > hi {
		return nil, fail(fmt.Sprintf("out of range %d..%d", lo, hi))
	}
	switch typeID {
	case id.SByte:
		return int8(n), nil
	case id.Byte:
		return uint8(n), nil
	case id.Int16:
		return int16(n), nil
	case id.UInt16:
		return uint16(n), nil
	case id.Int32:
		return int32(n), nil
	case id.UInt32:
		return uint32(n), nil
	default: // Int64
		return n, nil
	}
}

// toFloat64 accepts numbers, numeric strings and bools (as 0/1).
func toFloat64(value any) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case float32:
		return float64(v), nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case json.Number:
		return v.Float64()
	case bool:
		if v {
			return 1, nil
		}
		return 0, nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return 0, fmt.Errorf("not a number")
		}
		return f, nil
	}
	return 0, fmt.Errorf("not a number")
}

// toInt64 accepts whole numbers only; strings are parsed exactly so large
// Int64 values keep every digit.
func toInt64(value any) (int64, error) {
	if s, ok := value.(string); ok {
		if n, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64); err == nil {
			return n, nil
		}
	}
	f, err := toFloat64(value)
	if err != nil {
		return 0, err
	}
	if f != math.Trunc(f) || math.IsInf(f, 0) || math.IsNaN(f) {
		return 0, fmt.Errorf("not a whole number")
	}
	if f < math.MinInt64 || f >= math.MaxInt64 {
		return 0, fmt.Errorf("out of range")
	}
	return int64(f), nil
}

// toUint64 is toInt64 for UInt64.
func toUint64(value any) (uint64, error) {
	if s, ok := value.(string); ok {
		if n, err := strconv.ParseUint(strings.TrimSpace(s), 10, 64); err == nil {
			return n, nil
		}
	}
	f, err := toFloat64(value)
	if err != nil {
		return 0, err
	}
	if f != math.Trunc(f) || math.IsInf(f, 0) || math.IsNaN(f) {
		return 0, fmt.Errorf("not a whole number")
	}
	if f < 0 || f >= math.MaxUint64 {
		return 0, fmt.Errorf("out of range 0..%d", uint64(math.MaxUint64))
	}
	return uint64(f), nil
}
