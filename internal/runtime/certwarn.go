package runtime

import (
	"fmt"
	"strings"

	"github.com/Speth12/Speths_Screens/internal/project"
)

// certWarnings lists the datasources that talk to a server over an
// encrypted connection without checking its certificate, so anyone between
// the runtime and the device could pose as it and collect its login.
func certWarnings(p *project.Project) []string {
	var out []string
	for _, ds := range p.Datasources {
		c := ds.Config
		off := c.CERTCheck == nil || *c.CERTCheck == project.Off
		endpoint := ""
		if c.Endpoint != nil {
			endpoint = strings.ToLower(*c.Endpoint)
		}
		var unchecked bool
		switch ds.Type {
		case project.REST:
			unchecked = off && strings.HasPrefix(endpoint, "https://")
		case project.Mqtt:
			// Unset means trusted roots for MQTT; only an explicit off is unchecked.
			explicitOff := c.CERTCheck != nil && *c.CERTCheck == project.Off
			unchecked = explicitOff && (strings.HasPrefix(endpoint, "ssl://") || strings.HasPrefix(endpoint, "tls://") || strings.HasPrefix(endpoint, "mqtts://"))
		case project.Opcua:
			unchecked = off && (c.SecurityMode == nil || *c.SecurityMode != project.SecurityModeNone)
		}
		if unchecked {
			out = append(out, fmt.Sprintf("datasource %s does not check the server's certificate (certCheck off); pin it in the IDE", ds.ID))
		}
	}
	return out
}
