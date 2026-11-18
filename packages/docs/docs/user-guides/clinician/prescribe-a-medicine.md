---
sidebar_position: 5
---

# Prescribe a medicine

Use this guide to prescribe a medicine during a visit. As soon as you choose the medicine, Afiax checks it against the patient's record and warns you about allergies, interactions and other risks, before you send it to the pharmacy.

**Who this is for:** clinicians who prescribe.

**How long it takes:** about a minute per medicine.

## Before you start

You need:

- A visit open for the patient, with status **arrived**, **triaged** or **in-progress**. See [Start a visit](./start-a-visit.md).
- The patient's allergies recorded. Check the [clinical summary](./clinical-summary.md) first. The safety check can only warn you about allergies that have been recorded.

## Steps

1. Open the patient's visit.
2. In the **Clinical orders** panel, click the **Place order** tab. **Order type** is already set to **Medication**.
3. Choose the **Priority**: **Routine**, **Urgent** or **STAT (immediately)**.
4. Click **Medicine (KNHTS HPT registry)** and type at least 2 letters of the medicine's name, for example `amoxi`. Choose the right medicine, strength and form from the list.
5. **Read the safety check.** It appears straight away, under the form. See [Understanding the safety check](#understanding-the-safety-check).
6. Fill in the dose. All four boxes are required:
   - **Dose**: the amount per dose, for example `500`.
   - **Unit**: for example **mg**, **tablet** or **mL**.
   - **Frequency**: for example **TDS (three times daily)**. Choose **STAT (single dose now)** for a single dose.
   - **Route**: for example **Oral**.

   Afiax fills in **Unit** and **Route** from the medicine's name. For example, *Amoxicillin 500 mg Oral Capsule* gives **capsule** and **Oral**. Check them and change them if needed.
7. In **Duration (days)**, type how many days the course lasts, for example `5`. You can skip this for a STAT dose.
8. Check **Quantity to dispense**. For tablets, capsules and other countable units, Afiax works it out from the dose, frequency and duration. For example, 1 capsule three times daily for 5 days gives `15`. For mg or mL doses, type the quantity yourself.
9. Optional: in **Instructions for the patient**, add anything else the patient should know, for example `Take with food`. If you leave it empty, Afiax writes the instructions from the dose, for example *500 mg oral three times daily for 5 days*.
10. If the pharmacist needs to know something, type it in **Clinical note**.
11. Click **Place order**.

{/* SCREENSHOT: Place order tab with a medication filled in and a green "No alerts" result */}

**What you should see:** a green message saying **Medication order sent to Pharmacy**, followed by the prescription code, for example **Prescription code RX-7KQ2-M9XD-3T**. The prescription code identifies this prescription. It follows the Digital Health Agency's ePrescription standard. The prescription is now in the pharmacy queue, and in the patient's **Active medicines**.

## Understanding the safety check

### Green: no alerts

A green box says *No allergy, interaction or contraindication alerts.* Carry on.

### Coloured alerts

Each alert has a title explaining the problem. The colour shows how serious it is:

| Colour | Severity | Examples |
|---|---|---|
| Red | High | The patient is allergic to the medicine; it's contraindicated in pregnancy; it isn't safe at the child's age |
| Orange | Moderate | Possible cross-reactivity with an allergy; duplicate therapy with a medicine the patient already takes; an interaction |
| Yellow | Low | Something to be aware of |

The safety check also looks at the patient's recorded conditions and their latest lab results, for example kidney function.

**For orange and yellow alerts,** read them, decide whether to go ahead, and carry on.

**For red alerts,** the safest choice is usually a different medicine: choose another one in step 4 and the check runs again. If you have a clinical reason to prescribe it anyway:

1. A box headed **Reason for prescribing despite the alert** appears. Type your reason. It must be at least 10 characters, for example `No alternative available; benefits discussed with patient; monitoring for reaction.`
2. The button changes to **Override and place order**. Click it.

Your reason is saved with the prescription, so the pharmacist and anyone reviewing the record can see why the alert was overridden.

{/* SCREENSHOT: red allergy alert with the override reason box */}

:::caution
Never override an alert to save time. An override is a clinical decision that is recorded under your name.
:::

## If something goes wrong

### Place order is greyed out

Check that:

- you've clicked a medicine from the list, not just typed its name;
- **Dose**, **Unit**, **Frequency**, **Route** and **Quantity to dispense** are filled in;
- **Duration (days)** is filled in, unless the frequency is STAT;
- for a red alert, your reason is at least 10 characters long.

### "No KNHTS match"

Try the generic name instead of a brand name, or fewer letters. Afiax only offers medicines from the national HPT registry in KNHTS.

### I prescribed the wrong medicine

Tell the pharmacy straight away so it isn't dispensed. There is no cancel button on this screen yet.

## Next steps

- [Place an order](./place-an-order.md)
- [Work your department queue](../departments/department-queue.md): what the pharmacy does next
