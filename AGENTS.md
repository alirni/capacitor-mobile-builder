# Shared Android builder

- Implement source and tests in TypeScript with strict checks. Do not add game-specific logic to the builder; keep it in each game's package.json androidBuild settings.
- Run `npm test` and real-project `android:plan` checks after changes. Do not generate APKs/AABs, sync native assets, publish packages or push repositories unless requested.
- Preserve SDK/cache override precedence, project-local Android user homes and existing signing identities. Never print inherited environment objects or signing secrets.
- Keep subprocess execution argument-based, stop on failure and do not replace exports after failed commands. Dry runs must not mutate files or run build/sync/Gradle commands.
