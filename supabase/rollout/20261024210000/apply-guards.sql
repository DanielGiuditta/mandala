-- First file of the single apply transaction. Fail fast instead of waiting on
-- locks held by live agent requests; nothing is applied if any step fails.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
