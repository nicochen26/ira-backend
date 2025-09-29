# Database Migration Workflow

This document outlines the database migration procedures for the IRA Backend project using Prisma.

## Available Migration Commands

The following npm scripts are available for database migration operations:

- `npm run db:migrate` - Create and apply a new migration in development
- `npm run db:migrate:deploy` - Apply pending migrations (for production)
- `npm run db:migrate:reset` - Reset database and apply all migrations (development only)
- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:push` - Push schema changes without creating migration files
- `npm run db:studio` - Open Prisma Studio for database inspection

## Migration Workflow

### Development Environment

1. **Making Schema Changes**: Modify `prisma/schema.prisma`
2. **Create Migration**: Run `npm run db:migrate`
3. **Name Migration**: Provide a descriptive name when prompted
4. **Review Migration**: Check generated SQL in `prisma/migrations/`
5. **Test Changes**: Verify the migration works correctly

### Production Environment

1. **Apply Migrations**: Use `npm run db:migrate:deploy`
2. **Verify Deployment**: Check application logs and database state

## Migration Best Practices

- Always backup database before applying migrations in production
- Test migrations thoroughly in development environment
- Use descriptive names for migration files
- Review generated SQL before applying
- Keep migration files in version control

## Migration Files Location

Migration files are stored in `prisma/migrations/` directory with the following structure:
```
prisma/migrations/
├── 20250929041938_init/
│   └── migration.sql
└── migration_lock.toml
```

## Rollback Capability

- Prisma does not support automatic rollbacks
- Manual rollback requires creating new migrations to reverse changes
- In emergency situations, database backups should be restored
- The `migrate reset` command can be used in development to start fresh

## Current Migration Status

- ✅ Initial migration created: `20250929041938_init`
- ✅ User model with required fields implemented
- ✅ Database schema in sync with Prisma schema