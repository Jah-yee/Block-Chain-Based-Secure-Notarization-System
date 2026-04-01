DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_type') THEN
        CREATE TYPE proposal_type AS ENUM ('ban_user', 'unban_user', 'override_document', 'system_upgrade');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'proposal_status') THEN
        CREATE TYPE proposal_status AS ENUM ('active', 'passed', 'rejected', 'executed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_decision') THEN
        CREATE TYPE vote_decision AS ENUM ('approve', 'reject');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS governance_proposals (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type proposal_type NOT NULL,
    target_id VARCHAR(255), -- ID of user or document being targeted
    proposer_id INTEGER REFERENCES users(id),
    status proposal_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS governance_votes (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER REFERENCES governance_proposals(id) ON DELETE CASCADE,
    voter_id INTEGER REFERENCES users(id),
    decision vote_decision NOT NULL,
    signature TEXT NOT NULL, -- EIP-191 verify signature of decision
    voted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(proposal_id, voter_id) -- One vote per admin per proposal
);
