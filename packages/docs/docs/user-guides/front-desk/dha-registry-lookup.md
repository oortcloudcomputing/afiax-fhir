---
sidebar_position: 5
---

# Look up a patient in the DHA Client Registry

Use this guide to link an existing patient record to the Kenya National Client Registry. Patients registered with the [new patient screen](./register-a-patient.md) are already linked, so you'll mostly need this for records created before that, or records that were never verified.

**Who this is for:** front desk and records staff.

**How long it takes:** under a minute.

## When to use this

- The patient's record has no **DHA Client Registry ID**.
- The patient's record was created before your facility started using the DHA check.
- The patient has a new ID document, for example a National ID after previously using a Birth Certificate.

## Before you start

You need:

- The patient's record open on your screen. See [Find an existing patient](./find-a-patient.md).
- The patient's government ID document: National ID, Alien ID, Passport, Birth Certificate or Refugee ID.

## Steps

1. Open the patient's record.
2. Near the top of the record is a section headed **DHA Client Registry**.
   - If it already shows a green box with a **DHA Client Registry ID**, the patient is already linked. You don't need to do anything.
   - If it shows a yellow note saying *Enter an identification document to look up this patient in the DHA Client Registry*, carry on.
3. Choose the **ID Type** of the patient's document.
4. Type the number in **ID Number**, exactly as it appears on the document.
5. Click **Resolve Identity**.

{/* SCREENSHOT: DHA Client Registry section with ID Type and ID Number filled in */}

## Reading the result

A badge appears next to the **DHA Client Registry** heading, and the details are listed underneath.

| Badge | It means | What to do |
|---|---|---|
| Green **RESOLVED** | DHA found the patient, and their Client Registry ID is now saved on the record | Check that **Full Name**, **Date of Birth** and **Gender** match the patient. |
| Yellow **NOT-FOUND** | DHA has no record for that ID | Check the ID type and number and try again. See [If something goes wrong](#if-something-goes-wrong). |
| Red **ERROR** | The lookup didn't reach DHA | Wait a minute and try again. |

{/* SCREENSHOT: green RESOLVED result with Client Registry ID */}

:::caution
If the name or date of birth DHA returns doesn't match the patient in front of you, you've probably looked up the wrong ID. Check the number before you carry on. Don't leave a wrong Client Registry ID on a patient's record: tell your facility administrator so it can be corrected.
:::

## If something goes wrong

### NOT-FOUND

1. Check that **ID Type** matches the document. A passport number looked up as a National ID won't be found.
2. Check the number digit by digit.
3. Try another ID document the patient has.
4. If the patient still isn't found, they need to be added to the national registry first. Follow your facility's procedure, or contact Afiax support.

### ERROR, or a red message box

Afiax couldn't reach DHA. Wait a minute and click **Resolve Identity** again. If it keeps happening, note the message and the time, and contact your facility administrator or Afiax support.

## Good to know

- **The result is kept on the record.** Next time anyone opens the record, the **DHA Client Registry** section shows the last result and when it was found (**Resolved**).
- **A lookup doesn't change the patient's name or other details** in Afiax. If DHA's details are different, correct the record yourself after checking with the patient.

## Next steps

- [Check a patient's SHA cover](./check-sha-cover.md)
