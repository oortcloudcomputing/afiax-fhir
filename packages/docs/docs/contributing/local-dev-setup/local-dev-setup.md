---
sidebar_position: 10
---

# Local development setup

Ready to get started developing Afiax on your local machine? Great! First, you'll need to set up your own copy of the
[Afiax repository](https://github.com/oortcloudcomputing/afiax-fhir) to work on, by [forking the repository](https://docs.github.com/en/get-started/quickstart/fork-a-repo)
into your own GitHub account. **Note:** If you don't want to make changes and submit them back to the Afiax project,
you can skip this step and proceed directly to the next step.

After you've created your own fork of the Afiax repository, copy it to your local machine to work on by cloning it.

## Clone the repo

If you created a fork to submit Pull Requests from, you'll need to ensure you clone your fork, rather than the official
Afiax repository. Otherwise, use `git@github.com:oortcloudcomputing/afiax-fhir.git` below to copy the official repository, which
you can use to build and run the app locally.

```bash
git clone git@github.com:{YOUR GITHUB USERNAME}/afiax-fhir.git afiax-fhir
cd afiax-fhir
git checkout kenya   # active development branch
```

If you get an error saying `Permission denied` using `ssh`, you can refer to the [Github docs on setting up SSH keys](https://help.github.com/articles/error-permission-denied-publickey/).
Alternatively, you can use the `https` method as a fallback.

```sh
git clone https://github.com/{YOUR GITHUB USERNAME}/afiax-fhir.git afiax-fhir
```

That will create a complete copy of the project source code on your local machine, including code for the Afiax Server, Afiax App, and associated libraries.

In the next step, we'll build the application and run the tests.

## (Optional) Set up [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) in your IDE

The Afiax CI system uses the tools [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) to enforce its code style and ensure consistent coding standards.

If you are planning on submitting a PR, we highly suggest setting up these tools in your IDE to receive feedback and fix errors while developing.

### On Visual Studio Code

The Afiax repo comes with configured recommended Visual Studio Code extensions.

When you first open with workspace, Visual Studio will automatically prompt you to install the recommended extensions.
![install recommended extensions](install-recommended-extensions.png)

Alternatively, you can search for the "Recommended Extensions" in the Visual Studio extension manager and install from there.

import videoUrl from './recommended-extensions.webm';

  <video width="100%"  playsInline autoPlay muted loop preload="auto" >
    <source src={videoUrl} type="video/webm"/>
  </video>
