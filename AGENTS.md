# Shared mobile builder

- Implement source and tests in TypeScript with strict checks. Do not add game-specific logic to the builder; keep it in each game's package.json androidBuild/iosBuild settings.
- Run `npm test` and real-project `android:plan` checks after changes. Do not generate real APKs/AABs/IPAs, simulator apps or Xcode archives, sync native assets, publish packages or push repositories unless requested.
- Preserve SDK/cache override precedence, project-local Android user homes and existing signing identities. Never print inherited environment objects or signing secrets.
- Keep subprocess execution argument-based, stop on failure and do not replace exports after failed commands. Dry runs must not mutate files or run build/sync/Gradle/Xcode commands.

- Keep public documentation, fixtures and examples consumer-agnostic. Do not include real consuming-project names, local paths, app IDs, signing prefixes or other project-specific identifiers. Use invented examples.
