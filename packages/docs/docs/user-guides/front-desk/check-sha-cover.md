---
sidebar_position: 4
---

# Check a patient's SHA cover

Use this guide to find out whether the Social Health Authority (SHA) will pay for a patient's care before you treat them. The check asks DHA directly and tells you within a few seconds whether the patient is covered.

**Who this is for:** front desk, records and billing staff.

**How long it takes:** about 2 minutes the first time for a patient, and a few seconds after that.

## How the cover check works

In Afiax, a patient's SHA membership is kept in a separate **cover record** linked to the patient. You create it once, then use it to run the check at every visit.

| Step | What you do | When |
|---|---|---|
| **1. Create the cover record** | Link the patient to SHA | Once per patient, the first time they use SHA |
| **2. Save the lookup ID** | Enter the ID that DHA should search with | Once, or when the patient's ID changes |
| **3. Check cover** | Ask DHA whether the patient is covered today | At every visit |

## Before you start

You need:

- An Afiax account with permission to create cover records. If you get a permission error in step 1, ask your facility administrator.
- The patient must already be registered. If they aren't, [register them first](./register-a-patient.md).
- SHA must be set up in Afiax as an organisation. Your facility administrator does this once for the whole facility. If you can't find SHA in step 1, ask them.
- One of these numbers from the patient:
  - National ID
  - Alien ID
  - SHA Number
  - Refugee ID
  - Mandate Number
  - Temporary ID

:::tip
Use the same ID the patient registered with at SHA. A National ID usually works.
:::

## Step 1: Create the cover record

You only do this the first time a patient uses SHA at your facility. If they already have a cover record, go to [Check cover again at a later visit](#check-cover-again-at-a-later-visit).

There is no menu item for cover records yet, so you open the screen through the browser's address bar.

1. Click the browser's address bar at the top of the window.
2. Type your Afiax address followed by `/Coverage/new`, for example `app.afiax.africa/Coverage/new`, and press **Enter**.

   A long form opens, headed **New Coverage**. You only need to fill in three fields; leave the rest empty.

3. **Status:** choose **active**.
4. **Beneficiary:** this is the patient. Click the box, type the first letters of the patient's name, and choose them from the list. Check the date of birth to make sure you have the right person.
5. **Payor:** this is SHA. Click the box, type `SHA` or `Social Health`, and choose SHA from the list.
6. Scroll to the bottom of the form and click **Create**.

{/* SCREENSHOT: New Coverage form with Status, Beneficiary and Payor filled in */}

**What you should see:** the new cover record opens. At the top is a section headed **Kenya Coverage Eligibility**, with a yellow note saying *Enter the DHA eligibility identifier to continue.*

:::tip
Bookmark this page in your browser, or note its address. It makes the patient's next check much quicker.
:::

## Step 2: Save the lookup ID

This tells DHA which ID to search for.

1. In the **Kenya Coverage Eligibility** section, choose the **ID Type**. It starts on **National ID**.
2. Type the number in **ID Number**, exactly as it appears on the document.
3. Click **Save**.

**What you should see:** a green message saying **Eligibility lookup saved**, and the **Check Coverage** button becomes available.

{/* SCREENSHOT: Kenya Coverage Eligibility section with ID Type and ID Number filled in */}

:::note
If you see a blue note saying *Save before running the check*, you've changed the ID but not saved it yet. Click **Save** first. **Check Coverage** stays greyed out until you do.
:::

## Step 3: Check cover

1. Click **Check Coverage** at the top right of the section.
2. Wait a few seconds while Afiax asks DHA.

**What you should see:** a green message saying **Coverage check complete**. Next to the **Kenya Coverage Eligibility** heading, a badge shows the answer, and the details appear underneath.

{/* SCREENSHOT: completed check showing the ELIGIBLE badge and details */}

### Reading the result

| You see | It means | What to do |
|---|---|---|
| Green **ELIGIBLE** badge | SHA covers the patient today | Carry on with the visit. Check **Coverage Ends** and tell the patient if their cover runs out soon. |
| Red **INELIGIBLE** badge | SHA does not cover the patient today | Read **Message** and **Reason** below the badge. Tell the patient, and follow your facility's procedure for patients who will pay themselves. |
| **error**, with no green or red badge | The check didn't work, so you don't know yet | See [The result says "error"](#the-result-says-error) below. |

The details under the badge are:

- **Status:** *eligible*, *ineligible* or *error*.
- **Member Name:** the name SHA has for this member. **Check it matches the patient.** If it doesn't, you may have the wrong ID number.
- **Message:** DHA's explanation, in plain words.
- **Coverage Ends:** the date the patient's cover runs out, if DHA gives one.
- **Reason:** why the patient isn't covered, if they aren't.

Click **All eligibility details** to see more, including DHA's **Suggestion** for how the patient can fix an ineligible result. Your supervisor or Afiax support may ask you for the **DHA Request ID** shown there.

## Check cover again at a later visit

SHA cover can change from month to month, so check it at every visit. You don't need to create a new cover record: use the one from step 1.

1. Open the patient's cover record using your bookmark.

   If you didn't bookmark it, type your Afiax address followed by `/Coverage` in the address bar. The list doesn't show patient names yet, so open each recent record until you find the one whose **Beneficiary** is your patient. This is slow, which is why a bookmark is worth making.
2. Click **Check Coverage**.

The last result stays on the cover record until you check again, so you can always see when it was last checked.

## If something goes wrong

### The result is ineligible

The patient isn't covered today. Common reasons are unpaid contributions or a membership that hasn't been activated. Click **All eligibility details** and read the **Suggestion** to the patient: it usually tells them what to do with SHA. The patient has to sort it out with SHA; you can't change it in Afiax.

### The result says "error"

The check didn't reach DHA, or DHA couldn't answer. It doesn't mean the patient isn't covered.

1. Read the **Message**. If it says the lookup identifier is missing, go back to [Step 2](#step-2-save-the-lookup-id) and save the ID.
2. Otherwise, wait a minute and click **Check Coverage** again.
3. If it still fails, note the message and the time, and contact your facility administrator or Afiax support.

### A red box says the cover "must include an Organization payor"

The cover record isn't linked to SHA. Ask your facility administrator to fix the **Payor** on the record, or create the record again following [Step 1](#step-1-create-the-cover-record).

### The Member Name is someone else

Stop: the ID number belongs to a different person. Check the number against the patient's document, correct it in **ID Number**, click **Save**, then **Check Coverage** again.

### I can't find SHA in the Payor box

SHA hasn't been set up as an organisation in your facility's Afiax account yet. Your facility administrator needs to add it before anyone can create cover records.

## Good to know

- **Checking doesn't change the patient's SHA membership.** It only reads it. You can check as often as you need.
- **Changing the ID clears the old result.** When you save a new ID, the previous result is removed so it can't be mistaken for the new one.

## Behind the scenes

For supervisors and auditors: the cover record is a FHIR `Coverage` linked to the patient and to SHA. Each check creates a `CoverageEligibilityRequest` and a `CoverageEligibilityResponse` holding DHA's answer, and a `Task` that tracks the request. They're linked from **All eligibility details**, so every check can be traced.

## Next steps

- [Find an existing patient](./find-a-patient.md)
