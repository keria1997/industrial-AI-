# Procurement Frontend

`PurchaseReceiptModal` records one delivery batch with its quantity and external
reference through the existing procurement client. The server owns inspection
and posting status.

`ProcurementExecutionPanel` queries receipts and returns, submits whole-batch IQC,
creates returns and processes only approved returns. It does not simulate return
approval, inventory posting or AP facts. Partial inspection and return approval
need the contracts listed in technical design section 10.6.

Keep quantity strings and idempotency keys stable when retrying unknown commands.
