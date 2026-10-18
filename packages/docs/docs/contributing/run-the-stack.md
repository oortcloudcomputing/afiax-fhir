---
sidebar_position: 20
toc_max_heading_level: 4
---

# Run the Stack

Follow these instructions to get the complete Afiax stack running directly on your host machine.

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/nf6OElRWOJ4" title="YouTube video player" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

## What you will end up with

The Afiax API server on [http://localhost:8103](http://localhost:8103) and the Afiax web app on [http://localhost:3000](http://localhost:3000), running on your own computer against a local PostgreSQL database and Redis cache. All data is local test data. Never load real patient data on a laptop.

## Hardware you need

| | Minimum | Recommended |
| --- | --- | --- |
| CPU | 4 cores | 8 cores or more |
| Memory (RAM) | 8 GB | 16 GB or more |
| Disk | SSD with 30 GB free | NVMe SSD with 60 GB free |
| Operating system | Ubuntu 22.04+, macOS 13+, or Windows 11 with WSL 2 | Ubuntu 24.04 LTS or macOS |

The checkout and build take about 5 GB, and Docker images take another 2–18 GB. **Avoid a spinning hard disk (HDD):** installing and building read and write tens of thousands of small files, which is very slow on an HDD.

For the shared dev, UAT and production servers, see *Environments and Server Requirements* in the [platform-engineering repo](https://github.com/oortcloudcomputing/afiax-platform-engineering/blob/main/docs/environments-and-sizing.md).

## Prerequisites

Install these first, then check each one with the command shown:

1. **[Git](https://git-scm.com/)**. Check with `git --version`.
2. **[Node.js](https://nodejs.org/)** version **22.18 or newer**, or **24.2 or newer**. Check with `node -v`. We recommend installing Node.js with [nvm](https://github.com/nvm-sh/nvm).
3. **[Docker](https://docs.docker.com/engine/install/)** with Docker Compose. Check with `docker -v` and `docker compose version`.
4. [Clone the Afiax repo](./local-dev-setup#clone-the-repo)

## Install

Our monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces), so installing dependencies for all projects is done using normal `npm install`:

```sh
cd afiax-fhir
npm ci
```

This downloads every dependency. It takes 5–15 minutes the first time.

## Build

Use Turborepo to build all packages.

From the repository root (`afiax-fhir`) run:

```sh
npm run build:fast
```

## Background services

The Afiax Stack requires the following services to be running in your environment:

- [PostgreSQL](https://www.postgresql.org/) for the primary database
- [Redis](https://redis.com/) for caching and job queueing

When running these services on your local machine you can either use Docker (recommended) or install them directly onto your machine.

### Using Docker (Recommended)

Use the supplied `docker-compose.yml` file to run PostgreSQL and Redis background services. These services will be deployed with all the configuration and database migrations Afiax needs.

From the repository root (`afiax-fhir`) run:

```sh
docker-compose up
```

If this doesn't work for you, try

```sh
docker compose up
```

This will:

1. Start the PostgreSQL server in a container
2. Set up the appropriate configurations (see [postgres.conf](https://github.com/oortcloudcomputing/afiax-fhir/blob/main/postgres/postgres.conf))
3. Create two databases for testing: `medplum` and `medplum_test` (see [init_test.sql](https://github.com/oortcloudcomputing/afiax-fhir/blob/main/postgres/init_test.sql))

When `docker-compose` completes, you should see something like this in your terminal:

```bash
postgres-1  | PostgreSQL init process complete; ready for start up.
postgres-1  |
postgres-1  | 2024-12-13 17:27:57.492 GMT [1] LOG:  starting PostgreSQL 16.5 (Debian 16.5-1.pgdg120+1) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 12.2.0-14) 12.2.0, 64-bit
postgres-1  | 2024-12-13 17:27:57.492 GMT [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432
postgres-1  | 2024-12-13 17:27:57.492 GMT [1] LOG:  listening on IPv6 address "::", port 5432
postgres-1  | 2024-12-13 17:27:57.493 GMT [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"
postgres-1  | 2024-12-13 17:27:57.495 GMT [67] LOG:  database system was shut down at 2024-12-13 17:27:57 GMT
postgres-1  | 2024-12-13 17:27:57.508 GMT [1] LOG:  database system is ready to accept connections
```

**(Optional)** If you'd like to run a `psql` to shell to inspect the database, you can run

```sh
docker exec -it afiax-fhir-postgres-1 psql -U medplum
```

The container name starts with the name of the folder you cloned into. Run `docker ps` to see the exact name.

### Deploying manually

If you'd prefer to install the dependencies directly, you can find installation instructions for the required services below:

1. [Install PostgreSQL](https://www.postgresql.org/download/) (version 13+ required)
2. [Install Redis](https://redis.io/download) (version 6+ required)

After that, you will have to update the file `packages/server/medplum.config.json`

```js
  "database": {
    "host": "",     // YOUR POSTGRESQL HOST
    "port": "",     // YOUR POSTGRESQL PORT
    "dbname": "",   // YOUR POSTGRESQL DB Name
    "username": "", // YOUR POSTGRESQL USERNAME
    "password": ""  // YOUR POSTGRESQL PASSWORD
  },
    "redis": {
    "host": "",     // YOUR REDIS HOST
    "port": "",     // YOUR REDIS PORT
    "password": "", // YOUR REDIS PASSWORD
  }
```

## Run tests (optional)

Use Turborepo to run all tests across all packages.

From the repository root (`afiax-fhir`) run:

```sh
npm t
```

## Run

### Start the servers

After you have PostgreSQL and Redis up and running, you can run the Afiax API server.

From the repository root (`afiax-fhir`) run:

```sh
cd packages/server
npm run dev
```

This will seed the database with an example project and user.
The email and password for the example user are:

|              |                   |
| ------------ | ----------------- |
| **Email**    | admin@example.com |
| **Password** | medplum_admin     |

To make sure the server is working, you can access the health check at [http://localhost:8103/healthcheck](http://localhost:8103/healthcheck)

If everything is working, you should see the following in your browser:

```json
{ "ok": true, "version": "<MEDPLUM_VERSION>", "postgres": true, "redis": true }
```

:::warning Troubleshooting

If you get an error such as `error: role "medplum" does not exist` or `password authentication failed for user "medplum"` this usually means you have another instance of Postgres running. Closing the other instance should resolve this issue.

:::

### Run the Afiax Web App

Lastly, you can start the Afiax Wep App.

From the repository root (`afiax-fhir`) run:

```sh
cd packages/app
npm run dev
```

You can access the app at [http://localhost:3000/](http://localhost:3000/)

The default username is admin@example.com, default password medplum_admin.
