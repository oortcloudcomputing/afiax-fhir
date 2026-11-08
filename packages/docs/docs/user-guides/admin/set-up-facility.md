---
sidebar_position: 3
---

# Set up your facility and other organisations

Use this guide when your facility first starts using Afiax, and whenever you need to add another organisation, such as a satellite clinic or SHA as a payer. Afiax uses your facility's MFL (Master Facility List) code to fetch its official details from the Kenya facility registry.

**Who this is for:** facility administrators.

**How long it takes:** about 5 minutes.

## Before you start

You need:

- Administrator access to Afiax.
- Your facility's **MFL code**. It's on your facility's licence, or you can find it on the Kenya Master Health Facility List.
- The connection to DHA set up. Afiax support does this when your facility is onboarded. If a yellow note says *Complete the Kenya HIE credentials first*, contact Afiax support.

## Set up your main facility (first time only)

1. In the left menu, under **Admin**, click **Project**.
2. Click the **Country Pack** tab.
3. Scroll to **Kenya Setup Wizard**.
4. Type your MFL code in **Kenya Facility Code / MFL Code**, for example `24749`.
5. Click **Lookup Facility**.
6. Check the details DHA returns: **Facility Name**, **Registration Number**, **Facility Level**, **County** and **Operational Status**. If they don't match your facility, check the code.
7. In **Apply Registry Data To**, leave it as **Create new organization** the first time. If your facility already exists in Afiax, choose it to update it instead.
8. Click **Create Primary Facility**, or **Apply To Organization** if you're updating one.

{/* SCREENSHOT: Kenya Setup Wizard with a facility found */}

If DHA doesn't find the code, a yellow note says so. You can still create the facility by hand, as described next.

## Add another organisation

Use this for other facilities in your group, and to add **SHA** as a payer, which front desk staff need for [cover checks](../front-desk/check-sha-cover.md).

1. In the left menu, under **Favorites**, click **Organization**.
2. Click **New...**. The **New Organization** screen opens, on the **Facility Search** step.
3. **For a health facility:** type its **MFL Code** and click **Search AfyaLink HIE**. Check the details under **HIE Registry Data**.

   **For SHA, or any organisation without an MFL code:** click **Skip HIE search**.
4. On **Confirm & Create**, check or type the **Organization Name**. For SHA, type `Social Health Authority (SHA)`, so staff can find it by typing either name.
5. Click **Create Organization**.

**What you should see:** a green message saying **Organization created**, followed by its name.

{/* SCREENSHOT: New Organization, Confirm & Create step */}

## Re-check a facility's registration

1. Open the organisation (**Favorites → Organization**, then click its name).
2. Find the section headed **Kenya Facility Verification**.
3. Check the **MFL Code**. If you change it, click **Save Code** first. You'll see **Facility code saved**.
4. Click **Lookup** to see the registry's details, or **Verify** to run a verification and record the result. You'll see **Verification complete**.

## If something goes wrong

### Lookup Facility is greyed out

The DHA connection isn't set up yet. Contact Afiax support.

### DHA doesn't find the MFL code

Check the code against your facility licence. New facilities can take time to appear in the registry. You can create the organisation by hand in the meantime, using **Skip HIE search**.

## Next steps

- [Invite a staff member](./invite-users.md)
- [Disease reporting to KHIS](./idsr-reporting.md)
