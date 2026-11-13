package project

// v6ToV7 drops the project's operator PIN. It was compared in the operator's browser, so it never
// protected anything; logins (security mode login) and the view and operate roles on pages and
// widgets replace it.
func (u *upgrader) v6ToV7(doc map[string]any) {
	if _, ok := doc["pin"]; ok {
		delete(doc, "pin")
		u.note("dropped the operator PIN: it was checked only in the browser; use logins (security mode login) and roles on pages and widgets instead")
	}
}
