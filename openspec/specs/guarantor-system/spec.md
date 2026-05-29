# guarantor-system Specification

## Purpose

Management of aval (guarantor) relationships linking guarantors to borrowers and specific credits.

## Requirements

### Requirement: Cascade on Score

If an aval's `score_reputacion` drops below 30, their active avales SHOULD be flagged for review.

- GIVEN an aval with active avales
- WHEN their score drops to 25
- THEN a warning is logged in the audit trail
