package project

// Roles in order: an operator may do the least, an administrator the most. A page, a widget and a
// custom widget's part can each say the lowest role that may see it and the lowest that may operate
// it (Access); the runtime refuses a write a role below that would make.

var roleRanks = map[Role]int{Operator: 1, Supervisor: 2, Engineer: 3, Admin: 4}

// RoleRank orders the roles from operator (1) to admin (4); an empty or unknown role is 0.
func RoleRank(r Role) int { return roleRanks[r] }

// RoleOfRank is the role with that rank, or "" for none.
func RoleOfRank(n int) Role {
	for r, k := range roleRanks {
		if k == n {
			return r
		}
	}
	return ""
}

// Need is the lowest rank that may operate something placed inside all of these (a page, a custom
// widget placed on it, a part of that custom widget): the highest of their view and operate roles,
// since what a role may not see it may not operate either. Nil accesses ask for nothing (0).
func Need(accesses ...*Access) int {
	need := 0
	for _, a := range accesses {
		if a == nil {
			continue
		}
		for _, r := range []*Role{a.View, a.Operate} {
			if r != nil && RoleRank(*r) > need {
				need = RoleRank(*r)
			}
		}
	}
	return need
}
