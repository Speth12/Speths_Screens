package recipestore

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func openTemp(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "r.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func names(recs []SetRecipe) []string {
	var out []string
	for _, r := range recs {
		out = append(out, r.Name)
	}
	return out
}

func TestSetSeedKeepsOperatorChangesAndDeletes(t *testing.T) {
	ctx := context.Background()
	s := openTemp(t)
	shipped := []SetRecipe{
		{ID: "a", Name: "Slow", Values: map[string]any{"x": 1.0}},
		{ID: "b", Name: "Fast", Values: map[string]any{"x": 9.0}},
	}
	if err := s.SeedSet(ctx, "set1", shipped); err != nil {
		t.Fatal(err)
	}
	// An operator changes one and deletes the other; a redeploy seeds again.
	if _, err := s.UpdateSet(ctx, "set1", "a", nil, map[string]any{"x": 5.0}, "pat"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteSet(ctx, "set1", "b"); err != nil {
		t.Fatal(err)
	}
	if err := s.SeedSet(ctx, "set1", shipped); err != nil {
		t.Fatal(err)
	}
	got, err := s.ListSet(ctx, "set1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "a" || got[0].Values["x"] != 5.0 || got[0].UpdatedBy != "pat" {
		t.Errorf("after a redeploy: %+v, want only the changed recipe a with x=5 by pat", got)
	}
	// A new shipped recipe still arrives.
	shipped = append(shipped, SetRecipe{ID: "c", Name: "New", Values: map[string]any{"x": 2.0}})
	_ = s.SeedSet(ctx, "set1", shipped)
	got, _ = s.ListSet(ctx, "set1")
	if n := names(got); len(n) != 2 || n[1] != "New" {
		t.Errorf("recipes %v, want the changed one then New", n)
	}
}

func TestSetCreateUpdateDeleteRules(t *testing.T) {
	ctx := context.Background()
	s := openTemp(t)
	mk := func(id, name string) error {
		return s.CreateSet(ctx, "set1", SetRecipe{ID: id, Name: name, Values: map[string]any{"x": 1.0}})
	}
	if err := mk("a", "Slow"); err != nil {
		t.Fatal(err)
	}
	if err := mk("b", " slow "); !errors.Is(err, ErrNameTaken) {
		t.Errorf("a name differing only in case and spaces: %v, want ErrNameTaken", err)
	}
	if err := s.CreateSet(ctx, "other", SetRecipe{ID: "a", Name: "Slow", Values: map[string]any{}}); err != nil {
		t.Errorf("the same name in another set: %v", err)
	}
	if err := mk("b", "Fast"); err != nil {
		t.Fatal(err)
	}
	newName := "slow"
	if _, err := s.UpdateSet(ctx, "set1", "b", &newName, nil, "pat"); !errors.Is(err, ErrNameTaken) {
		t.Errorf("rename to a taken name: %v, want ErrNameTaken", err)
	}
	same := "Slow"
	if _, err := s.UpdateSet(ctx, "set1", "a", &same, nil, "pat"); err != nil {
		t.Errorf("a recipe keeping its own name: %v", err)
	}
	if _, err := s.UpdateSet(ctx, "set1", "nope", nil, map[string]any{}, "pat"); !errors.Is(err, ErrNotFound) {
		t.Errorf("update of a missing recipe: %v, want ErrNotFound", err)
	}
	if err := s.DeleteSet(ctx, "set1", "a"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteSet(ctx, "set1", "a"); !errors.Is(err, ErrNotFound) {
		t.Errorf("second delete: %v, want ErrNotFound", err)
	}
	if err := mk("c", "Slow"); err != nil {
		t.Errorf("the name of a deleted recipe is free again: %v", err)
	}
	if _, err := s.GetSet(ctx, "set1", "a"); !errors.Is(err, ErrNotFound) {
		t.Errorf("get of a deleted recipe: %v, want ErrNotFound", err)
	}
}
