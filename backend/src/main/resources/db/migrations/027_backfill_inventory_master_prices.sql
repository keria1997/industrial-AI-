-- JSON inventory master data was already in use before unit_price was added.
UPDATE module_document
SET data = jsonb_set(data, '{unitPrice}', to_jsonb(COALESCE(data ->> 'unitPrice', '0')))
WHERE module = 'fulfillment'
  AND kind IN ('product', 'material')
  AND NOT (data ? 'unitPrice');
