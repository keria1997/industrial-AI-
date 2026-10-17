# Inventory Frontend

`model/` maps authoritative inventory facts and shipment states without creating stock locally.
`outboundPresentation.ts` resolves product names/codes by stable ID independently of availability.
Missing metadata is displayed explicitly and never substituted into business commands.

`components/ManualInboundModal.tsx` provides permission-filtered navigation to stock queries,
procurement receipts, and production completion. It does not import an availability snapshot
or report a manual inbound as posted. A dedicated manual-inbound contract remains required.

`pages/` contains warehouse/product/material maintenance and inventory queries.
All business requests go through the business-backend API clients.
