# Collaboration Rules

## Project Scope
- `engine/` owns the migrated game-server framework; `server/` owns the migrated game-server business project.
- Both directories are part of the parent `gameKit` repository. Do not restore nested `.git` metadata or treat either directory as an independent repository.
- This area is in a migration landing phase. Unless the user asks for integration work, do not expand structural tasks into build, dependency, or runtime repairs.
- Before changing either project, read its nearest `README.md` and decide whether the change belongs to framework capability or business logic.

## Default Client
- The default client for any real-client work is the Cocos pair: `apps/Cocos` (Cocos Creator 3.8.8 project shell) plus `apps/client` (pure-TS source of truth, see its `README.md`). Do not start a new client, and do not treat `apps/Unity` (empty placeholder) or `apps/web-ui-preview` (UniFlex web preview shell) as alternatives.
- Edit `apps/client/src/` only. `apps/Cocos/assets/src/` is a generated mirror: `apps/shared/src` →(sync:shared)→ `apps/client/src/shared` →(sync:client)→ `apps/Cocos/assets/src`. Run `npm run sync:client` from the repository root after edits; `npm run verify:sync` fails on drift. Never hand-edit the mirror.
- The client is test support, not a product surface: no UI-stack migration or unification (UniFlex, FairyGUI and hand-written Cocos pages coexist), no visual or interaction polish, no asset production.
- The default Lobby transport stays Colyseus against the old `apps/server`. The native Lobby transport is selected only by explicit configuration (`?lobby=native&lobbyUrl=<ws>`); never change the default path to reach it.
- Escalate client verification in this order and stop at the cheapest level that can prove the behaviour: Node headless (`npm run typecheck:client`, `npm run test:client`) → real dual-server `npm run verify:dual-lobby` → real Creator GUI replay via `tools/creator-preview/*.mjs` (read its `README.md` before driving it). Open Creator only when the first two cannot prove the engine/UI boundary.
- Client acceptance covers four things only: explicit config reaches the native Lobby; the default Colyseus path is unbroken; RPC, push, close codes and connection lifecycle match the server contract; the GameRoom endpoint is not switched. Anything beyond that is out of scope by default.

## Reply Language
- Chat responses must use Simplified Chinese.

## AI-First Structure
- Do not add broad technical buckets when a feature-owned path is clearer.
- Before changing code inside a project or module, read the nearest owning README.md for durable local constraints.

## README Policy
- Do not add README content that repeats the directory tree, project references, route names, or behavior that is obvious from code.
- README files are allowed only for hidden constraints, non-obvious workflows, or dependencies that an agent cannot safely infer.
- Record only durable, broadly useful rules in README files. Prefer action-oriented constraints over explanations of a specific feature.
- When a user reports a problem or AI discovers/resolves a problem, update the nearest owning README in the same task if the issue could plausibly recur or be hard to diagnose later.
- README updates triggered by problems must capture the general prevention or resolution pattern so future work avoids reintroducing the issue or making it hard to fix.
- README updates triggered by fixes must describe the reusable solution, not the specific incident, node id, business case, or temporary implementation detail.
- Do not create README files for small features or one-off business logic. Update the project or owning-module README only when the rule applies beyond that small feature.
- Do not record concrete business behavior, implementation details, or temporary decisions unless they are necessary for future agents to avoid a likely mistake.
- README files must stay short, durable, and action-oriented. Prefer 2-6 bullets under clear headings over prose. Do not document obvious structure, routes, or feature behavior.
