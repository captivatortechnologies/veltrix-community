-- Optional OS login user for SSH to a component (e.g. root, ubuntu). The shell
-- account, distinct from any application/API credential. Additive, nullable.
ALTER TABLE "Component" ADD COLUMN "sshUser" TEXT;
