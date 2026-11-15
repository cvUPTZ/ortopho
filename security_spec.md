# Firestore Security Specification

## 1. Data Invariants
1. Every document across `/practices/{userId}` and all subcollections (`patients`, `rdvs`, `bilans`, `aiSheets`, `aiLogs`) is strictly owned by `{userId}` (`ownerId == request.auth.uid == userId`) with `request.auth.token.email_verified == true`.
2. Every subcollection document (`patients`, `rdvs`, `bilans`, `aiSheets`, `aiLogs`) requires the parent `/practices/{userId}` document to exist and have `ownerId == request.auth.uid`.
3. `rdvs` and `bilans` cannot be created as orphans: on `create`, `incoming().pid` must reference an existing document in `/practices/{userId}/patients/{pid}`.
4. `ownerId`, `id`, and `createdAt` are immutable after document creation. `createdAt == request.time` on `create` and `updatedAt == request.time` on both `create` and `update`.
5. No user can list `/practices`; users can only list their own subcollections where `resource.data.ownerId == request.auth.uid`.
6. Unmatched paths are denied by the top-level default-deny rule.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write**: Read `/practices/uid1` or `/practices/uid1/patients/p1` with `request.auth == null`.
2. **Unverified email write**: Create `/practices/uid1` with `request.auth.uid == 'uid1'` and `request.auth.token.email_verified == false`.
3. **Cross-tenant read/list**: User `uid2` attempts `get` or `list` on `/practices/uid1/patients`.
4. **Identity spoofing**: User `uid2` attempts `create` on `/practices/uid2/patients/p1` with `ownerId: 'uid1'`.
5. **Shadow / ghost field injection**: User `uid1` creates or updates `/practices/uid1/patients/p1` with an extra field `isAdmin: true`.
6. **ID mismatch / poisoning**: User `uid1` creates `/practices/uid1/patients/p1` with `id: 'p2'` or a 200-char ID or invalid characters `p1/../../etc`.
7. **Orphaned appointment create**: User `uid1` creates `/practices/uid1/rdvs/r1` whose `pid` does not exist in `/practices/uid1/patients`.
8. **Orphaned bilan create**: User `uid1` creates `/practices/uid1/bilans/b1` whose `pid` does not exist in `/practices/uid1/patients`.
9. **Immutable field tampering**: User `uid1` updates `/practices/uid1/patients/p1` changing `ownerId` or `createdAt`.
10. **Client-forged timestamp**: User `uid1` creates or updates a document with `updatedAt` != `request.time`.
11. **Oversized array / Denial of Wallet**: User `uid1` updates `/practices/uid1` with `staff` containing 25 entries (`> 20`), or creates an `rdv` with `note.size() > 10000`.
12. **Blanket list scraping**: User `uid1` queries `/practices` collection or queries `/practices/uid1/patients` without `where('ownerId', '==', uid1)`.
