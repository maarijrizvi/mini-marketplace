"""procrastinate job queue

Installs Procrastinate's tables and functions (the Python counterpart of graphile-worker that the ERD names).
They are managed by the library and are not part of the ERD.

Revision ID: b2c4e6a8d0f1
Revises: 94f93b3968a7
Create Date: 2026-11-12
"""
from collections.abc import Sequence
from importlib import resources

from alembic import op

revision: str = "b2c4e6a8d0f1"
down_revision: str | None = "94f93b3968a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = resources.files("procrastinate.sql").joinpath("schema.sql").read_text()
    # Raw driver call: the script contains literal % signs that a parameterised execute would misread.
    op.get_bind().connection.driver_connection.execute(schema)


def downgrade() -> None:
    op.execute(
        """
        DO $$ DECLARE r record; BEGIN
          FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'procrastinate%' LOOP
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
          FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname LIKE 'procrastinate%' LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
          END LOOP;
          FOR r IN SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE n.nspname = 'public' AND typname LIKE 'procrastinate%' AND typtype IN ('e', 'c') LOOP
            EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
          END LOOP;
        END $$;
        """
    )
