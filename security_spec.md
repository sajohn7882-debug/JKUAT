# Security Specification & Threat Model: JKUAT Wayfinder

## 1. Data Invariants
- **Identity Integrity**: All authenticated user operations require `request.auth != null`. An incoming record's `userId` or `senderId` must strictly equal `request.auth.uid`.
- **String & Document Size Enforcements**: Document IDs must pass `isValidId` (`size <= 128` and matching `^[a-zA-Z0-9_\-]+$`) to prevent denial-of-wallet or path poisoning attacks. All string fields have explicit character length upper bounds (title <= 100, comment <= 500, message <= 1000).
- **Relational Ownership**: Users can only query, modify, or delete their own expense records (`resource.data.userId == request.auth.uid`). No blanket reads or insecure queries are permitted.
- **Terminal State Guard**: Stranded alerts can only be transitioned via `affectedKeys().hasOnly(['resolved'])`.
- **Default Deny**: All unmapped documents and root-level queries are rejected via `match /{document=**} { allow read, write: if false; }`.

## 2. The "Dirty Dozen" Malicious Payloads

1. **Spoofed User Creation**: A non-matching user payload where `auth.uid == "userA"` attempts to write to `/users/userB`.
2. **Shadow Field Injection in Expense**: An expense payload containing an undocumented field `{ "isAdmin": true, "unauthorizedBonus": 9999 }`.
3. **Cross-Tenant Expense Read**: Authenticated student A attempts to read an expense owned by student B at `/expenses/{studentB_expense}`.
4. **Denial-of-Wallet Path Variable Attack**: Attempting to create an expense with a 2KB junk character ID (`/expenses/AAAAAAAAAAAAAAAA...`).
5. **Negative Value Poisoning**: An expense created with a negative monetary amount `{ "amount": -500 }`.
6. **Chat Identity Impersonation**: Sending a chat message with `senderId: "dean_of_students"` while authenticated as `student_123`.
7. **Experience Rating Overflow**: Submitting a route review with a rating out of bounds `{ "rating": 999 }`.
8. **Unauthenticated Expense Modification**: Unauthenticated `UPDATE` or `DELETE` on `/expenses/{id}`.
9. **Blanket Query Scraping**: Attempting a collection-wide query on `/expenses` without scoping by `userId == auth.uid`.
10. **Stranded Alert Field Hijacking**: Attempting to alter the `location` or `message` of an existing alert during resolution instead of only `affectedKeys().hasOnly(['resolved'])`.
11. **PII Extraction Attempt**: An unauthorized student attempting `GET` on another student's private profile document.
12. **Root Escaping Wildcard Query**: Attempting to read `/databases/{database}/documents/{anything}` directly.

## 3. Verified Defense Rule Set
All Firestore rules enforce strict property checks, size limits, and ABAC policies deployed via `firestore.rules`.
