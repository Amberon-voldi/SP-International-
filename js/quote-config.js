// Public quotation settings. No owner submission service is connected yet.
// Keep endpoint empty until the owner connects and verifies an HTTPS service.
// This file is public: NEVER put API keys, passwords or other secrets here.
//
// Contract for an owner-controlled service:
// - Accept a CORS-enabled POST with Content-Type: application/json from this site.
// - JSON fields: product, productLabel, country, email, name, company, whatsapp,
//   quantity, unit (kg or tonnes when quantity is present), message, and enquiry.
// - Return a 2xx response with JSON { "received": true } only after accepting it.
//   That acknowledgement is not proof of delivery to the company's email inbox.
// - The service owns lead handling, abuse protection and its retention policy.
//   Verify its actual receipt and privacy requirements before public activation.
// - Redirects and non-HTTPS URLs are rejected; no client credentials are sent.
window.SP_QUOTE_CONFIG = Object.freeze({
  endpoint: "",
  timeoutMs: 12000
});
