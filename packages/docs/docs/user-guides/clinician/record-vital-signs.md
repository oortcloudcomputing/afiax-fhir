---
sidebar_position: 2
---

# Record vital signs

Use this guide at triage, or any time you take a patient's observations during a visit. Afiax checks every reading and raises an alert on the patient's record if one is dangerously high or low.

**Who this is for:** nurses, triage staff and clinicians.

**How long it takes:** about a minute once you have the readings.

## Before you start

You need:

- A visit open for the patient, with status **arrived**, **triaged** or **in-progress**. See [Start a visit](./start-a-visit.md).
- Your readings. You don't need all of them; record what you've measured.

## Steps

1. Open the patient's visit.
2. In the **Clinical orders** panel, click the **Vital signs** tab.
3. Type each reading in its box. The unit is shown in the box's label:

   | Box | Unit | Example |
   |---|---|---|
   | Systolic blood pressure | mmHg | `120` |
   | Diastolic blood pressure | mmHg | `80` |
   | Body temperature | °C | `36.8` |
   | Heart rate | beats/min | `76` |
   | Respiratory rate | breaths/min | `16` |
   | Oxygen saturation (pulse oximetry) | % | `98` |
   | Body weight | kg | `64.5` |
   | Body height | cm | `168` |
   | Mid-upper arm circumference | cm | `24.5` |

   Leave a box empty if you didn't take that reading. You can type one decimal place.

4. Check the **BMI** line. When you enter both weight and height, Afiax works out the BMI. For adults it also shows the category, for example *Normal weight* or *Overweight*. For children it reminds you to use the growth chart instead.
5. Check every number once more against your notes.
6. Click **Save vital signs**.

{/* SCREENSHOT: Vital signs tab with readings and BMI */}

**What you should see:** a green message saying how many vital-sign records were saved, for example **6 vital-sign records saved**. The boxes empty, ready for the next set of readings.

## Abnormal readings

You don't need to do anything extra to flag an abnormal reading. If a reading is outside the safe (NEWS2) or critical limits, Afiax automatically raises a clinical alert on the patient's record. The alert appears in the **Clinical alerts** tab of the [clinical summary](./clinical-summary.md), where every clinician who opens the record will see it.

An alert never replaces your own judgement. If a patient is unwell, escalate straight away, following your facility's procedure.

## If something goes wrong

### A red message says a reading is not valid

Afiax rejects numbers that can't be real, such as a heart rate of 900. Usually it's a typing mistake or the wrong unit, for example height in metres instead of centimetres. Correct the reading and click **Save vital signs** again.

### The Vital signs tab is greyed out

The visit isn't active. See [Start a visit](./start-a-visit.md#if-something-goes-wrong).

### Save vital signs is greyed out

You haven't entered any readings yet.

## Good to know

- **Each reading is saved separately,** with the time and your name. You can record vital signs several times in one visit, for example before and after treatment.
- **Weight, height and BMI** feed the patient's growth chart.

## Next steps

- [Read a patient's clinical summary](./clinical-summary.md)
