---
sidebar_position: 3
---

# Read a patient's clinical summary and record allergies

The clinical summary is the first thing to read when you see a patient. It shows their allergies, any clinical alerts, the medicines they're taking and their growth, all in one place.

**Who this is for:** clinicians, nurses and pharmacists.

**How long it takes:** a minute to read; a minute to add an allergy.

## Open the summary

1. Open the patient's record. See [Find an existing patient](../front-desk/find-a-patient.md).
2. Find the panel headed **Clinical summary**.

At the top of the panel, before you click anything, two badges give you the most important facts:

| Badge | It means |
|---|---|
| Red **Allergies:** followed by names | The patient has these active allergies. Always read this before prescribing. |
| Grey **No known allergies** | No allergy has been recorded. It doesn't prove the patient has none: ask them. |
| Orange **clinical alert(s)**, with a number | There are high-severity alerts. Open the **Clinical alerts** tab. |

{/* SCREENSHOT: Clinical summary panel showing the allergy and alert badges */}

## The five tabs

### Clinical alerts

Alerts raised automatically, for example from a dangerous vital sign or a critical lab result. Each alert shows:

- a title and a short explanation;
- its colour: **red** is high severity, **orange** is moderate, **yellow** is low;
- when it was raised, and any action already taken.

Read every red alert before you continue.

### Allergies

A table of every recorded allergy, with the **Substance**, its **Criticality**, the **Reaction**, the **Status** and when it was **Recorded**. You add new allergies here; see [Record an allergy](#record-an-allergy) below.

### Active medicines

The medicines the patient is currently prescribed, with the **Dosage**, when each was **Prescribed** and its **Status**.

### Medication history

Every medicine the patient has been prescribed, including finished ones, and whether and when each was **Dispensed**.

### Growth

Charts of weight, height and BMI over time, built from the [vital signs](./record-vital-signs.md) recorded at each visit. Use it to follow a child's growth. If nothing has been recorded, it says *No weight, height or BMI recorded yet.*

## Record an allergy

Record an allergy as soon as the patient tells you about it. Afiax checks every new prescription against the allergy list, so an allergy that isn't recorded can't protect the patient.

1. In the **Clinical summary** panel, click the **Allergies** tab.
2. In **Search in**, choose what the patient is allergic to:
   - **Medicines (KNHTS HPT):** a medicine or drug ingredient, such as penicillin. Choose this for drug allergies, so prescriptions can be checked against it.
   - **Allergy codes (KNHTS):** anything else, such as a food or latex.
3. Click **Allergic to** and type at least 2 letters of the substance, for example `amox`. Choose the right match from the list.
4. Choose the **Criticality**:
   - **High:** the reaction could be life-threatening, such as anaphylaxis.
   - **Low:** the reaction is unpleasant but not dangerous, such as a mild rash.
   - **Unable to assess:** you don't know.
5. In **Reaction**, describe what happens, for example `rash` or `anaphylaxis`.
6. Click **Add allergy**.

{/* SCREENSHOT: Allergies tab with the new-allergy form filled in */}

**What you should see:** the allergy appears in the table, and in the red **Allergies** badge at the top of the panel.

:::tip
If the list says *No KNHTS match*, try a shorter word or the generic name instead of a brand name. All coding in Afiax uses the Kenya National Health Terminology Service (KNHTS).
:::

## Next steps

- [Prescribe a medicine](./prescribe-a-medicine.md)
- [Record vital signs](./record-vital-signs.md)
