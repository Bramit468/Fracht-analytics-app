# Rules

Read PROJECT.md before coding.

- Work only on the assigned GitHub issue.
- Do not change unrelated code.
- Do not commit API keys or passwords.
- Keep changes small.
- Test changes before finishing.
- Explain what was changed.

## Workflow

1. One issue = one branch = one pull request.
2. Branch off `main`, name it `feature/<short-name>`.
3. Never commit directly to `main`.
4. Before opening the PR: the app must build and run.
5. In the PR description, list what changed and how it was tested.

## Code

- TypeScript. No `any` unless there is no other option.
- Money is stored in cents as integers, never floats.
- Business logic (cost/profit math) lives in plain functions with unit tests,
  not inside React components.
- Guard division: never divide by zero on revenue or distance.

## Out of scope

If the issue does not mention it, do not build it. Suggest it in the PR instead.

## Next.js 16

This project runs Next.js 16, which has breaking changes compared to what most models
were trained on. Before writing Next-specific code, check the docs shipped with the
installed version in `node_modules/next/dist/docs/`.
