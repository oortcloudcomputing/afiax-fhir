---
sidebar_position: 2
---

# Afiax Pay and Patient Payments

This page shows how to collect what a patient owes for a visit (cash, card, M-Pesa or an Afiax Pay wallet) and record it against the visit's claim. It is for developers building checkout screens or integrating a payment desk with Afiax Clinical Suite.

**Afiax Pay** is the payments and wallet module of Afiax Clinical Suite. It runs M-Pesa collection, patient wallets, co-payments and refunds. Afiax FHIR records *what* is owed and *what was paid* against the clinical record, while Afiax Pay moves the money. The two never edit each other's data. See [Afiax Pay boundary](/docs/architecture/afiax-pay-boundary).

## Before you start

- Your project uses the Kenya country pack, and payments are switched on. Oortcloud configures the M-Pesa and Afiax Pay connections during [onboarding](/docs/afiax-cloud/plans-and-onboarding).
- The visit has a `Claim` resource. The patient's share (`patientDue`) is what remains after SHA and any insurer.
- Your client is allowed to call `$post-patient-payment` on `Claim` (see [Environments and partner access](/docs/afiax-cloud/environments-and-access)).

## Payment methods

| `method` | What happens | Completes |
| --- | --- | --- |
| `cash` | The cashier records cash received | Immediately |
| `card` | The cashier records a card payment taken on the facility's terminal (pass `transactionRef`) | Immediately |
| `mpesa-manual` | The patient paid by M-Pesa themselves; the cashier records the M-Pesa code (`transactionRef`) | Immediately |
| `mpesa-stk` | Afiax sends an M-Pesa payment prompt (STK push) to the patient's phone (`phone`) | When the patient approves on their phone |
| `afiax-pay` | Afiax creates an Afiax Pay payment request and returns a `paymentUrl` for the patient | When the patient pays |

## Step by step

1. **Post the payment.** Call the operation on the visit's claim:

   ```bash
   curl -s -X POST "https://fhir.uat.afiax.africa/fhir/R4/Claim/$CLAIM_ID/\$post-patient-payment" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/fhir+json" \
     -d '{
       "resourceType": "Parameters",
       "parameter": [
         { "name": "method", "valueCode": "mpesa-stk" },
         { "name": "amount", "valueDecimal": 500 },
         { "name": "currency", "valueCode": "KES" },
         { "name": "phone", "valueString": "254712345678" }
       ]
     }'
   ```

2. **Read the result.** The response is a `Parameters` resource. Its main values are:
   - `status`
   - `correlationId`, which ties together everything recorded for this payment
   - `patientDue`, the amount still owed
   - `message`, a human-readable summary.

   For `mpesa-stk` it also returns `checkoutRequestId` and `customerMessage`, which you show to the cashier. For `afiax-pay` it returns `paymentRequestId` and `paymentUrl`, which you give to the patient.
3. **Wait for completion (STK and Afiax Pay only).** M-Pesa and Afiax Pay notify Afiax when the patient pays. Afiax verifies the notification, records the payment, and updates the follow-up `Task` returned as `task`. Watch that Task, or subscribe to it with a [Subscription](/docs/subscriptions), rather than polling the payment provider yourself.
4. **Finance posting.** Each recorded payment is also posted to Afiax Billing as a payment entry (`erpNextPaymentEntry` in the response). If that posting fails, the clinical record stays correct, and the posting can be retried with `$push-to-erpnext`.

## Insurer payments

When a private insurer pays a claim, record it with `Claim/$record-insurance-payment`. SHA remittances are reconciled through the SHA claim workflow; see [Kenya billing and settlement](/docs/country-packs/kenya-billing-and-settlement).

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `Must call this operation on a Claim instance...` | Call it on `Claim/<id>/$post-patient-payment`, or pass a `claim` reference |
| STK prompt never arrives | The phone number must be in `2547XXXXXXXX` format, and the patient's phone must be on and registered for M-Pesa |
| Payment shows as pending for a long time | The patient may have cancelled or ignored the prompt. Check the Task status; post a new payment if needed |
| Payment recorded but not in Afiax Billing | The finance posting failed; retry it with `$push-to-erpnext` on the claim |
