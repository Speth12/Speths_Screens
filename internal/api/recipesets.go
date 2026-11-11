package api

// Recipe sets: one list of variables (the project's RecipeSet) and the named recipes that set them. The project
// ships some recipes; supervisors save, change and delete recipes on the runtime, where they live in the recipe
// store and survive a redeploy. A recipe from before recipe sets (project.Recipe) is shown as a set of one
// recipe, so older projects keep working.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Speth12/Speths_Screens/internal/audit"
	"github.com/Speth12/Speths_Screens/internal/project"
	"github.com/Speth12/Speths_Screens/internal/recipestore"
	"github.com/Speth12/Speths_Screens/internal/tagstore"
)

const maxRecipeName = 80

// recipeSetView is what the API returns for a set.
type recipeSetView struct {
	ID        string                   `json:"id"`
	Name      string                   `json:"name"`
	Variables []project.RecipeVariable `json:"variables"`
	Recipes   []recipestore.SetRecipe  `json:"recipes"`
}

// projectSets is the project's recipe sets, followed by each older recipe as a set of one.
func projectSets(p *project.Project) []project.RecipeSet {
	if p == nil {
		return nil
	}
	sets := append([]project.RecipeSet(nil), p.RecipeSets...)
	taken := map[string]bool{}
	for _, s := range sets {
		taken[s.ID] = true
	}
	for _, rec := range p.Recipes {
		if taken[rec.ID] {
			continue
		}
		set := project.RecipeSet{ID: rec.ID, Name: rec.Name}
		values := map[string]any{}
		for _, e := range rec.Entries {
			if strings.TrimSpace(e.Binding) == "" {
				continue
			}
			set.Variables = append(set.Variables, project.RecipeVariable{Binding: e.Binding})
			values[e.Binding] = e.Value
		}
		set.Recipes = []project.SetRecipe{{ID: "default", Name: rec.Name, Values: values}}
		sets = append(sets, set)
	}
	return sets
}

// findSet looks a set up in the loaded project and makes sure the recipes it ships are in the store.
func (s *Server) findSet(r *http.Request, id string) (*project.RecipeSet, bool) {
	for _, set := range projectSets(s.rt.Project()) {
		if set.ID != id {
			continue
		}
		set := set
		if s.rt.Recipes != nil {
			if err := s.rt.Recipes.SeedSet(r.Context(), set.ID, shipped(set)); err != nil {
				return nil, false
			}
		}
		return &set, true
	}
	return nil, false
}

func shipped(set project.RecipeSet) []recipestore.SetRecipe {
	out := make([]recipestore.SetRecipe, 0, len(set.Recipes))
	for _, rec := range set.Recipes {
		vals := rec.Values
		if vals == nil {
			vals = map[string]any{}
		}
		out = append(out, recipestore.SetRecipe{ID: rec.ID, Name: rec.Name, Values: vals})
	}
	return out
}

func (s *Server) handleListRecipeSets(w http.ResponseWriter, r *http.Request) {
	out := []recipeSetView{}
	for _, set := range projectSets(s.rt.Project()) {
		view := recipeSetView{ID: set.ID, Name: set.Name, Variables: set.Variables, Recipes: []recipestore.SetRecipe{}}
		if view.Variables == nil {
			view.Variables = []project.RecipeVariable{}
		}
		if s.rt.Recipes != nil {
			if err := s.rt.Recipes.SeedSet(r.Context(), set.ID, shipped(set)); err != nil {
				writeErr(w, 500, err.Error())
				return
			}
			recs, err := s.rt.Recipes.ListSet(r.Context(), set.ID)
			if err != nil {
				writeErr(w, 500, err.Error())
				return
			}
			view.Recipes = recs
		} else {
			for _, rec := range shipped(set) { // no store (dev mode): the shipped recipes, read only
				view.Recipes = append(view.Recipes, rec)
			}
		}
		out = append(out, view)
	}
	writeJSON(w, 200, out)
}

// recipeBody is the body of a create or update. Values left out with FromCurrent set (or on a create) take what
// the variables hold now: "Save" and "Save as" on the screen.
type recipeBody struct {
	Name        *string        `json:"name"`
	Values      map[string]any `json:"values"`
	FromCurrent bool           `json:"fromCurrent"`
}

func (s *Server) readRecipeBody(w http.ResponseWriter, r *http.Request) (recipeBody, bool) {
	defer r.Body.Close()
	var b recipeBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&b); err != nil {
		writeErr(w, 400, "invalid json")
		return b, false
	}
	return b, true
}

// valuesFor builds the values a recipe holds: those given, or what the variables hold now. It checks each value's
// type and limits; the error names the variable.
func (s *Server) valuesFor(set *project.RecipeSet, b recipeBody) (map[string]any, error) {
	var vals map[string]any
	if b.Values != nil && !b.FromCurrent {
		vals = map[string]any{}
		known := map[string]bool{}
		for _, v := range set.Variables {
			known[v.Binding] = true
		}
		for k, v := range b.Values {
			if !known[k] {
				return nil, fmt.Errorf("%s is not a variable of this set", k)
			}
			vals[k] = v
		}
	} else {
		vals = map[string]any{}
		for _, v := range set.Variables {
			cur, ok := s.rt.CurrentValue(v.Binding)
			if !ok {
				return nil, fmt.Errorf("%s has no good value to save right now", label(v))
			}
			vals[v.Binding] = cur
		}
	}
	for _, v := range set.Variables {
		val, has := vals[v.Binding]
		if !has {
			continue
		}
		if err := checkRecipeValue(v, val); err != nil {
			return nil, err
		}
	}
	return vals, nil
}

func label(v project.RecipeVariable) string {
	if v.Label != nil && *v.Label != "" {
		return *v.Label
	}
	return v.Binding
}

// checkRecipeValue accepts a flag, a number inside the variable's limits, or text.
func checkRecipeValue(v project.RecipeVariable, val any) error {
	switch x := val.(type) {
	case bool, string:
		return nil
	default:
		f, ok := tagstore.Number(x)
		if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
			return fmt.Errorf("%s: %v is not a number, flag or text", label(v), val)
		}
		if v.Min != nil && f < *v.Min {
			return fmt.Errorf("%s: %v is below the minimum %v", label(v), f, *v.Min)
		}
		if v.Max != nil && f > *v.Max {
			return fmt.Errorf("%s: %v is above the maximum %v", label(v), f, *v.Max)
		}
	}
	return nil
}

func cleanName(n string) (string, error) {
	n = strings.TrimSpace(n)
	if n == "" {
		return "", errors.New("the recipe needs a name")
	}
	if len([]rune(n)) > maxRecipeName {
		return "", fmt.Errorf("the name is longer than %d characters", maxRecipeName)
	}
	return n, nil
}

func newRecipeID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func (s *Server) recipeStoreOrErr(w http.ResponseWriter) bool {
	if s.rt.Recipes == nil {
		writeErr(w, 503, "recipe store not configured")
		return false
	}
	return true
}

func (s *Server) recipeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, recipestore.ErrNameTaken):
		writeErr(w, 409, err.Error())
	case errors.Is(err, recipestore.ErrNotFound):
		writeErr(w, 404, err.Error())
	default:
		writeErr(w, 500, err.Error())
	}
}

func (s *Server) handleCreateSetRecipe(w http.ResponseWriter, r *http.Request) {
	if !s.recipeStoreOrErr(w) {
		return
	}
	set, ok := s.findSet(r, chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, 404, "recipe set not found")
		return
	}
	b, ok := s.readRecipeBody(w, r)
	if !ok {
		return
	}
	if b.Name == nil {
		writeErr(w, 400, "the recipe needs a name")
		return
	}
	name, err := cleanName(*b.Name)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	vals, err := s.valuesFor(set, b)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	rec := recipestore.SetRecipe{ID: newRecipeID(), Name: name, Values: vals, UpdatedBy: claimedUser(r)}
	if err := s.rt.Recipes.CreateSet(r.Context(), set.ID, rec); err != nil {
		s.recipeStoreError(w, err)
		return
	}
	rec.UpdatedAt = time.Now().UTC()
	s.recordAudit(r, audit.ActionConfigChange, "recipe-set/"+set.ID+"/"+rec.ID, nil, vals, "recipe saved as \""+name+"\"")
	writeJSON(w, 201, rec)
}

func (s *Server) handleUpdateSetRecipe(w http.ResponseWriter, r *http.Request) {
	if !s.recipeStoreOrErr(w) {
		return
	}
	set, ok := s.findSet(r, chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, 404, "recipe set not found")
		return
	}
	rid := chi.URLParam(r, "rid")
	before, err := s.rt.Recipes.GetSet(r.Context(), set.ID, rid)
	if err != nil {
		s.recipeStoreError(w, err)
		return
	}
	b, ok := s.readRecipeBody(w, r)
	if !ok {
		return
	}
	var name *string
	if b.Name != nil {
		n, err := cleanName(*b.Name)
		if err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		name = &n
	}
	var vals map[string]any
	if b.Values != nil || b.FromCurrent {
		if vals, err = s.valuesFor(set, b); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
	}
	rec, err := s.rt.Recipes.UpdateSet(r.Context(), set.ID, rid, name, vals, claimedUser(r))
	if err != nil {
		s.recipeStoreError(w, err)
		return
	}
	s.recordAudit(r, audit.ActionConfigChange, "recipe-set/"+set.ID+"/"+rid, before.Values, rec.Values, "recipe \""+rec.Name+"\" changed")
	writeJSON(w, 200, rec)
}

func (s *Server) handleDeleteSetRecipe(w http.ResponseWriter, r *http.Request) {
	if !s.recipeStoreOrErr(w) {
		return
	}
	set, ok := s.findSet(r, chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, 404, "recipe set not found")
		return
	}
	rid := chi.URLParam(r, "rid")
	before, err := s.rt.Recipes.GetSet(r.Context(), set.ID, rid)
	if err != nil {
		s.recipeStoreError(w, err)
		return
	}
	if err := s.rt.Recipes.DeleteSet(r.Context(), set.ID, rid); err != nil {
		s.recipeStoreError(w, err)
		return
	}
	s.recordAudit(r, audit.ActionConfigChange, "recipe-set/"+set.ID+"/"+rid, before.Values, nil, "recipe \""+before.Name+"\" deleted")
	writeJSON(w, 200, map[string]any{"ok": true})
}

// handleApplySetRecipe is "Load": write the recipe's values to the PLC, one at a time in the set's variable order,
// through the write pipeline. A variable the recipe has no value for takes the variable's default, or is left alone.
func (s *Server) handleApplySetRecipe(w http.ResponseWriter, r *http.Request) {
	if !s.recipeStoreOrErr(w) {
		return
	}
	set, ok := s.findSet(r, chi.URLParam(r, "id"))
	if !ok {
		writeErr(w, 404, "recipe set not found")
		return
	}
	rid := chi.URLParam(r, "rid")
	rec, err := s.rt.Recipes.GetSet(r.Context(), set.ID, rid)
	if err != nil {
		s.recipeStoreError(w, err)
		return
	}
	var entries []recipestore.Entry
	for _, v := range set.Variables {
		if strings.TrimSpace(v.Binding) == "" {
			continue
		}
		val, has := rec.Values[v.Binding]
		if !has {
			if v.Default == nil {
				continue
			}
			val = v.Default
		}
		entries = append(entries, recipestore.Entry{Binding: v.Binding, Value: val})
	}
	errs, applied := s.executeRecipeEntries(r, entries)
	_, _ = s.rt.Recipes.RecordRun(r.Context(), recipestore.Run{
		RecipeID: set.ID + "/" + rid, RecipeName: set.Name + ": " + rec.Name, AppliedBy: claimedUser(r),
		AppliedAt: time.Now(), Entries: entries, AppliedCount: applied, Errors: errs,
	})
	s.recordAudit(r, audit.ActionRecipeApply, set.ID+"/"+rid, nil, nil, fmt.Sprintf("\"%s\" applied=%d errors=%d", rec.Name, applied, len(errs)))
	if len(errs) > 0 {
		writeJSON(w, 207, map[string]any{"ok": false, "errors": errs, "applied": applied})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "applied": applied})
}
