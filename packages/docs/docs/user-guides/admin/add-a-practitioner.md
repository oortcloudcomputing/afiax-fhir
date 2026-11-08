---
sidebar_position: 2
---

# Add a practitioner and verify their licence

Use this guide to add a clinician to Afiax and check their licence against the Kenya Health Workforce Registry (HWR). Only licensed practitioners should be allowed to treat patients and prescribe.

**Who this is for:** facility administrators and HR staff.

**How long it takes:** about 3 minutes.

## Before you start

You need the practitioner's licence or registration details. Which ones depends on their cadre:

| Registry / Licence Type | For | What to enter |
|---|---|---|
| **KMPDC Licence No.** | Doctors and dentists, registered with KMPDC | Licence number, for example `M0031534` |
| **COC Licence No.** | Clinical officers registered with the Clinical Officers Council | Licence number, for example `COC/12345` |
| **PPB (National ID)** | Pharmacists and pharmaceutical technologists | Their National ID number |
| **NCK (National ID)** | Nurses and midwives | Their National ID number |
| **National ID** | Others | Their National ID number |
| **Passport** | Foreign practitioners | Their passport number |

## Step 1: Search the registry

1. In the left menu, under **Favorites**, click **Practitioner**.
2. Click **New...**. The **New Practitioner** screen opens, on the **Registry Search** step.
3. Choose the **Registry / Licence Type**.
4. Type the number in the box below it.
5. Click **Search AfyaLink HWR**.

{/* SCREENSHOT: Registry Search step */}

The screen moves on to **Practitioner Details** and shows the result:

- **Green: "Registration verified in Kenya HWR — Active".** The licence is valid. The registry details are shown under **HWR Registry Data**.
- **Green, but "Inactive / Lapsed".** The person is registered, but their licence isn't current. **Don't let them practise** until they renew it. Tell your facility manager.
- **Yellow: "Practitioner not found in Kenya HWR — proceeding with manual entry."** Check the type and number and try again: click **Back**.

Use **Skip HIE search** only for staff who don't have a licence, such as records or billing staff.

## Step 2: Confirm and create

1. Check or type the **Given Name** and **Family Name**. The family name is required.
2. Check that the **Registry / Licence Type** and number are right.
3. Click **Create Practitioner**.

**What you should see:** a green message saying **Practitioner created**, followed by the family name. The practitioner's record opens.

To give them an account to sign in with, see [Invite a staff member](./invite-users.md).

## Re-check a licence later

Licences expire, so check them regularly, for example every year.

1. Open the practitioner's record (**Favorites → Practitioner**, then click their name).
2. Find the section headed **Kenya Practitioner Verification**.
3. Check the **Registry** and number. If you change them, click **Save** first.
4. Click **Lookup** to see what the registry holds today, or **Verify** to run a full verification and record the result on the practitioner's record.

**What you should see:** after **Verify**, a green message saying **Verification complete**, and a badge next to the heading: green **VERIFIED**, or red if there was a problem. The details show the **Registration No.**, whether the licence is **Active**, and when it was **Verified**.

{/* SCREENSHOT: Kenya Practitioner Verification section with a verified result */}

## If something goes wrong

### Not found in the registry

Check the number on the practitioner's licence certificate. Doctors' KMPDC numbers include a letter prefix, for example `M`. If they still aren't found, ask the practitioner to check their registration with their council.

### A red error message

Afiax couldn't reach the registry. Wait a few minutes and try again. If it keeps happening, contact Afiax support.
