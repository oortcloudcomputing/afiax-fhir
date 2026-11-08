---
sidebar_position: 8
---

# Publish a patient's record to the Shared Health Record

The Kenya Shared Health Record (SHR) lets other facilities see a patient's key health information when the patient goes there. Publishing sends a copy of the patient's summary from Afiax to the SHR.

**Who this is for:** clinicians and records staff.

**How long it takes:** under a minute.

## Before you start

- **Get the patient's consent.** Explain that their health summary will be shared with other facilities through the national record, and follow your facility's consent procedure. Afiax doesn't check consent for you yet.
- The patient should be linked to the DHA Client Registry. Patients registered with the [new patient screen](../front-desk/register-a-patient.md) already are; for others, see [Look up a patient in the DHA Client Registry](../front-desk/dha-registry-lookup.md).

## Steps

1. Open the patient's record. See [Find an existing patient](../front-desk/find-a-patient.md).
2. Find the section headed **Kenya SHR Publication**.
3. Choose what to include:
   - **Include active Conditions:** the patient's current diagnoses. Ticked by default.
   - **Include recent Encounters:** the patient's recent visits. Not ticked by default.
4. Click **Publish to SHR**.

{/* SCREENSHOT: Kenya SHR Publication section */}

## Reading the result

| Badge | It means |
|---|---|
| Green **PUBLISHED** | The record was sent. A green box shows the **SHR Record ID** and when it was published. |
| Red **ERROR** | The record wasn't sent. Read the **Message**. |

The details below the badge also show how many items were sent (**Bundle Entries**).

## If something goes wrong

### The result is ERROR

1. Read the **Message**. It usually says why.
2. Wait a minute and click **Publish to SHR** again.
3. If it still fails, note the message and the time, and contact your facility administrator or Afiax support.

## Good to know

- **Publish again after important changes,** such as a new diagnosis. The SHR holds the summary as it was when you last published.
- **The last result stays on the record,** so anyone can see whether, and when, it was published.
