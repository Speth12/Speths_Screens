package recipestore

// Recipes of a recipe set (the project's RecipeSet). The project says which variables a set has and ships some
// recipes; operators save, change and delete recipes on the runtime, so those live here, in the runtime's own
// database, and a deploy never overwrites them.
//
// A recipe shipped with the project is added the first time its set is seen. Deleting a recipe keeps a marker
// (deleted = 1), so a redeploy does not bring a deleted recipe back.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// ErrNameTaken is returned when another recipe of the set already has the name (compared ignoring case).
var ErrNameTaken = errors.New("another recipe of this set already has that name")

// ErrNotFound is returned for a recipe that does not exist (or was deleted).
var ErrNotFound = errors.New("recipe not found")

// SetRecipe is one named recipe of a set: a value per variable binding.
type SetRecipe struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Values    map[string]any `json:"values"`
	UpdatedBy string         `json:"updatedBy,omitempty"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

func (s *Store) migrateSets() error {
	_, err := s.db.Exec(`
	CREATE TABLE IF NOT EXISTS recipe_set_recipes (
		seq        INTEGER PRIMARY KEY AUTOINCREMENT,
		set_id     TEXT    NOT NULL,
		recipe_id  TEXT    NOT NULL,
		name       TEXT    NOT NULL,
		values_    TEXT    NOT NULL,
		updated_by TEXT    NOT NULL DEFAULT '',
		updated_at TEXT    NOT NULL,
		deleted    INTEGER NOT NULL DEFAULT 0,
		UNIQUE (set_id, recipe_id)
	);`)
	return err
}

// SeedSet adds the recipes the project ships that the set has never had. A recipe already there, changed or
// deleted, is left as it is.
func (s *Store) SeedSet(ctx context.Context, setID string, shipped []SetRecipe) error {
	s.setMu.Lock()
	defer s.setMu.Unlock()
	for _, rec := range shipped {
		vals, _ := json.Marshal(rec.Values)
		if _, err := s.db.ExecContext(ctx,
			`INSERT OR IGNORE INTO recipe_set_recipes (set_id, recipe_id, name, values_, updated_by, updated_at) VALUES (?,?,?,?,?,?)`,
			setID, rec.ID, rec.Name, string(vals), "", time.Now().UTC().Format(time.RFC3339)); err != nil {
			return err
		}
	}
	return nil
}

// ListSet returns the set's recipes that are not deleted, oldest first.
func (s *Store) ListSet(ctx context.Context, setID string) ([]SetRecipe, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT recipe_id, name, values_, updated_by, updated_at FROM recipe_set_recipes WHERE set_id = ? AND deleted = 0 ORDER BY seq`, setID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SetRecipe{}
	for rows.Next() {
		rec, err := scanSetRecipe(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// GetSet returns one recipe of a set.
func (s *Store) GetSet(ctx context.Context, setID, recipeID string) (SetRecipe, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT recipe_id, name, values_, updated_by, updated_at FROM recipe_set_recipes WHERE set_id = ? AND recipe_id = ? AND deleted = 0`, setID, recipeID)
	rec, err := scanSetRecipe(row)
	if errors.Is(err, sql.ErrNoRows) {
		return SetRecipe{}, ErrNotFound
	}
	return rec, err
}

// CreateSet adds a recipe to a set. Its name must be new in the set.
func (s *Store) CreateSet(ctx context.Context, setID string, rec SetRecipe) error {
	s.setMu.Lock()
	defer s.setMu.Unlock()
	if err := s.nameFree(ctx, setID, rec.ID, rec.Name); err != nil {
		return err
	}
	vals, _ := json.Marshal(rec.Values)
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO recipe_set_recipes (set_id, recipe_id, name, values_, updated_by, updated_at) VALUES (?,?,?,?,?,?)`,
		setID, rec.ID, rec.Name, string(vals), rec.UpdatedBy, time.Now().UTC().Format(time.RFC3339))
	return err
}

// UpdateSet changes a recipe's name and/or values; nil leaves a part as it is.
func (s *Store) UpdateSet(ctx context.Context, setID, recipeID string, name *string, values map[string]any, by string) (SetRecipe, error) {
	s.setMu.Lock()
	defer s.setMu.Unlock()
	cur, err := s.GetSet(ctx, setID, recipeID)
	if err != nil {
		return SetRecipe{}, err
	}
	if name != nil {
		if err := s.nameFree(ctx, setID, recipeID, *name); err != nil {
			return SetRecipe{}, err
		}
		cur.Name = *name
	}
	if values != nil {
		cur.Values = values
	}
	vals, _ := json.Marshal(cur.Values)
	cur.UpdatedBy, cur.UpdatedAt = by, time.Now().UTC()
	_, err = s.db.ExecContext(ctx,
		`UPDATE recipe_set_recipes SET name = ?, values_ = ?, updated_by = ?, updated_at = ? WHERE set_id = ? AND recipe_id = ?`,
		cur.Name, string(vals), cur.UpdatedBy, cur.UpdatedAt.Format(time.RFC3339), setID, recipeID)
	return cur, err
}

// DeleteSet removes a recipe from a set; a recipe shipped with the project stays deleted after a redeploy.
func (s *Store) DeleteSet(ctx context.Context, setID, recipeID string) error {
	s.setMu.Lock()
	defer s.setMu.Unlock()
	res, err := s.db.ExecContext(ctx, `UPDATE recipe_set_recipes SET deleted = 1 WHERE set_id = ? AND recipe_id = ? AND deleted = 0`, setID, recipeID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// nameFree reports ErrNameTaken when a recipe other than exceptID has the name. Callers hold setMu.
func (s *Store) nameFree(ctx context.Context, setID, exceptID, name string) error {
	rows, err := s.db.QueryContext(ctx, `SELECT recipe_id, name FROM recipe_set_recipes WHERE set_id = ? AND deleted = 0`, setID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, n string
		if err := rows.Scan(&id, &n); err != nil {
			return err
		}
		if id != exceptID && strings.EqualFold(strings.TrimSpace(n), strings.TrimSpace(name)) {
			return ErrNameTaken
		}
	}
	return rows.Err()
}

func scanSetRecipe(row scanner) (SetRecipe, error) {
	var rec SetRecipe
	var vals, at string
	if err := row.Scan(&rec.ID, &rec.Name, &vals, &rec.UpdatedBy, &at); err != nil {
		return SetRecipe{}, err
	}
	if err := json.Unmarshal([]byte(vals), &rec.Values); err != nil || rec.Values == nil {
		rec.Values = map[string]any{}
	}
	rec.UpdatedAt, _ = time.Parse(time.RFC3339, at)
	return rec, nil
}
