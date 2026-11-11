# Security policy

Speth's Screens can write to industrial controllers, so a security problem in it can have physical
consequences. Please report problems privately and give them time to be fixed before you publish them.

## Report a vulnerability

Use GitHub's private reporting: open the repository's **Security** tab and choose **Report a
vulnerability** (<https://github.com/Speth12/Speths_Screens/security/advisories/new>). Only the owner
can see the report.

Please do not open a public issue or pull request for a vulnerability.

Include what you can of:

- what is affected (the runtime, the IDE, the operator screen, a driver) and the version
  (`speths-screens --version`) or commit;
- the steps to reproduce it, and what you expected to happen instead;
- what an attacker could do with it, and what they would need first (network access, a login, a role);
- whether you have already told anyone else.

Do not include real passwords, tokens or keys from a plant. Test against your own lab setup.

## What to expect

This is a small project, so these are goals and not guarantees:

- an acknowledgement within a few days;
- a first assessment (accepted, needs more information, or not a vulnerability) within two weeks;
- a fix or a clear plan, and credit in the release notes if you want it.

## Supported versions

Only the latest release and the `main` branch get security fixes.

## What is, and is not, a vulnerability

Behaviour the documentation already describes is not a vulnerability in itself. In particular, a runtime
whose project has `security.mode` set to `none` (the default for a project that does not set it) has no
login: anyone who can reach it can deploy a project and write to tags. This is stated in the
[install guide](docs/install.md#7-security-and-logins) and the README. Keep such a runtime on a closed
network, or turn on logins.

These are in scope:

- bypassing a login, a role or a write check when `security.mode` is `login`;
- reading or changing data without the permission the role should need;
- leaking a password, token, key or certificate (in a response, a log, the project file or an export);
- running code on the runtime or in the browser that the author of a project should not be able to run;
- a runtime or driver that can be crashed or stalled by a request or a PLC reply it should reject.

## For people who run it

- Turn on logins (`security.mode: "login"`) for any runtime that is not on a closed lab network, and change
  the first-run admin password at once.
- Pin the certificates of the controllers you connect to.
- Never commit `project/project.json`, `*.pem`, passwords or tokens.
