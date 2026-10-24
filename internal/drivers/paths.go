package drivers

import (
	"slices"
	"sort"
)

// NormalizePaths returns a sorted copy of paths without empty strings or
// duplicates. Drivers use it so SetTags can tell when the set is unchanged.
func NormalizePaths(paths []string) []string {
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if p != "" {
			out = append(out, p)
		}
	}
	sort.Strings(out)
	return slices.Compact(out)
}
