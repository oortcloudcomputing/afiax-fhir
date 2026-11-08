---
sidebar_position: 1
---

# Start a visit

Every time a patient is seen, you open a **visit** for them. Vital signs, orders and prescriptions are all recorded against the visit, so the visit has to exist before you can do any of these.

**Who this is for:** clinicians, nurses, and front desk staff who open visits for clinicians.

**How long it takes:** about 2 minutes.

## Before you start

You need:

- The patient registered at your facility. See [Find an existing patient](../front-desk/find-a-patient.md).
- Permission to create visits. If you get a permission error, ask your facility administrator.

## Step 1: Create the visit

There is no menu item for visits yet, so you open the screen through the browser's address bar.

1. Click the browser's address bar.
2. Type your Afiax address followed by `/Encounter/new`, for example `app.afiax.africa/Encounter/new`, and press **Enter**.

   A long form opens, headed **New Encounter**. You only need three fields; leave the rest empty.

3. **Status:** choose **in-progress**. You can also use **arrived** or **triaged**. You can't add orders or vital signs to a visit with any other status.
4. **Class:** type `ambulatory` and choose **ambulatory** for an outpatient visit. Choose **emergency** for an emergency visit.
5. **Subject:** this is the patient. Type the first letters of their name and choose them from the list. Check the date of birth.
6. Scroll to the bottom and click **Create**.

{/* SCREENSHOT: New Encounter form with Status, Class and Subject filled in */}

**What you should see:** the new visit opens. Near the top is a panel headed **Clinical orders**, with the tabs **Place order**, **Vital signs**, **Family history** and **Order history**.

:::tip
Bookmark the visit, or keep its browser tab open while you see the patient. There is no visit list on the patient's record yet, so this is the quickest way back to it.
:::

## Step 2: Set the visit type

1. At the top right of the **Clinical orders** panel, click the **Visit type** box.
2. Choose the kind of visit:

   | Visit type | Use for |
   |---|---|
   | Outpatient Visit | A general outpatient consultation |
   | Emergency Encounter | Emergency and casualty |
   | Maternal and Child Health Visit | MCH clinic |
   | Antenatal Visit | ANC |
   | Postnatal Visit | PNC |
   | Child Welfare Clinic | CWC |
   | HIV Clinic Visit | CCC and HIV care |
   | TB Clinic Visit | TB clinic |
   | Chronic Disease Clinic Visit | Diabetes, hypertension and other chronic conditions |
   | Laboratory Encounter | Lab-only visits |
   | Pharmacy Encounter | Pharmacy-only visits, such as refills |

**What you should see:** a green message saying **Visit type set to**, followed by the type you chose. The visit type is saved straight away; there is nothing else to click.

The visit type is used for billing and Ministry of Health reports, so choose it carefully.

## If something goes wrong

### The panel says "This encounter is …. Orders and vital signs can only be added to an active encounter."

The visit's status isn't one that allows orders. The **Place order** and **Vital signs** tabs are greyed out, but you can still see **Order history**. If the patient is still being seen, ask your facility administrator to correct the visit's status.

### I can't find the patient in the Subject box

Type fewer letters, or the surname only. If they still don't appear, they aren't registered yet: [register them first](../front-desk/register-a-patient.md).

## Next steps

- [Record vital signs](./record-vital-signs.md)
- [Read a patient's clinical summary](./clinical-summary.md)
- [Place an order](./place-an-order.md)
- [Prescribe a medicine](./prescribe-a-medicine.md)
