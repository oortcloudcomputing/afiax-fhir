---
sidebar_position: 2
---

# Submit a claim to SHA and follow it up

Use this guide to send a claim to the Social Health Authority (SHA) for a covered patient's care, and to keep track of it until SHA pays or declines it.

**Who this is for:** billing and claims staff.

**How long it takes:** under a minute to submit. SHA can then take days to decide.

## Before you start

You need:

- **The patient's SHA cover checked and eligible** for the visit. See [Check a patient's SHA cover](../front-desk/check-sha-cover.md). Claims for patients who aren't eligible will be rejected.
- **The claim open on your screen.** At the moment you open claims by typing your Afiax address followed by `/Claim` into the browser's address bar and choosing the claim from the list.

## How a claim moves through SHA

| Status | It means |
|---|---|
| **prepared** | The claim is ready but hasn't been sent |
| **submitted** | Sent to SHA |
| **queued** | SHA has received it and it's waiting to be looked at |
| **in-review** | SHA is reviewing it |
| **adjudicated** | SHA has decided and approved it for payment |
| **rejected** | SHA declined it |
| **error** | It didn't reach SHA, or SHA couldn't read it |

## Submit a claim

1. Open the claim.
2. Find the section headed **Kenya SHA Claim**.
3. Check the grey badge next to the heading:
   - **PRODUCTION** means the claim goes to the live SHA system and will be paid.
   - **UAT** means it goes to SHA's test system. Use that only for training and testing.
4. Click **Submit Claim**.

{/* SCREENSHOT: Kenya SHA Claim section before submission */}

**What you should see:** a green message saying **Claim submitted**, and a blue **submitted** badge. Under **Submission** you'll see the **Status**, SHA's **Message**, and a **Bundle ID**, which is the reference for this submission.

## Check a claim's status

1. Open the claim.
2. In the **Kenya SHA Claim** section, click **Check Status**.

The badge changes to SHA's latest answer: green **adjudicated**, yellow **rejected**, or red **error**. Read the **Message** for details.

**Check Status** is greyed out until the claim has been submitted. The yellow note *Submit the claim to enable status checking* reminds you of this.

## Follow up all claims in the claim queue

The claim queue shows every SHA claim in one table, so you don't have to open claims one at a time. It's on the administration pages, so you need administrator access. If you don't have it, ask your supervisor.

1. In the left menu, under **Admin**, click **Project**, then click the **Country Pack** tab.
2. Scroll to **Kenya SHA Claim Queue** and click **Load Claims**.
3. Use **Filter by status** to see one group, for example **Rejected / declined** or **Queued / awaiting SHA**.
4. For each claim, the table shows the **Claim**, its **Submit status**, its **SHA state**, the date it was **Submitted**, and its **Bundle ID**.
5. To get SHA's latest answer for one claim, click **Refresh** on its row.

{/* SCREENSHOT: Kenya SHA Claim Queue table */}

:::tip
Work through **Rejected / declined** and **Error** claims every day. The longer a rejected claim waits, the longer the facility waits to be paid.
:::

## If something goes wrong

### The status is error

1. Open **Submission details** under the claim. Note the **HTTP Status** and **Correlation ID**.
2. Wait a few minutes and click **Submit Claim** again.
3. If it still fails, send the message, HTTP status and correlation ID to your facility administrator or Afiax support.

### The status is rejected

Read SHA's **Message**: it gives the reason, for example missing details or the patient not being eligible. Correct the problem with your supervisor before submitting again. Don't resubmit an unchanged claim: it will be rejected again.

## Good to know

- **Raw SHA response** at the bottom of the section shows exactly what SHA sent back. Support may ask you for it.
- Every submission and status check is recorded, so each claim's history can be traced.

## Next steps

- [Take a patient payment](./take-a-payment.md): for the part the patient pays themselves
