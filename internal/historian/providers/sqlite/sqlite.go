// Package sqlite registers the SQLite historian provider.
package sqlite

import (
	"github.com/Speth12/speths-screens/internal/historian"
)

func init() {
	historian.RegisterProvider("sqlite", func(dsn string) (historian.Provider, error) {
		return historian.Open(dsn)
	})
}
