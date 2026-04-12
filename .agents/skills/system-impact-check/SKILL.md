---
name: system-impact-check
description: Mandatory evaluation of changes across all BBSNS flows (Owner, Notary, Admin, DB, Workers, Blockchain).
---

# BBSNS System Impact Check

This skill MUST be invoked before any significant architectural or state-modifying change is performed.

## 🧠 Ground Rule: Mandatory Multidimensional Impact Evaluation

Evaluate the impact on the following flows and components:
- **Owner flow** (Registration, Onboarding, Upload, Notarization)
- **Notary flow** (Login, Approval, Rejection)
- **Admin flow** (User Management, Governance)
- **Backend API** (Routes, Middleware, Services)
- **Database** (Schema, Triggers, Migrations)
- **Workers** (Reconciliation, Cleanup, Performance)
- **Blockchain** (Finality, Sync, Role Consistency)

## 🔴 RULE_1: SYSTEM IMPACT CHECK (MANDATORY)

Every proposed change MUST document:
1. **What it affects**: List all system components identified above.
2. **What can break**: Identify the worst-case failure mode for each affected component.
3. **Expected behavior**: Define the "Success" state after the change is applied.

**If this evaluation is missing or incomplete → the operation is BLOCKED.**
