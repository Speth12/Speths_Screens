package namespace

import (
	"encoding/json"
	"testing"
)

func TestCreateAndResolve(t *testing.T) {
	ns := New()
	n, err := ns.CreateNode("Plant1.Line1.Tank101.Level", NodeTag, WithDataType("float"), WithUnit("m"))
	if err != nil {
		t.Fatalf("CreateNode: %v", err)
	}
	if n.Name != "Level" {
		t.Errorf("Name: got %q", n.Name)
	}

	got := ns.ResolvePath("Plant1.Line1.Tank101.Level")
	if got == nil {
		t.Fatal("ResolvePath returned nil")
	}
	if got.Unit != "m" {
		t.Errorf("Unit: %q", got.Unit)
	}
}

func TestIntermediateFoldersCreated(t *testing.T) {
	ns := New()
	_, err := ns.CreateNode("A.B.C.D", NodeTag)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"A", "A.B", "A.B.C"} {
		n := ns.ResolvePath(p)
		if n == nil {
			t.Errorf("intermediate node %q not created", p)
		} else if n.Type != NodeFolder {
			t.Errorf("%q type: got %q want folder", p, n.Type)
		}
	}
}

func TestDuplicateCreateFails(t *testing.T) {
	ns := New()
	ns.CreateNode("X.Y", NodeTag)
	if _, err := ns.CreateNode("X.Y", NodeTag); err == nil {
		t.Error("expected error for duplicate path")
	}
}

func TestDeleteLeaf(t *testing.T) {
	ns := New()
	ns.CreateNode("A.B", NodeTag)
	if err := ns.DeleteNode("A.B"); err != nil {
		t.Fatal(err)
	}
	if ns.ResolvePath("A.B") != nil {
		t.Error("node still present after delete")
	}
}

func TestDeleteNonLeafFails(t *testing.T) {
	ns := New()
	ns.CreateNode("A.B.C", NodeTag)
	if err := ns.DeleteNode("A.B"); err == nil {
		t.Error("expected error deleting non-leaf")
	}
}

func TestMoveNode(t *testing.T) {
	ns := New()
	ns.CreateNode("Old.Sensor", NodeTag)
	if err := ns.MoveNode("Old.Sensor", "New.Sensor"); err != nil {
		t.Fatal(err)
	}
	if ns.ResolvePath("Old.Sensor") != nil {
		t.Error("old path still exists")
	}
	if ns.ResolvePath("New.Sensor") == nil {
		t.Error("new path not found")
	}
}

func TestGetChildren(t *testing.T) {
	ns := New()
	ns.CreateNode("Plant.Line1.T1", NodeTag)
	ns.CreateNode("Plant.Line1.T2", NodeTag)
	ns.CreateNode("Plant.Line2.T3", NodeTag)

	children, err := ns.GetChildren("Plant.Line1")
	if err != nil {
		t.Fatal(err)
	}
	if len(children) != 2 {
		t.Errorf("want 2 children, got %d", len(children))
	}
}

func TestSearch(t *testing.T) {
	ns := New()
	ns.CreateNode("Plant.Tank101.Level", NodeTag)
	ns.CreateNode("Plant.Tank101.Temp", NodeTag)
	ns.CreateNode("Plant.Pump201.Speed", NodeTag)

	results := ns.Search("tank", "")
	if len(results) < 2 {
		t.Errorf("search 'tank': want >=2, got %d", len(results))
	}
	results = ns.Search("tank", NodeFolder)
	// Tank101 is a folder
	for _, r := range results {
		if r.Type != NodeFolder {
			t.Errorf("type filter failed: got %q", r.Type)
		}
	}
}

func TestPublishDriverTag(t *testing.T) {
	ns := New()
	n, err := ns.PublishDriverTag("Plant.Tank101.Level", "opc1", "ns=2;s=Tank101.Level", "float")
	if err != nil {
		t.Fatal(err)
	}
	if n.DriverID != "opc1" {
		t.Errorf("DriverID: %q", n.DriverID)
	}
	if n.DriverAddr != "ns=2;s=Tank101.Level" {
		t.Errorf("DriverAddr: %q", n.DriverAddr)
	}
	// second call returns existing node, no error
	n2, err := ns.PublishDriverTag("Plant.Tank101.Level", "opc1", "ns=2;s=Tank101.Level", "float")
	if err != nil {
		t.Fatalf("second PublishDriverTag: %v", err)
	}
	if n2.Path != n.Path {
		t.Errorf("paths differ")
	}
}

func TestJSONRoundTrip(t *testing.T) {
	ns := New()
	ns.CreateNode("A.B.C", NodeTag, WithDataType("float"), WithUnit("bar"))
	ns.CreateNode("A.B.D", NodeVirtualTag, WithExpression("A.B.C * 2"))

	b, err := json.Marshal(ns)
	if err != nil {
		t.Fatal(err)
	}

	ns2 := New()
	if err := json.Unmarshal(b, ns2); err != nil {
		t.Fatal(err)
	}
	n := ns2.ResolvePath("A.B.C")
	if n == nil {
		t.Fatal("A.B.C missing after unmarshal")
	}
	if n.Unit != "bar" {
		t.Errorf("Unit: %q", n.Unit)
	}
	d := ns2.ResolvePath("A.B.D")
	if d == nil || d.Expression == "" {
		t.Error("virtual tag missing expression")
	}
}

func TestLargeNamespace(t *testing.T) {
	ns := New()
	const N = 10_000
	for i := range N {
		path := "Plant.Line1.Device" + string(rune('A'+i%26)) + ".Tag" + itoa(i)
		if _, err := ns.GetOrCreate(path, NodeTag); err != nil {
			t.Fatalf("GetOrCreate %d: %v", i, err)
		}
	}
	if ns.Len() < N {
		t.Errorf("Len: %d < %d", ns.Len(), N)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	b := make([]byte, 0, 10)
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
