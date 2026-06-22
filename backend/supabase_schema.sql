-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    password VARCHAR NOT NULL,
    role VARCHAR DEFAULT 'staff' NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Queues Table
CREATE TABLE IF NOT EXISTS queues (
    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "queueName" VARCHAR NOT NULL,
    "queueCode" VARCHAR NOT NULL UNIQUE,
    "averageServiceTime" INTEGER NOT NULL,
    "tokenPrefix" VARCHAR DEFAULT 'A' NOT NULL,
    "lastTokenNumber" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Queue Entries Table
CREATE TABLE IF NOT EXISTS queue_entries (
    _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "customerName" VARCHAR NOT NULL,
    "queueId" UUID NOT NULL REFERENCES queues(_id) ON DELETE CASCADE,
    token VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'waiting' NOT NULL CHECK (status IN ('waiting', 'called', 'served', 'skipped')),
    "joinedAt" TIMESTAMPTZ DEFAULT NOW(),
    "calledAt" TIMESTAMPTZ,
    "servedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Automatically update "updatedAt" triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_queues_updated_at ON queues;
CREATE TRIGGER update_queues_updated_at
    BEFORE UPDATE ON queues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_queue_entries_updated_at ON queue_entries;
CREATE TRIGGER update_queue_entries_updated_at
    BEFORE UPDATE ON queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Atomic queue token increment RPC function
CREATE OR REPLACE FUNCTION increment_queue_token(queue_id UUID)
RETURNS SETOF queues AS $$
BEGIN
    RETURN QUERY
    UPDATE queues
    SET "lastTokenNumber" = "lastTokenNumber" + 1
    WHERE _id = queue_id
    RETURNING *;
END;
$$ LANGUAGE plpgsql;
