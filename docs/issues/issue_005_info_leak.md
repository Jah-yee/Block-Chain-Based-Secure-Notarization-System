# ISSUE-005: Information Leak in Application Status

## Description
The endpoint `/api/notaries/applications/status/:id` is marked as `allowPublic` and returns the applicant's email address.

```javascript
router.get("/applications/status/:id", allowPublic, async (req, res) => {
  // ...
  res.json(result.rows[0]); // Returns email
});
```

## Impact
- **Privacy Medium**: An attacker can iterate over application IDs to harvest a list of full names and email addresses of notary applicants.

## Proposed Resolution
- Mask the email address (e.g., `te***@example.com`) or remove it from the public status response.
- Only return the `status` and `id` to the public.
