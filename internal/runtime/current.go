package runtime

// CurrentValue returns the value a tag holds now, for a binding ("ns:path" or "datasource:path"). It is false when
// the binding names no tag, the runtime has no value for it yet, or the value is not Good.
func (r *Runtime) CurrentValue(binding string) (any, bool) {
	dsID, path, ok := r.resolveBinding(binding)
	if !ok {
		return nil, false
	}
	st, ok := r.Store.Get(dsID + ":" + path)
	if !ok || st.Quality != "Good" || st.Value == nil {
		return nil, false
	}
	return st.Value, true
}
