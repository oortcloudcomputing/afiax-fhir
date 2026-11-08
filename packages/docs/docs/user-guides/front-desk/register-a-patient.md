---
sidebar_position: 2
---

# Register a new patient

Use this guide when a patient comes to your facility for the first time. Registering them gives them one record that every department in your facility can see.

**Who this is for:** front desk and records staff.

**How long it takes:** about 3 minutes per patient.

## How registration works

Registration has three steps. The screen shows them across the top, and you complete them in order:

| Step | What it does | Why it matters |
|---|---|---|
| **1. DHA Verification** | Looks the patient up in the Kenya National Client Registry using their government ID | Every patient in Kenya must be on the national registry before a facility can register them. The registry also fills in their name, date of birth and gender for you. |
| **2. System Check** | Checks whether your facility already has a record for this patient | Stops you creating a second record for the same person, which would split their history in two |
| **3. Register** | You check the details, add contact and next of kin, and create the record | This is the patient's record at your facility |

You cannot skip a step. If step 1 or step 2 stops you, the sections [If something goes wrong](#if-something-goes-wrong) below tell you what to do.

## Before you start

You need:

- An Afiax account with permission to register patients. If you can't see the **New...** button in step 1 below, ask your facility administrator.
- The patient's government ID document, or its number. Any one of these is accepted:
  - National ID
  - Alien ID
  - Passport
  - Birth Certificate (usually for children)
  - Refugee ID
- The patient's phone number, if they have one.
- The name and phone number of their next of kin, if they want to give one.

:::tip
Ask for the physical ID document and read the number from it. Most failed lookups are a mistyped number.
:::

## Step 1: Open the new patient screen

1. Sign in to Afiax.
2. In the left menu, under **Favorites**, click **Patient**. You'll see the list of patients already registered at your facility.
3. Click **New...** at the top of the list.

The **New Patient** screen opens, on step 1, **DHA Verification**.

{/* SCREENSHOT: Patients list with the New... button highlighted */}

## Step 2: Verify the patient with DHA

1. In **ID Type**, choose the type of ID the patient has given you. It starts on **National ID**.
2. In **ID Number**, type the number exactly as it appears on the document.
   - For a National ID or Alien ID, type digits only: no spaces or dashes.
   - For a Passport, type letters and digits only.
   - For a Birth Certificate or Refugee ID, you can also use `/` and `-` if they are on the document.

   If the number is not in the right format, a red message appears under the box telling you what is wrong, and you can't search until it's fixed.
3. Click **Search DHA Registry**, or press **Enter**.

{/* SCREENSHOT: DHA Verification step with ID Type and ID Number filled in */}

**What you should see:** a green box headed **Patient verified in DHA Registry**. It shows the patient's full name, date of birth, gender and Registry ID as the registry holds them. The screen moves on to step 2 by itself.

4. **Check the details with the patient.** Read the name and date of birth back to them. If they don't match the person in front of you, stop: you may have the wrong ID number. Click **DHA Verification** at the top to go back and check it.

{/* SCREENSHOT: green "Patient verified in DHA Registry" box */}

## Step 3: Check your facility's records

You are now on step 2, **System Check**. A small teal bar at the top shows the patient's name with a **DHA Verified** badge.

1. Click **Check System Records**.
2. Wait a moment while the screen shows *Checking system records...*.

You'll see one of two results:

- **Green: "No existing record found — safe to register."** This is a new patient. Click **Proceed to Register** and go to [Step 4](#step-4-complete-and-create-the-record).
- **Orange: "Patient already registered."** This patient already has a record at your facility. **Do not register them again.** Click the patient's name in the orange box to open their existing record, and carry on from there. The **Proceed to Register** button stays greyed out so you can't create a duplicate by mistake.

{/* SCREENSHOT: System Check step showing the green "safe to register" result */}

## Step 4: Complete and create the record

You are now on step 3, **Register**. The name, date of birth and gender are already filled in from the national registry.

1. **Check the patient details** at the top of the form:

   | Field | What to do |
   |---|---|
   | **Given Name** | Check the spelling with the patient. |
   | **Family Name** | Required. Check the spelling. |
   | **Date of Birth** | Check it. It can't be in the future or before 1900. |
   | **Gender** | Check it. Choose **Unknown** only if the patient prefers not to say. |
   | **ID Type** and **ID Number** | Greyed out. They come from step 1 and can't be changed here. |
   | **Passport Number**, **Birth Certificate Number** | Optional. Add these if the patient has a second ID. The field for the ID type you used in step 1 is hidden. |

2. **Contact.** Type the patient's **Phone Number**. Either format works: `+254712345678` or `0712345678`. Leave it empty if they have no phone.

3. **Residence.** Choose the **County** from the list, then type the **Sub-county**, **Ward** and **Village / Estate**. All four are optional, but fill in what the patient can tell you. County and sub-county are used in Ministry of Health reports.

4. **Next of Kin.** This section is optional. If you start it, you must complete all three fields:
   - **Next of Kin Name**
   - **Relationship**: Spouse, Parent, Child, Sibling, Guardian, Other family member or Friend
   - **Next of Kin Phone**

   If you change your mind, clear all three fields and the form will accept it.

5. Click **Create Patient**.

{/* SCREENSHOT: Register step, completed form */}

**What you should see:** a green message at the bottom of the screen saying **Patient created**, followed by the family name. The patient's new record opens straight away.

You're done. The patient is now registered and can be sent on to the next step of their visit.

:::note
If **Create Patient** is greyed out, one of the fields has a red message under it. Scroll up, fix that field, and the button becomes available again.
:::

## If something goes wrong

### "Patient not found in DHA Registry"

The national registry has no record for that ID number. You can't register the patient until they are found.

1. Check that **ID Type** matches the document. A passport number searched as a National ID won't be found.
2. Check the number digit by digit against the document, then click **Search DHA Registry** again.
3. Try another ID the patient has, if they have one.
4. If the patient still isn't found, they need to be added to the national registry first. Follow your facility's procedure for this, or contact Afiax support.

### "Patient already registered"

The patient already has a record at your facility. Click their name in the orange box to open it. Don't try to work around this. Two records for one patient means clinicians will see only part of their history.

If the existing record has wrong details, correct them on that record rather than creating a new one.

### A red error box appears after you click a button

This usually means Afiax couldn't reach the national registry, or your connection dropped.

1. Wait a minute and click the button again.
2. If it keeps happening, note the error message and the time, and contact your facility administrator or Afiax support.

### The registry shows the wrong name or date of birth

Don't change the details to match what the patient says without checking. First make sure you used the right ID number. If the registry's details really are wrong, the patient needs to have them corrected through DHA. You can still register the patient with the corrected spelling in step 4, but record why, following your facility's procedure.

## Good to know

- **Why is DHA verification mandatory?** Kenyan health regulations require every patient to have a national Client Registry ID. It lets a patient's records follow them between facilities.
- **Can I go back a step?** Yes. Use the **Back** button, or click a step you've already completed at the top of the screen. You can't jump ahead to a step you haven't reached.
- **Changing the ID number** in step 1 clears the search result. You'll need to search again.

## Behind the scenes

For supervisors and auditors: registering a patient creates one FHIR `Patient` record. It holds:

- The government ID you searched with
- The national Client Registry ID
- Name, date of birth and gender
- Phone, residence and next of kin, if you entered them

Creating the record is written to the audit trail with your user name and the time, and every later change is kept in the record's history.

## Next steps

- [Find an existing patient](./find-a-patient.md)

- [Check a patient's SHA cover](./check-sha-cover.md)
