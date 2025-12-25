# Code Style & Conventions

## TypeScript Configuration
- **Target**: ES2022
- **Module System**: NodeNext (ESM)
- **Strict Mode**: Enabled
- **Declaration Files**: Generated

## Language Conventions
- ESM modules (`"type": "module"` in package.json)
- Use `.ts` extension imports
- Strict null checks enabled
- No implicit any

## Code Organization
- **Routes**: HTTP endpoint handlers in `src/routes/`
- **Services**: Business logic in `src/services/`
- **Credentials**: Credential management in `src/credentials/`
- **Settings**: Runtime settings in `src/settings/`
- **Types**: Shared types in `src/types.ts`
- **Config**: Environment loading in `src/config.ts`

## Fastify Patterns
- Register routes via plugins
- Use hooks for auth (`preHandler`)
- Reply decorators for utilities
- Static files via `@fastify/static`

## Naming Conventions
- camelCase for variables and functions
- PascalCase for types and interfaces
- Descriptive names preferred
- No Hungarian notation

## File Naming
- kebab-case for filenames
- `.ts` extension for TypeScript
- Index files avoided (explicit imports)
