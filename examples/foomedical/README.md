<h1 align="center">My Afiax</h1>

### What is My Afiax?

My Afiax is the Afiax patient portal, running at [myafiax.afiax.africa](https://myafiax.afiax.africa). Patients use it to see their health record and results, read their care plan and message their care team.

It is built on Afiax FHIR and started from the open-source Foo Medical sample app (Apache 2.0). The folder and package are still called `foomedical`.

### What it does today

- Patient sign-in, and sign-up when a project is configured (see Settings below)
- Health record: lab results, medicines, vaccines, vital signs and completed forms
- Messages with the care team
- Care plan tasks
- Booking a visit, where the facility has published a schedule
- Profile, usual clinician, cover and payments

Kenya features (Client Registry sign-up, ICD-11 and KNHTS records, record download, consent, correction requests, SHA cover, bills and M-Pesa) are planned in phases.

### Settings

My Afiax reads its settings from environment variables when it is built. Put them in a `.env.local` file in this folder for local work (the file is not committed).

| Variable             | What it is                                                                                             | Default                      |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `MEDPLUM_BASE_URL`   | The Afiax FHIR server                                                                                  | `https://fhir.afiax.africa/` |
| `MEDPLUM_PROJECT_ID` | The Afiax project that patients sign up to. Without it, the sign-up page says sign-up is not open yet. | none                         |
| `GOOGLE_CLIENT_ID`   | Afiax's Google sign-in client, if used                                                                 | none                         |
| `RECAPTCHA_SITE_KEY` | Afiax's reCAPTCHA site key, if used                                                                    | none                         |

Never point My Afiax at another provider's FHIR service: patient data must stay on Afiax servers in Kenya.

Example `.env.local` for a server on your own machine:

```bash
MEDPLUM_BASE_URL=http://localhost:8103/
MEDPLUM_PROJECT_ID=<your local Afiax project id>
```

### Running it

From this folder:

```bash
npm run dev
```

The app runs on `http://localhost:3000/`.

### Tests

```bash
npx jest
```
