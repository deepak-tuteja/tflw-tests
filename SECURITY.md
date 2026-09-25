# Security policy

This repository is the application `tflw` is developed against: a deliberately imperfect
e-commerce API and storefront, plus the test corpus that exercises the language against it. Parts
of it are **wrong on purpose** — endpoints that leak, pages that omit headers, flows that let the
wrong principal through — because a testing tool's security scans need something real to find.
Those are catalogued in `CONSTRUCTS.md` and are not vulnerabilities; they are the fixtures.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (**Security → Report a
vulnerability**). You will get an acknowledgement within **72 hours**.

What counts here is narrower than in the tflw repository:

- Something in this repository that would harm a person who **clones and runs it as
  documented** — the compose stack, the scripts under `scripts/`, the CI workflow. For example: a
  script that reaches outside the checkout, a default credential that is also used somewhere real,
  a workflow that exposes a secret.
- A planted weakness in the application that is **not** in `CONSTRUCTS.md`, or that is reachable
  from somewhere the catalogue says it is not. The whole value of the catalogue is that it is
  complete.
- A test or a script that talks to a host this repository does not own. Every external target is
  declared and fenced (`npm run verify:external-targets`), and one that is not is a report.

A vulnerability in **tflw itself** — the CLI, the page, the runtime — belongs on
[the tflw repository's policy](https://github.com/deepak-tuteja/tflw/blob/main/SECURITY.md).

## What is not

- The application's catalogued weaknesses. They are the point. Reports about them are appreciated
  when the catalogue is wrong about one, and are otherwise closed with thanks.
- Running the stack on a host other people can reach. It is built to run on a developer's machine
  or a CI runner, on loopback, with throwaway data.

## Dependencies

CI runs `npm audit --audit-level=high` for the repository and for `apiV2`, and Dependabot opens a
weekly grouped pull request for npm and for GitHub Actions, merged by hand against the regression
sweep: the application's dependencies are part of what the corpus measures, so a bump is reviewed
as a change to the fixture and not only as a change to a version.
