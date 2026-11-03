// Package drivers defines the ProtocolDriver contract.
//
// Drivers MUST push every value into the channel given to Connect and never
// touch the UI or store state outside that channel.
package drivers

import (
	"context"

	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

// TagDefinition is a tag discovered by browsing a datasource.
type TagDefinition struct {
	Path        string
	DataType    string
	Description string
	Writable    bool
}

// DriverConfig is the connection config passed to Connect.
//
// Field meanings depend on the driver:
//
//	OPC UA: Endpoint (opc.tcp://...), Username, Password,
//	        Extra["securityMode"], Extra["securityPolicy"]
//	MQTT:   Endpoint (mqtt://host:port or mqtts://...), Username, Password,
//	        Extra["clientId"]
//	Modbus: Endpoint (host:port), Extra["slaveId"]
//	REST:   Endpoint (https://host), Extra["basePath"], Extra["bearerToken"]
type DriverConfig struct {
	Endpoint string
	Username string
	Password string
	Extra    map[string]string
}

// DriverStatus is returned by Status(). Safe to call from any goroutine.
type DriverStatus struct {
	Connected bool   `json:"connected"`
	LastError string `json:"lastError,omitempty"`
	TagCount  int    `json:"tagCount"`
}

// ProtocolDriver is implemented by every driver instance.
//
// Lifecycle: Connect → SetTags (any number of times) → (Write) → Disconnect.
// A driver runs one poll loop (or one set of subscriptions) from Connect to
// Disconnect; SetTags only changes what it reads.
// Drivers own their own reconnect with exponential backoff.
type ProtocolDriver interface {
	// ID returns the driver identifier, e.g. "opcua", "mbtcp", "mqtt", "rest".
	ID() string

	// Connect establishes the connection and starts the driver's poll loop.
	// Returns when the initial connect succeeds or fails. Drivers retry
	// internally after this returns. Every value is pushed into out, which
	// must stay open until Disconnect returns; a nil out discards values.
	Connect(ctx context.Context, cfg DriverConfig, out chan<- tagstore.TagUpdate) error

	// Disconnect cleanly shuts down the driver and any background goroutines.
	Disconnect() error

	// Browse returns all discoverable tags after Connect.
	Browse(ctx context.Context) ([]TagDefinition, error)

	// SetTags replaces the set of paths the driver reads. It is idempotent:
	// the same set (in any order, with duplicates) changes nothing. An empty
	// set keeps the driver connected but idle. Returns quickly; values for
	// new paths arrive from the next poll.
	SetTags(paths []string) error

	// Write pushes a value to the remote tag.
	Write(ctx context.Context, path string, value any) error

	// Status returns the current connection state.
	Status() DriverStatus
}
