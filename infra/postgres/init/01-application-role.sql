DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carbonledger_migrator') THEN
    CREATE ROLE carbonledger_migrator LOGIN PASSWORD 'carbonledger_migrator_dev'
      NOSUPERUSER CREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carbonledger_app') THEN
    CREATE ROLE carbonledger_app LOGIN PASSWORD 'carbonledger_app_dev'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE carbonledger TO carbonledger_migrator, carbonledger_app;
GRANT USAGE, CREATE ON SCHEMA public TO carbonledger_migrator;
GRANT USAGE ON SCHEMA public TO carbonledger_app;

ALTER DEFAULT PRIVILEGES FOR ROLE carbonledger_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carbonledger_app;
ALTER DEFAULT PRIVILEGES FOR ROLE carbonledger_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO carbonledger_app;
