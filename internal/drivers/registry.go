package drivers

import (
	"fmt"

	"github.com/Speth12/speths-screens/internal/tagstore"
)

// BuildCtx carries dependencies a driver factory may need.
// Most drivers ignore Store; the virtual driver uses it.
type BuildCtx struct {
	Store *tagstore.TagStore
}

// DriverFactory creates a new ProtocolDriver instance from build context.
type DriverFactory func(ctx BuildCtx) ProtocolDriver

var driverRegistry = map[string]DriverFactory{}

// Register adds a factory for a driver type string. Call from package init().
func Register(driverType string, f DriverFactory) {
	driverRegistry[driverType] = f
}

// Build creates a new driver for the given type. Returns an error if no
// factory is registered — check that the driver package is blank-imported.
func Build(driverType string, ctx BuildCtx) (ProtocolDriver, error) {
	f, ok := driverRegistry[driverType]
	if !ok {
		return nil, fmt.Errorf("unknown driver type %q — is its package imported?", driverType)
	}
	return f(ctx), nil
}

// RegisteredTypes returns the set of registered driver type strings.
func RegisteredTypes() []string {
	out := make([]string, 0, len(driverRegistry))
	for k := range driverRegistry {
		out = append(out, k)
	}
	return out
}
