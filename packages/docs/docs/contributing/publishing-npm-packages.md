---
sidebar_position: 101
---

# Publishing NPM Packages

This is the process we use to publish new versions of JavaScript NPM packages.

Publishing NPM dependencies requires being a member of the [Afiax dev team](https://github.com/orgs/medplum/teams/dev).

:::note

Note that publishing to NPM is separate from deploying to production. For details on deploying to production, see:

- Afiax deploys through GitOps (ArgoCD in the platform-engineering repo); a merge does not reach production until the release is promoted

:::

## Steps

The Afiax publish process is automated using Github Actions.

### 1. Prepare the release

- Go to [GitHub Actions](https://github.com/oortcloudcomputing/afiax-fhir/actions)
- In the left side bar, click [Prepare release](https://github.com/oortcloudcomputing/afiax-fhir/actions/workflows/prepare-release.yml)
- Click the "Run workflow" button
- Use the default branch `main`
- Click "Run workflow"

This will initiate the action, which will create the release PR and a draft "Release".

Wait for the normal PR process, and merge the PR when ready.

### 2. Publish the release

- Go to [GitHub Releases](https://github.com/oortcloudcomputing/afiax-fhir/releases)
- At the top, there should be a new release in "Draft" status
- Click the pencil icon for "Edit"
- Leave the tag alone
- Update the "Target"
  - Click on the "Target: main" button
  - Go to the "Recent Commits" tab
  - Select the Release commit
- Update the release notes as you see fit
  - Give shout-outs to new contributors
  - When necessary, add notes about new features
  - At your discretion, remove trivial commits
- Click "Publish release"

That will create a new Github "Release", which starts a "Publish" action.

The publish action publishes all libraries to npm, and also builds the `medplum-agent-installer.exe` binary.
