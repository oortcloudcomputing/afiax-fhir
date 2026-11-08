---
sidebar_position: 4
---

# Disease reporting to KHIS (IDSR)

Afiax sends your facility's disease surveillance reports to KHIS (the Kenya Health Information System) automatically. This guide explains what is sent, when, and how to check that reporting is set up.

**Who this is for:** facility administrators and health records and information officers (HRIOs).

**How long it takes:** a few minutes to check.

## What Afiax sends, and when

| Report | When it's sent | Where it goes |
|---|---|---|
| **IDSR immediate notification** | As soon as an immediately notifiable disease is diagnosed | KHIS, plus an email to the county |
| **MOH 505 weekly report** | Every Monday at 06:00 EAT | KHIS, for each facility with an MFL code |

If a send fails, Afiax tries again every hour. You don't need to do anything for the reports to be sent.

:::caution
Automatic reporting doesn't replace a phone call. For an immediately notifiable disease, also call your County Disease Surveillance Coordinator, following the national IDSR guidelines. For diseases that may need reporting to WHO, see [Report a notifiable disease (IHR)](../clinician/ihr-notification.md).
:::

## Check that reporting is set up

1. In the left menu, under **Admin**, click **Project**.
2. Click the **Country Pack** tab.
3. Find **KHIS IDSR Reporting**. It lists:
   - **KHIS Credentials:** whether Afiax can sign in to KHIS.
   - **MOH 505 Dataset UID:** the KHIS dataset the weekly report goes to.
   - **IDSR Event Program:** the KHIS programme for immediate notifications.
   - **County Notification Email:** where immediate notifications are emailed.

{/* SCREENSHOT: KHIS IDSR Reporting section */}

If everything is filled in, reporting is set up.

If you see a yellow note saying *KHIS reporting is not fully configured*, reports aren't being sent yet:

1. Ask your KHIS administrator (usually the Sub-County HRIO) for the **MOH 505 dataset UID**, the **IDSR event program** UID and the **data element** UIDs.
2. Click the **Settings** link in the yellow note, and enter them there.
3. If **KHIS Credentials** is missing, contact Afiax support.

## Make sure every facility is included

The weekly MOH 505 report is only sent for facilities that have an MFL code in Afiax. Check every facility's code. See [Set up your facility](./set-up-facility.md#re-check-a-facilitys-registration).

## Good to know

- Reports are built from the ICD-11 diagnoses recorded in Afiax, so accurate diagnosis coding gives accurate reports.
- Check in KHIS each week that your MOH 505 report has arrived, as you do now.
