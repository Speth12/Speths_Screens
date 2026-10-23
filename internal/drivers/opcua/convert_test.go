package opcua

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync"
	"testing"

	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

func TestConvertForType(t *testing.T) {
	tests := []struct {
		name    string
		value   any
		typeID  uint32
		want    any
		wantErr string
	}{
		// REAL / LREAL
		{"number to Float", 76.0, id.Float, float32(76), ""},
		{"string to Float", " 1.5 ", id.Float, float32(1.5), ""},
		{"bool to Float", true, id.Float, float32(1), ""},
		{"too big for Float", 1e40, id.Float, nil, "out of range"},
		{"number to Double", 1.25, id.Double, 1.25, ""},
		{"text to Double", "abc", id.Double, nil, "not a number"},
		// INT family
		{"number to Int16", 300.0, id.Int16, int16(300), ""},
		{"negative to Int16", -5.0, id.Int16, int16(-5), ""},
		{"fraction to Int16", 1.5, id.Int16, nil, "not a whole number"},
		{"too big for Int16", 40000.0, id.Int16, nil, "out of range"},
		{"negative to UInt16", -1.0, id.UInt16, nil, "out of range"},
		{"number to Byte", 255.0, id.Byte, uint8(255), ""},
		{"too big for Byte", 256.0, id.Byte, nil, "out of range"},
		{"number to SByte", -128.0, id.SByte, int8(-128), ""},
		{"number to Int32", 70000.0, id.Int32, int32(70000), ""},
		{"number to UInt32", 4294967295.0, id.UInt32, uint32(4294967295), ""},
		{"large string to Int64", "9007199254740993", id.Int64, int64(9007199254740993), ""},
		{"large string to UInt64", "18446744073709551615", id.UInt64, uint64(math.MaxUint64), ""},
		{"negative to UInt64", -1.0, id.UInt64, nil, "out of range"},
		{"string to Int32", "42", id.Int32, int32(42), ""},
		{"bool to Int16", true, id.Int16, int16(1), ""},
		// BOOL
		{"bool to Boolean", false, id.Boolean, false, ""},
		{"1 to Boolean", 1.0, id.Boolean, true, ""},
		{"0 to Boolean", 0.0, id.Boolean, false, ""},
		{"2 to Boolean", 2.0, id.Boolean, nil, "only 0 or 1"},
		{"string to Boolean", "true", id.Boolean, true, ""},
		{"bad string to Boolean", "yes", id.Boolean, nil, "not true/false/1/0"},
		// STRING
		{"string to String", "hello", id.String, "hello", ""},
		{"number to String", 12.5, id.String, "12.5", ""},
		{"bool to String", true, id.String, "true", ""},
		// unsupported
		{"DateTime", 1.0, id.DateTime, nil, "unsupported data type"},
		{"null value", nil, id.Int16, nil, "not a number"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := convertForType(tc.value, ua.NewNumericNodeID(0, tc.typeID))
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %v, want it to contain %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %v (%T), want %v (%T)", got, got, tc.want, tc.want)
			}
		})
	}
}

func TestConvertRejectsNonBuiltinTypes(t *testing.T) {
	for _, dt := range []*ua.NodeID{
		nil,
		ua.NewNumericNodeID(3, id.Float), // same number, other namespace
		ua.NewStringNodeID(6, "Arp.Plc.MyStruct"), // a PLC structure
	} {
		if _, err := convertForType(1.0, dt); err == nil {
			t.Errorf("%v: expected an error", dt)
		}
	}
}

// fakeTypedServer answers DataType reads from types and records writes.
type fakeTypedServer struct {
	mu        sync.Mutex
	types     map[string]*ua.NodeID
	typeReads int
	written   []*ua.Variant
	status    ua.StatusCode
}

func (f *fakeTypedServer) read(_ context.Context, req *ua.ReadRequest) (*ua.ReadResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	res := &ua.ReadResponse{}
	for _, n := range req.NodesToRead {
		if n.AttributeID != ua.AttributeIDDataType {
			return nil, fmt.Errorf("unexpected attribute %v", n.AttributeID)
		}
		f.typeReads++
		dt, ok := f.types[n.NodeID.String()]
		if !ok {
			res.Results = append(res.Results, &ua.DataValue{Status: ua.StatusBadNodeIDUnknown})
			continue
		}
		res.Results = append(res.Results, &ua.DataValue{Value: ua.MustVariant(dt), Status: ua.StatusOK})
	}
	return res, nil
}

func (f *fakeTypedServer) write(_ context.Context, req *ua.WriteRequest) (*ua.WriteResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.written = append(f.written, req.NodesToWrite[0].Value.Value)
	status := f.status
	if status == 0 {
		status = ua.StatusOK
	}
	return &ua.WriteResponse{Results: []ua.StatusCode{status}}, nil
}

func newTypedDriver(f *fakeTypedServer) *Driver {
	d := New()
	d.read = f.read
	d.write = f.write
	return d
}

func TestWriteSendsTheNodesType(t *testing.T) {
	const temp = "ns=6;s=Arp.Plc.Eclr/HMI_SIM_Temp"
	f := &fakeTypedServer{types: map[string]*ua.NodeID{
		temp:                         ua.NewNumericNodeID(0, id.Float),
		"ns=6;s=Arp.Plc.Eclr/iCount": ua.NewNumericNodeID(0, id.Int16),
		"ns=6;s=Arp.Plc.Eclr/xRun":   ua.NewNumericNodeID(0, id.Boolean),
	}}
	d := newTypedDriver(f)
	tests := []struct {
		path  string
		value any
		want  any
	}{
		{temp, 76.0, float32(76)},
		{"ns=6;s=Arp.Plc.Eclr/iCount", 7.0, int16(7)},
		{"ns=6;s=Arp.Plc.Eclr/xRun", true, true},
	}
	for _, tc := range tests {
		if err := d.Write(context.Background(), tc.path, tc.value); err != nil {
			t.Fatalf("Write %s: %v", tc.path, err)
		}
		got := f.written[len(f.written)-1].Value()
		if got != tc.want {
			t.Errorf("%s: sent %v (%T), want %v (%T)", tc.path, got, got, tc.want, tc.want)
		}
	}

	// The data type is read once per node, then cached.
	if err := d.Write(context.Background(), temp, 75.0); err != nil {
		t.Fatal(err)
	}
	if f.typeReads != 3 {
		t.Errorf("DataType read %d times for 3 nodes and 4 writes, want 3", f.typeReads)
	}
	// Disconnect clears the cache.
	_ = d.Disconnect()
	if err := d.Write(context.Background(), temp, 75.0); err != nil {
		t.Fatal(err)
	}
	if f.typeReads != 4 {
		t.Errorf("DataType read %d times after Disconnect, want 4", f.typeReads)
	}
}

func TestWriteErrors(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		value   any
		status  ua.StatusCode
		wantErr string
	}{
		{"value cannot be converted", "ns=6;s=A", 1.5, 0, "not a whole number"},
		{"node unknown", "ns=6;s=Missing", 1.0, 0, "read data type"},
		{"server rejects the write", "ns=6;s=A", 1.0, ua.StatusBadUserAccessDenied, "write status"},
		{"bad node id", "ns=x;s=A", 1.0, 0, "bad node id"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			f := &fakeTypedServer{
				types:  map[string]*ua.NodeID{"ns=6;s=A": ua.NewNumericNodeID(0, id.Int16)},
				status: tc.status,
			}
			err := newTypedDriver(f).Write(context.Background(), tc.path, tc.value)
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("err = %v, want it to contain %q", err, tc.wantErr)
			}
		})
	}
}
