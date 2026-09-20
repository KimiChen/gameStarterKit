# Archived Modules

- Treat `module-library/` as unreadable by default: do not search, list, summarize, or use its contents during ordinary work.
- Access it only when the user explicitly asks to locate, inspect, or install an archived module. First run `pnpm modules:list --archived`; then read only the selected package and its declared hard dependencies.
