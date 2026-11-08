---
sidebar_position: 1
---

# Take a patient payment

Use this guide when a patient pays for their care: in cash, by card, or by M-Pesa. Afiax records the payment against the patient's claim and sends it to the facility's finance system (ERPNext), so the books always match.

**Who this is for:** cashiers and billing staff.

**How long it takes:** about a minute per payment.

## Before you start

You need:

- **The patient's claim open on your screen.** Payments are recorded on the claim for the visit. At the moment you open claims by typing your Afiax address followed by `/Claim` into the browser's address bar and choosing the claim from the list. Your supervisor can also open it for you from the [SHA claim queue](./submit-sha-claim.md#follow-up-all-claims-in-the-claim-queue).
- **The amount to pay.** Check the **Patient due** figure on the claim first; see [Read the billing summary](#read-the-billing-summary).
- **For card and M-Pesa receipt payments:** the receipt or authorisation number.
- **For M-Pesa STK push:** the patient's phone, with them standing at the counter.

## Read the billing summary

Find the section headed **Kenya Billing**. Under **Billing summary** you'll see:

| Line | What it shows |
|---|---|
| **ERPNext invoice** | The invoice number in the finance system |
| **Invoice total** | The full bill |
| **Confirmed** | What has been paid and confirmed so far |
| **Patient due** | What the patient still has to pay |
| **Last synced** | When the figures were last updated from the finance system |

Underneath, **Payment entries** lists every payment so far: who paid (**Payer**), how (**Mode**), the **Amount**, the **Date** and its **Status**.

If the section says there's no ERPNext billing snapshot yet, click **Sync to ERPNext** first. This creates the invoice in the finance system.

{/* SCREENSHOT: Kenya Billing section with the billing summary */}

## Take a payment

1. In the **Kenya Billing** section, click **Post Patient Payment**. A window opens.
2. Choose the **Payment method** and follow the matching steps below.

{/* SCREENSHOT: Post Patient Payment window */}

### Cash

1. **Payment method:** choose **Cash**.
2. **Amount:** type the amount received, for example `1500`.
3. **Currency:** leave it as **KES** unless told otherwise.
4. **Transaction reference:** type your cash receipt number.
5. **Notes (optional):** anything your supervisor should know.
6. Count the cash again, then click **Confirm Payment**.

### Card

1. **Payment method:** choose **Card**.
2. Run the card on the card machine first. Only continue once it shows the payment as approved.
3. **Amount:** type the amount charged.
4. **Transaction reference:** type the authorisation code from the card machine slip.
5. Click **Confirm Payment**.

### M-Pesa: paybill receipt

Use this when the patient has already paid to your facility's paybill or till number.

1. **Payment method:** choose **M-Pesa (manual / paybill receipt)**.
2. Ask to see the patient's M-Pesa confirmation message. Check the amount, the date, and that it was paid to your facility.
3. **Amount:** type the amount paid.
4. **Transaction reference:** type the M-Pesa code from the message, for example `SKL4ABC123`.
5. Click **Confirm Payment**.

### M-Pesa: STK push

Use this to send a payment request straight to the patient's phone. They just enter their M-Pesa PIN.

1. **Payment method:** choose **M-Pesa STK push (automated prompt)**.
2. **Amount:** type the amount to pay.
3. **Phone number:** type the M-Pesa number, for example `0712345678` or `254712345678`.
4. Click **Send STK Push**.
5. Ask the patient to check their phone and enter their M-Pesa PIN.
6. A yellow box shows that the payment is awaiting confirmation. It updates by itself when M-Pesa confirms. You can also click **Check now**.

Don't let the patient leave until the payment shows as confirmed.

### Afiax Pay: payment link

Use this to send the patient a link to pay later, if your facility uses Afiax Pay.

1. **Payment method:** choose **Afiax Pay (payment link)**.
2. Type the **Amount** and the patient's **Phone number**.
3. Click **Send Payment Link**.

The payment shows as awaiting confirmation until the patient pays.

## What you should see

A green message confirming the payment, and the payment in the **Payment entries** list. **Confirmed** goes up and **Patient due** goes down by the amount paid. When **Patient due** reaches zero, the bill is fully paid.

## Send payments to the finance system

Afiax normally sends payments to ERPNext straight away. If **Last synced** looks old, or your supervisor asks you to, click **Sync to ERPNext**. A message tells you when the sync is complete.

## If something goes wrong

### "Amount must be a positive number"

Type the amount as a number only, without "KES" or commas, for example `1500`.

### The STK push never arrives on the patient's phone

Check the phone number, and that the phone is on and has network. Then click **Post Patient Payment** and send it again. If it still doesn't arrive, take the payment by paybill instead.

### The patient entered their PIN but it still says awaiting confirmation

Click **Check now**. If it still isn't confirmed after a few minutes, ask to see the patient's M-Pesa confirmation message, and tell your supervisor. **Don't** record the same payment again as a paybill receipt, or it will be counted twice.

### I recorded a payment by mistake

Tell your supervisor straight away. There's no undo on this screen.

## Good to know

- Every payment is recorded with your name, the time, the method and the reference, so the cash-up can be checked.
- At the end of your shift, check that your cash and card slips match the payments in Afiax, following your facility's cash-up procedure.

## Next steps

- [Submit a claim to SHA](./submit-sha-claim.md)
