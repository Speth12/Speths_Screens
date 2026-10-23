// Package modbus implements ProtocolDriver for Modbus TCP via simonvetter/modbus.
//
// Tag path format: <table>:<address>[:<datatype>]
//
//	coil:0                    bool — read/write
//	discrete:5                bool — read-only
//	holding:100               uint16 (default datatype) — read/write
//	holding:100:int16         int16
//	holding:100:uint32        uint32 (consumes 100..101, big endian)
//	holding:100:float32       float32 (IEEE 754, consumes 100..101)
//	input:50                  uint16 — read-only
//	input:50:int32            int32
package modbus

import (
	"context"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Speth12/Speths_Screens/internal/drivers"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
	mb "github.com/simonvetter/modbus"
)

const (
	driverID    = "mbtcp"
	pollDefault = 500 * time.Millisecond
)

// table identifies one of the four Modbus address spaces.
type table string

const (
	tableCoil     table = "coil"
	tableDiscrete table = "discrete"
	tableHolding  table = "holding"
	tableInput    table = "input"
)

// dtype is the wire interpretation for register reads.
type dtype string

const (
	dtypeBool    dtype = "bool"
	dtypeUint16  dtype = "uint16"
	dtypeInt16   dtype = "int16"
	dtypeUint32  dtype = "uint32"
	dtypeInt32   dtype = "int32"
	dtypeFloat32 dtype = "float32"
)

// parsedTag is the decoded form of a tag path.
type parsedTag struct {
	tbl     table
	addr    uint16
	dtype   dtype
	regSpan uint16 // number of 16-bit registers consumed
}

// Driver implements drivers.ProtocolDriver.
type Driver struct {
	mu        sync.Mutex
	client    *mb.ModbusClient
	pollEvery time.Duration
	stopCh    chan struct{}
	wg        sync.WaitGroup

	connected atomic.Bool
	lastErr   atomic.Pointer[string]
	tagCount  atomic.Int32
}

// New returns an unconnected driver.
func New() *Driver { return &Driver{pollEvery: pollDefault} }

func (d *Driver) ID() string { return driverID }

// Connect dials the Modbus TCP slave.
//
// cfg.Endpoint:        host:port (defaults to :502 if no port)
// cfg.Extra["slaveId"]: unit/slave ID (default 1)
func (d *Driver) Connect(ctx context.Context, cfg drivers.DriverConfig) error {
	if cfg.Endpoint == "" {
		return fmt.Errorf("modbus: endpoint is required")
	}
	url := cfg.Endpoint
	if !strings.Contains(url, "://") {
		url = "tcp://" + url
	}
	if !strings.Contains(stripScheme(url), ":") {
		url = url + ":502"
	}

	slaveID := uint8(1)
	if v, ok := cfg.Extra["slaveId"]; ok && v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return fmt.Errorf("modbus: bad slaveId %q: %w", v, err)
		}
		slaveID = uint8(n)
	}

	c, err := mb.NewClient(&mb.ClientConfiguration{
		URL:     url,
		Timeout: 2 * time.Second,
	})
	if err != nil {
		return d.fail(fmt.Errorf("NewClient: %w", err))
	}
	if err = c.Open(); err != nil {
		return d.fail(fmt.Errorf("Open: %w", err))
	}
	c.SetUnitId(slaveID)

	d.mu.Lock()
	d.client = c
	d.stopCh = make(chan struct{})
	d.mu.Unlock()
	d.connected.Store(true)
	d.lastErr.Store(strPtr(""))
	log.Printf("[DRIVER] modbus: connected to %s slave=%d", url, slaveID)
	return nil
}

func (d *Driver) Disconnect() error {
	d.mu.Lock()
	c := d.client
	d.client = nil
	if d.stopCh != nil {
		close(d.stopCh)
		d.stopCh = nil
	}
	d.mu.Unlock()
	d.wg.Wait()
	d.connected.Store(false)
	if c != nil {
		return c.Close()
	}
	return nil
}

// Browse returns nothing — Modbus has no address-space discovery.
// Tags are configured externally via the project file.
func (d *Driver) Browse(ctx context.Context) ([]drivers.TagDefinition, error) {
	return nil, nil
}

// Subscribe starts a polling goroutine that reads each path every pollEvery
// and pushes updates into ch. Stops when ctx is cancelled or Disconnect is called.
func (d *Driver) Subscribe(ctx context.Context, paths []string, ch chan<- tagstore.TagUpdate) error {
	if len(paths) == 0 {
		return fmt.Errorf("modbus: no paths to subscribe")
	}

	parsed := make([]parsedTag, 0, len(paths))
	for _, p := range paths {
		pt, err := parseTag(p)
		if err != nil {
			log.Printf("[DRIVER] modbus: bad tag %q: %v — skipping", p, err)
			continue
		}
		parsed = append(parsed, pt)
		log.Printf("[DRIVER] modbus: subscribed %s", p)
	}
	if len(parsed) == 0 {
		return fmt.Errorf("modbus: no valid tags to subscribe")
	}
	d.tagCount.Store(int32(len(parsed)))

	d.mu.Lock()
	stop := d.stopCh
	d.mu.Unlock()
	if stop == nil {
		return fmt.Errorf("modbus: not connected")
	}

	d.wg.Add(1)
	go d.pollLoop(ctx, stop, parsed, paths, ch)
	return nil
}

func (d *Driver) pollLoop(ctx context.Context, stop <-chan struct{}, parsed []parsedTag, origPaths []string, out chan<- tagstore.TagUpdate) {
	defer d.wg.Done()
	tick := time.NewTicker(d.pollEvery)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-tick.C:
			c := d.getClient()
			if c == nil {
				return
			}
			for i, pt := range parsed {
				val, quality := d.readOne(c, pt)
				select {
				case out <- tagstore.TagUpdate{
					Path: origPaths[i],
					State: tagstore.TagState{
						Value:   val,
						Quality: quality,
						TS:      time.Now().UnixNano(),
					},
				}:
				default:
				}
			}
		}
	}
}

func (d *Driver) readOne(c *mb.ModbusClient, pt parsedTag) (any, string) {
	switch pt.tbl {
	case tableCoil:
		v, err := c.ReadCoils(pt.addr, 1)
		if err != nil || len(v) == 0 {
			return nil, "Bad"
		}
		return v[0], "Good"
	case tableDiscrete:
		v, err := c.ReadDiscreteInputs(pt.addr, 1)
		if err != nil || len(v) == 0 {
			return nil, "Bad"
		}
		return v[0], "Good"
	case tableHolding:
		regs, err := c.ReadRegisters(pt.addr, pt.regSpan, mb.HOLDING_REGISTER)
		if err != nil {
			return nil, "Bad"
		}
		return decodeRegs(regs, pt.dtype), "Good"
	case tableInput:
		regs, err := c.ReadRegisters(pt.addr, pt.regSpan, mb.INPUT_REGISTER)
		if err != nil {
			return nil, "Bad"
		}
		return decodeRegs(regs, pt.dtype), "Good"
	}
	return nil, "Bad"
}

// Write supports coils and holding registers.
func (d *Driver) Write(ctx context.Context, path string, value any) error {
	c := d.getClient()
	if c == nil {
		return fmt.Errorf("modbus: not connected")
	}
	pt, err := parseTag(path)
	if err != nil {
		return err
	}
	switch pt.tbl {
	case tableCoil:
		b, ok := value.(bool)
		if !ok {
			return fmt.Errorf("modbus: coil write needs bool, got %T", value)
		}
		return c.WriteCoil(pt.addr, b)
	case tableHolding:
		regs, err := encodeRegs(value, pt.dtype)
		if err != nil {
			return err
		}
		return c.WriteRegisters(pt.addr, regs)
	default:
		return fmt.Errorf("modbus: %s is read-only", pt.tbl)
	}
}

func (d *Driver) Status() drivers.DriverStatus {
	last := ""
	if p := d.lastErr.Load(); p != nil {
		last = *p
	}
	return drivers.DriverStatus{
		Connected: d.connected.Load(),
		LastError: last,
		TagCount:  int(d.tagCount.Load()),
	}
}

func (d *Driver) getClient() *mb.ModbusClient {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.client
}

func (d *Driver) fail(err error) error {
	s := err.Error()
	d.lastErr.Store(&s)
	return err
}

// --- helpers ---

func parseTag(path string) (parsedTag, error) {
	parts := strings.Split(path, ":")
	if len(parts) < 2 {
		return parsedTag{}, fmt.Errorf("expected <table>:<addr>[:<type>], got %q", path)
	}
	addr, err := strconv.ParseUint(parts[1], 10, 16)
	if err != nil {
		return parsedTag{}, fmt.Errorf("addr: %w", err)
	}
	tbl := table(parts[0])
	pt := parsedTag{tbl: tbl, addr: uint16(addr), dtype: dtypeUint16, regSpan: 1}

	switch tbl {
	case tableCoil, tableDiscrete:
		pt.dtype = dtypeBool
		pt.regSpan = 0
	case tableHolding, tableInput:
		if len(parts) >= 3 {
			pt.dtype = dtype(parts[2])
		}
		switch pt.dtype {
		case dtypeUint16, dtypeInt16:
			pt.regSpan = 1
		case dtypeUint32, dtypeInt32, dtypeFloat32:
			pt.regSpan = 2
		default:
			return parsedTag{}, fmt.Errorf("unsupported dtype %q", pt.dtype)
		}
	default:
		return parsedTag{}, fmt.Errorf("unknown table %q (want coil|discrete|holding|input)", tbl)
	}
	return pt, nil
}

func decodeRegs(regs []uint16, dt dtype) any {
	switch dt {
	case dtypeUint16:
		if len(regs) >= 1 {
			return regs[0]
		}
	case dtypeInt16:
		if len(regs) >= 1 {
			return int16(regs[0])
		}
	case dtypeUint32:
		if len(regs) >= 2 {
			return uint32(regs[0])<<16 | uint32(regs[1])
		}
	case dtypeInt32:
		if len(regs) >= 2 {
			return int32(uint32(regs[0])<<16 | uint32(regs[1]))
		}
	case dtypeFloat32:
		if len(regs) >= 2 {
			return math.Float32frombits(uint32(regs[0])<<16 | uint32(regs[1]))
		}
	}
	return nil
}

func encodeRegs(v any, dt dtype) ([]uint16, error) {
	switch dt {
	case dtypeUint16:
		n, err := toUint64(v)
		return []uint16{uint16(n)}, err
	case dtypeInt16:
		n, err := toInt64(v)
		return []uint16{uint16(int16(n))}, err
	case dtypeUint32:
		n, err := toUint64(v)
		if err != nil {
			return nil, err
		}
		return []uint16{uint16(n >> 16), uint16(n)}, nil
	case dtypeInt32:
		n, err := toInt64(v)
		if err != nil {
			return nil, err
		}
		u := uint32(int32(n))
		return []uint16{uint16(u >> 16), uint16(u)}, nil
	case dtypeFloat32:
		f, err := toFloat64(v)
		if err != nil {
			return nil, err
		}
		u := math.Float32bits(float32(f))
		return []uint16{uint16(u >> 16), uint16(u)}, nil
	}
	return nil, fmt.Errorf("unsupported dtype %q", dt)
}

func toUint64(v any) (uint64, error) {
	switch x := v.(type) {
	case uint, uint16, uint32, uint64, int, int16, int32, int64:
		return reflectToUint(x), nil
	case float64:
		return uint64(x), nil
	case float32:
		return uint64(x), nil
	}
	return 0, fmt.Errorf("cannot convert %T to uint", v)
}

func toInt64(v any) (int64, error) {
	switch x := v.(type) {
	case int, int16, int32, int64:
		return reflectToInt(x), nil
	case uint, uint16, uint32, uint64:
		return int64(reflectToUint(x)), nil
	case float64:
		return int64(x), nil
	case float32:
		return int64(x), nil
	}
	return 0, fmt.Errorf("cannot convert %T to int", v)
}

func toFloat64(v any) (float64, error) {
	switch x := v.(type) {
	case float32:
		return float64(x), nil
	case float64:
		return x, nil
	case int, int16, int32, int64:
		return float64(reflectToInt(x)), nil
	case uint, uint16, uint32, uint64:
		return float64(reflectToUint(x)), nil
	}
	return 0, fmt.Errorf("cannot convert %T to float", v)
}

func reflectToUint(v any) uint64 {
	switch x := v.(type) {
	case uint:
		return uint64(x)
	case uint16:
		return uint64(x)
	case uint32:
		return uint64(x)
	case uint64:
		return x
	case int:
		return uint64(x)
	case int16:
		return uint64(x)
	case int32:
		return uint64(x)
	case int64:
		return uint64(x)
	}
	return 0
}

func reflectToInt(v any) int64 {
	switch x := v.(type) {
	case int:
		return int64(x)
	case int16:
		return int64(x)
	case int32:
		return int64(x)
	case int64:
		return x
	case uint:
		return int64(x)
	case uint16:
		return int64(x)
	case uint32:
		return int64(x)
	case uint64:
		return int64(x)
	}
	return 0
}

func stripScheme(url string) string {
	if i := strings.Index(url, "://"); i >= 0 {
		return url[i+3:]
	}
	return url
}

func strPtr(s string) *string { return &s }

func init() {
	drivers.Register("mbtcp", func(_ drivers.BuildCtx) drivers.ProtocolDriver { return New() })
}
