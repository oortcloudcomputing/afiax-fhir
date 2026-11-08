---
sidebar_position: 1
---

# Sign in and keep your account secure

Use this guide the first time you use Afiax, and whenever you need to reset your password or set up two-step verification. Everyone at the facility uses these steps, not just front desk staff.

**Who this is for:** all staff.

**How long it takes:** about 5 minutes the first time.

## Before you start

You need:

- **An invitation email from Afiax.** Your facility administrator sends it when they create your account. If you haven't received one, check your spam folder, then ask your administrator.
- **The right Afiax address for your job:**
  - Clinical and front-desk staff: `provider.afiax.africa`
  - Facility administrators: `app.afiax.africa`

  You use the same email and password for both.
- **A smartphone with an authenticator app,** such as Google Authenticator or Microsoft Authenticator. You need this only for two-step verification.

## Set your password the first time

1. Open the invitation email and click the link in it.
2. A page headed **Set password** opens. Type a password in **New password**, and type it again in **Confirm new password**.
3. Click **Set password**.

You can now sign in. Choose a password you don't use anywhere else, and never share it. Everything you do in Afiax is recorded against your account.

## Sign in

1. Open your facility's Afiax address in your browser.
2. Type your work email address in **Email** and click **Continue**.
3. Type your password in **Password**.
4. Tick **Remember me** only on a computer that nobody else uses.
5. Click **Sign In**.

{/* SCREENSHOT: Sign-in page with Email and Password */}

**What you should see:** the Afiax home screen, with the menu on the left and the **Search** box at the top.

Depending on how your account is set up, you might see one more screen first:

- **A list of facilities or profiles:** you have access to more than one. Click the one you're working in today.
- **Enter MFA code:** you've set up two-step verification. Open your authenticator app, type the 6-digit code it shows for Afiax, and continue.
- **Enroll in MFA:** your facility requires two-step verification and you haven't set it up yet. Follow [Set up two-step verification](#set-up-two-step-verification) below.

:::note
If you typed the wrong email, click the small **Change email** button next to it to start again.
:::

## Reset a forgotten password

1. On the sign-in page, enter your email and click **Continue**.
2. Under the password box, click **Reset Password**.
3. Type your email address in **Email** and click **Reset Password**.
4. You'll see the message *If the account exists on our system, a password reset email will be sent.* Check your inbox, including spam.
5. Click the link in the email, then set a new password as described in [Set your password the first time](#set-your-password-the-first-time).

## Change your password

Do this straight away if you think someone else knows your password.

1. In the left menu, under **Settings**, click **Security**.
2. Click **Change password**.
3. Type your current password in **Old password**, then your new one in **New password** and **Confirm new password**.
4. Click **Change password**.

**What you should see:** the message **Password changed successfully**.

## Set up two-step verification

Two-step verification (also called MFA) means that signing in needs both your password and a code from your phone. Someone who learns your password still can't get in. Set it up even if your facility doesn't require it.

1. In the left menu, under **Settings**, click **Security**.
2. Under **Multi Factor Auth**, click **Enroll**.
3. A page headed **Multi Factor Auth Setup** shows a QR code.
4. On your phone, open your authenticator app, add a new account, and scan the QR code.
5. The app now shows a 6-digit code for Afiax that changes every 30 seconds. Type the current code into **MFA code** on the Afiax page.
6. Click **Enroll**.

{/* SCREENSHOT: Multi Factor Auth Setup page with QR code */}

**What you should see:** the page says **MFA is enabled**. From now on, Afiax asks for a code from your phone each time you sign in.

:::caution
If you lose or replace your phone, tell your facility administrator straight away. You won't be able to sign in without the codes.
:::

## Sign out

Afiax signs you out automatically after **15 minutes** without activity, to protect patient information on shared computers. Your administrator may have set a different time. Any unsaved work on the screen is lost, so save as you go.

To sign out yourself, click your name or picture at the top right of the screen and choose **Sign out**. Always sign out before leaving a shared computer.

## Check where you're signed in

1. In the left menu, under **Settings**, click **Security**.
2. Under **Sessions**, you'll see every browser your account is signed in on, with its IP address and when it was last used.
3. If you see one you don't recognise, click **Revoke** next to it, then [change your password](#change-your-password) and tell your facility administrator.

## If something goes wrong

### "Invalid email or password"

Check that Caps Lock is off and that you're using your work email. If it still fails, [reset your password](#reset-a-forgotten-password).

### The invitation or reset link doesn't work

These links expire, and each one works only once. Ask your administrator to send a new invitation, or request a new reset email.

### The MFA code is rejected

The code changes every 30 seconds, so type the current one. If codes are always rejected, check that your phone's clock is set automatically: wrong phone time is the most common cause.

## Next steps

- [Register a new patient](./register-a-patient.md)
- [Find an existing patient](./find-a-patient.md)
