package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Speth12/Speths_Screens/internal/recipestore"
)

// setsProject has a memory datasource with three variables and a recipe set of the two shipped recipes.
const setsProject = `{
	"schemaVersion": 6, "version":"0.1.0",
	"datasources":[{"id":"mem","label":"Mem","type":"memory","config":{"memoryTags":[
		{"path":"Speed","type":"real"},{"path":"Count","type":"int"},{"path":"Mode","type":"string"}]}}],
	"pages":[{"id":"p1","name":"Main","widgets":[]}],
	"recipeSets":[{"id":"mix","name":"Mixer",
		"variables":[{"binding":"mem:Speed","label":"Speed","min":0,"max":100},{"binding":"mem:Count"},{"binding":"mem:Mode","default":"auto"}],
		"recipes":[
			{"id":"slow","name":"Slow","values":{"mem:Speed":10,"mem:Count":1,"mem:Mode":"gentle"}},
			{"id":"fast","name":"Fast","values":{"mem:Speed":90,"mem:Count":5}}]}]
}`

func recipeSetServer(t *testing.T) (string, func(method, path, body string) (int, map[string]any)) {
	t.Helper()
	_, rt, hs := newTestServer(t)
	store, err := recipestore.Open(filepath.Join(t.TempDir(), "r.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	rt.Recipes = store
	resp := postJSON(t, hs.URL+"/api/v1/project", setsProject)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("deploy: %d", resp.StatusCode)
	}
	time.Sleep(150 * time.Millisecond)
	do := func(method, path, body string) (int, map[string]any) {
		req, _ := http.NewRequest(method, hs.URL+"/api/v1"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var m map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&m)
		return resp.StatusCode, m
	}
	return hs.URL, do
}

func listSets(t *testing.T, base string) []map[string]any {
	t.Helper()
	resp, err := http.Get(base + "/api/v1/recipe-sets")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	return out
}

func recipeNames(set map[string]any) []string {
	var out []string
	for _, r := range set["recipes"].([]any) {
		out = append(out, r.(map[string]any)["name"].(string))
	}
	return out
}

func tagNow(t *testing.T, base, path string) any {
	t.Helper()
	resp, err := http.Get(base + "/api/v1/tag/mem:" + path)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var st map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&st)
	if v, ok := st["Value"]; ok {
		return v
	}
	return st["value"]
}

func TestRecipeSetLoadSaveSaveAsDelete(t *testing.T) {
	base, do := recipeSetServer(t)

	sets := listSets(t, base)
	if len(sets) != 1 || joinNames(recipeNames(sets[0])) != "Slow,Fast" {
		t.Fatalf("sets = %v, want the Mixer set with Slow and Fast", sets)
	}

	// Load: the recipe's values reach the variables; Mode, which "Fast" has no value for, takes the default.
	code, body := do("POST", "/recipe-sets/mix/recipes/fast/apply", "")
	if code != 200 || body["applied"] != 3.0 {
		t.Fatalf("load Fast: %d %v, want 200 and 3 applied", code, body)
	}
	if v := tagNow(t, base, "Speed"); v != 90.0 {
		t.Errorf("Speed = %v after loading Fast, want 90", v)
	}
	if v := tagNow(t, base, "Mode"); v != "auto" {
		t.Errorf("Mode = %v after loading Fast, want the default auto", v)
	}

	// Save as: a new recipe from what the variables hold now.
	code, body = do("POST", "/recipe-sets/mix/recipes", `{"name":"Mine"}`)
	if code != 201 {
		t.Fatalf("save as: %d %v", code, body)
	}
	mine := body["id"].(string)
	if vals := body["values"].(map[string]any); vals["mem:Speed"] != 90.0 || vals["mem:Mode"] != "auto" {
		t.Errorf("Mine holds %v, want what the variables held (90, auto)", vals)
	}
	if code, _ := do("POST", "/recipe-sets/mix/recipes", `{"name":" mine "}`); code != 409 {
		t.Errorf("a second recipe called mine: %d, want 409", code)
	}

	// Change the variables, then Save: Mine takes the new values.
	if code, _ := do("POST", "/recipe-sets/mix/recipes/slow/apply", ""); code != 200 {
		t.Fatalf("load Slow: %d", code)
	}
	code, body = do("PUT", "/recipe-sets/mix/recipes/"+mine, `{"fromCurrent":true}`)
	if code != 200 || body["values"].(map[string]any)["mem:Speed"] != 10.0 {
		t.Errorf("save: %d %v, want Speed 10", code, body)
	}

	// Typing values in the table: checked against the variable's limits.
	if code, _ := do("PUT", "/recipe-sets/mix/recipes/"+mine, `{"values":{"mem:Speed":150}}`); code != 400 {
		t.Errorf("a value above the maximum: %d, want 400", code)
	}
	if code, _ := do("PUT", "/recipe-sets/mix/recipes/"+mine, `{"values":{"mem:Nope":1}}`); code != 400 {
		t.Errorf("a variable the set does not have: %d, want 400", code)
	}
	if code, body := do("PUT", "/recipe-sets/mix/recipes/"+mine, `{"name":"Renamed","values":{"mem:Speed":55}}`); code != 200 || body["name"] != "Renamed" {
		t.Errorf("rename and edit: %d %v", code, body)
	}

	// Delete: gone, and a redeploy does not bring a deleted recipe back or undo the changes.
	if code, _ := do("DELETE", "/recipe-sets/mix/recipes/fast", ""); code != 200 {
		t.Fatalf("delete: %d", code)
	}
	if code, _ := do("DELETE", "/recipe-sets/mix/recipes/fast", ""); code != 404 {
		t.Errorf("delete again: %d, want 404", code)
	}
	resp := postJSON(t, base+"/api/v1/project", setsProject)
	resp.Body.Close()
	time.Sleep(150 * time.Millisecond)
	if got := joinNames(recipeNames(listSets(t, base)[0])); got != "Slow,Renamed" {
		t.Errorf("after a redeploy: %s, want Slow,Renamed (Fast stays deleted, Renamed stays)", got)
	}
}

func TestRecipeSetSaveRefusesWhenAVariableHasNoGoodValue(t *testing.T) {
	base, do := recipeSetServer(t)
	// A set whose variable names a tag the datasource does not have: there is no value to save.
	ghost := strings.Replace(setsProject, `{"binding":"mem:Count"}`, `{"binding":"mem:Ghost"}`, 1)
	resp := postJSON(t, base+"/api/v1/project", ghost)
	resp.Body.Close()
	time.Sleep(150 * time.Millisecond)
	code, body := do("POST", "/recipe-sets/mix/recipes", `{"name":"X"}`)
	if code != 400 || !strings.Contains(body["error"].(string), "mem:Ghost") {
		t.Errorf("save with a variable that has no value: %d %v, want 400 naming mem:Ghost", code, body)
	}
}

func TestRecipeSetUnknownSet(t *testing.T) {
	_, do := recipeSetServer(t)
	for _, c := range []struct{ method, path string }{
		{"POST", "/recipe-sets/nope/recipes"}, {"PUT", "/recipe-sets/nope/recipes/x"},
		{"DELETE", "/recipe-sets/nope/recipes/x"}, {"POST", "/recipe-sets/nope/recipes/x/apply"},
	} {
		if code, _ := do(c.method, c.path, `{"name":"a","values":{}}`); code != 404 {
			t.Errorf("%s %s: %d, want 404", c.method, c.path, code)
		}
	}
	if code, _ := do("POST", "/recipe-sets/mix/recipes/missing/apply", ""); code != 404 {
		t.Errorf("load of a missing recipe: %d, want 404", code)
	}
}

func TestRecipeSetFromOlderRecipe(t *testing.T) {
	_, rt, hs := newTestServer(t)
	store, _ := recipestore.Open(filepath.Join(t.TempDir(), "r.db"))
	t.Cleanup(func() { _ = store.Close() })
	rt.Recipes = store
	resp := postJSON(t, hs.URL+"/api/v1/project", projectWithRecipes)
	resp.Body.Close()
	sets := listSets(t, hs.URL)
	if len(sets) != 1 || sets[0]["id"] != "rec1" || joinNames(recipeNames(sets[0])) != "Reset" {
		t.Errorf("an older recipe should show as a set of one recipe, got %v", sets)
	}
}

func joinNames(names []string) string {
	out := ""
	for i, n := range names {
		if i > 0 {
			out += ","
		}
		out += n
	}
	return out
}
