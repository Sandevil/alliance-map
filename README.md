# AllianceMap

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.24.

## Development server

To start a local development server, run:

```bash
ng serve
```

### Run `ng serve` against a real Supabase project

This project reads runtime variables from `public/env.js` (generated automatically before `npm start`).

1. Create your local env file from the template:

```bash
copy .env.local.example .env.local
```

2. Edit `.env.local` with your real Supabase values:

- `APP_DATA_MODE=cloud`
- `SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `SUPABASE_ANON_KEY=<anon-key>`
- Optional: `ALLIANCE_ADMIN_PASSWORD=<admin-password>`

3. Start dev server:

```bash
npm start
```

`prestart` runs `prepare:env` and regenerates `public/env.js` from `.env.local` (or OS env vars).

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
