package rest

import "crypto/tls"

func insecureTLSConfig() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true} //nolint:gosec // explicit opt-in via Extra["insecure"]
}
