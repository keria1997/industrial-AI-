# Finance Frontend

Finance screens call the business backend through `src/api/finance.ts`.
`PaymentAllocationModal` registers the user's explicit partial amount.
`PaymentsPanel` queries records and confirms them separately with a server version.
The frontend never creates invoices, vouchers, allocation facts or reversals locally.

Keep decimal amounts as strings in commands. Failed or unknown writes preserve the
form; unknown retries reuse the original key and input. Read PRD and technical
design section 10.6 before extending the workflow.
