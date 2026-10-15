-- Guard: sign-in's records stay the API's (spec/acceptance/10-api-and-sync.md AC-10-11, 81;
-- ADR-397…399, 530; BACKLOG 2.8.6). Written by hand into Prisma's --create-only stub; never edited
-- once applied.
--
-- The migration before this one let the worker read a session's id, phone and end, and end it,
-- so that it could end a phone's sessions as it revoked the phone's key for the firm's time.
-- AC-10-11 says sign-in's records are read by nobody but the API. A monitor's session on such a
-- phone is dead with its key (the API reads the phone before any session), and its turn-in ends
-- it, so the worker is given nothing of `session` after all.
REVOKE ALL ON "session" FROM adms_worker;
