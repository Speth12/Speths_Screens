package modbus

import (
	"math"
	"testing"
)

func TestParseTagCoil(t *testing.T) {
	pt, err := parseTag("coil:5")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if pt.tbl != tableCoil || pt.addr != 5 || pt.dtype != dtypeBool {
		t.Errorf("got %+v", pt)
	}
}

func TestParseTagHoldingDefault(t *testing.T) {
	pt, err := parseTag("holding:100")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if pt.dtype != dtypeUint16 || pt.regSpan != 1 {
		t.Errorf("got %+v", pt)
	}
}

func TestParseTagFloat32(t *testing.T) {
	pt, err := parseTag("holding:200:float32")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if pt.regSpan != 2 || pt.dtype != dtypeFloat32 {
		t.Errorf("got %+v", pt)
	}
}

func TestParseTagInvalid(t *testing.T) {
	cases := []string{
		"",
		"xx:1",
		"holding:abc",
		"holding:1:bogus",
		"coil",
	}
	for _, c := range cases {
		if _, err := parseTag(c); err == nil {
			t.Errorf("expected error for %q", c)
		}
	}
}

func TestDecodeRegs(t *testing.T) {
	if got := decodeRegs([]uint16{0xFFFF}, dtypeUint16); got.(uint16) != 0xFFFF {
		t.Errorf("uint16: %v", got)
	}
	if got := decodeRegs([]uint16{0xFFFF}, dtypeInt16); got.(int16) != -1 {
		t.Errorf("int16: %v", got)
	}
	if got := decodeRegs([]uint16{0x1234, 0x5678}, dtypeUint32); got.(uint32) != 0x12345678 {
		t.Errorf("uint32: %v", got)
	}
	bits := math.Float32bits(3.14)
	if got := decodeRegs([]uint16{uint16(bits >> 16), uint16(bits)}, dtypeFloat32); got.(float32) != 3.14 {
		t.Errorf("float32: %v", got)
	}
}

func TestEncodeRegsRoundTrip(t *testing.T) {
	regs, err := encodeRegs(float32(2.5), dtypeFloat32)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	got := decodeRegs(regs, dtypeFloat32).(float32)
	if got != 2.5 {
		t.Errorf("roundtrip float32: %v", got)
	}

	regs, err = encodeRegs(uint32(0xDEADBEEF), dtypeUint32)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if got := decodeRegs(regs, dtypeUint32).(uint32); got != 0xDEADBEEF {
		t.Errorf("roundtrip uint32: %v", got)
	}
}
