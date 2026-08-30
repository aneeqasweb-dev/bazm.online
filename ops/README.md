# Production operations configuration

`terraform/production-readiness.tf.json` is the deploy-ready source of truth for
the production uptime check, error/security alerts, cost budget, and Firestore
daily/weekly backup schedules. It intentionally does not create notification
channels because channel addresses and integrations can be sensitive and must be
owned outside the repository.

## Safe apply sequence

1. Create separate staging and production Firebase projects and select the
   production billing account.
2. Create at least two Cloud Monitoring notification channels owned by separate
   responders. Verify both before using their resource names.
3. Copy `terraform.tfvars.example` to an ignored `terraform.tfvars`, replace all
   placeholders, and use a remote encrypted Terraform state backend with narrow
   IAM access.
4. Run `terraform init`, `terraform fmt -check`, `terraform validate`, and
   `terraform plan -out=production.tfplan` from `ops/terraform`.
5. Have the operations owner review the plan, then apply the saved plan.
6. Follow `docs/operations-runbook.md` to send a test alert and
   `docs/data-migration-and-recovery.md` to validate backup visibility.

The protected release-candidate workflow validates environment values without
printing them, runs the full emulator regression gate, and then runs
`npm run smoke:release` against the configured HTTPS staging/production URL.

Terraform state is ignored by the repository and must never be attached to a
ticket or CI artifact because provider state can contain operational metadata.
