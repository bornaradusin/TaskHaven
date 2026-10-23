<p align="center"><img src="art/icon.png" width="96" alt=""></p>

# TaskHaven

To-do lists and projects for Android, kept on your own [Vikunja](https://vikunja.io) server: one at
home (a NAS, a Raspberry Pi, a home server), or one on the internet at an https address. Each person
on the server sees only their own projects, and those shared with them. Share a project with your
partner, and just the two of you see it.

TaskHaven is an independent app that works with Vikunja servers. It isn't made by, or connected
with, the Vikunja project.

<p align="center"><img src="docs/phones.jpg" width="100%" alt="TaskHaven on a phone: the overview, a project, the Kanban board and a task"></p>
<p align="center"><img src="docs/desktop-kanban.png" width="94%" alt="The Kanban board"></p>

## What it does

- **Projects** with sub-projects, colours, an identifier (tasks are numbered `HOME-12`), favourites,
  archiving and duplicating.
- **Four views of a project:** a list (drag to reorder), a table (pick the columns, sort by any), a
  **Kanban** board (drag cards between columns; a "done" column ticks them off; column limits) and a
  **Gantt** chart (drag bars to move them, or their end to make them longer).
- **Tasks** with assignees, labels, priority (up to *DO NOW*), due, start and end dates, reminders,
  repeating (every day, every 2 weeks, monthly, "3 days from when it's done" …), progress, colour,
  a description with formatting and checklists, attachments, related tasks (subtasks, blocking,
  duplicates …) and comments.
- **Quick add:** type `Take out the bins every tuesday at 7pm *chores @sam !3` and the date, repeat,
  label, person and priority are taken out of the title.
- **Sharing:** with someone on the server by their exact username, with a **team** (everyone in it,
  now or later), or by a link that opens the project in the server's web pages. Each gets a right:
  *can see*, *can edit* or *admin*. Nobody can browse the server's users, and nobody sees anyone
  else's email. The server tells people when they're assigned a task, or someone comments on it.
- **Overview** (greeting, current tasks, last viewed projects), **Upcoming** (by day, overdue first),
  **search** (words, or a task's number), **saved filters** (`done = false && dueDate < now+7d`),
  **labels**, light and **dark** theme.
- **Reminders and due dates** come as phone notifications, even when the app is closed.
- **Without the server** (away from home, say) the app shows what it fetched last; changes need the
  server. It checks the server every 45 seconds while open, and whenever you come back to it.
- A **demo** (a made-up family, on the phone only), from "Try the demo" on the first screen.

Everything is on the server, so it's also there in Vikunja's own web pages, and in its other apps.

## How it works

The app talks to the server's API (`/api/v1`, Vikunja 0.24 and later; checked against 2.7.1).

- **Signing in** is by username (or email) and password, with a two-step code if the account has
  one. The app then gets its own session from the server (Vikunja's OAuth code flow, client
  `taskhaven`), which renews itself; on an older server without it, it uses the login's long token.
  The session is kept on the phone, never the password.
- **Who sees what** is the server's work: TaskHaven shows what the server gives it.
- On the phone, requests go through Android rather than the web view (`src/data/http.ts`), so a
  server at home can be plain `http://` and needs no CORS set up for the app. The app itself only
  allows `http://` for addresses on the home network (`192.168.…`, `10.…`, `….local`, Tailscale's
  `100.64–127.…`); anything else must be `https://`.
- What was fetched is kept on the phone (for opening without the server), per account.

`src/data/memory.ts` behaves like a Vikunja server in memory, for the demo and the tests.

## Running a server

Follow [Vikunja's install guide](https://vikunja.io/docs/installing/). With Docker, its SQLite
example comes down to this `compose.yaml` (make the `files` and `db` folders first and
`chown 1000` them; SQLite is fine for a family, the guide has MySQL and PostgreSQL for more):

```yaml
services:
  vikunja:
    image: vikunja/vikunja
    environment:
      VIKUNJA_SERVICE_SECRET: <a long random secret>
      VIKUNJA_SERVICE_PUBLICURL: http://192.168.1.20:3456/
      VIKUNJA_DATABASE_PATH: /db/vikunja.db
    ports:
      - 3456:3456
    volumes:
      - ./files:/app/vikunja/files
      - ./db:/db
    restart: unless-stopped
```

Then in TaskHaven: **I have a server**, type `192.168.1.20:3456`, and make the accounts (or have
everyone make their own). Worth knowing:

- **Away from home** the phone needs to reach the server: a VPN such as Tailscale (use the
  server's Tailscale address), or a domain with https in front of it (a reverse proxy like Caddy,
  or a tunnel). `VIKUNJA_SERVICE_PUBLICURL` should be the address people use; share links use it.
- **New accounts**: once everyone has one, turn registration off
  (`VIKUNJA_SERVICE_ENABLEREGISTRATION: "false"`); the app then only offers signing in.
- **Email** (`VIKUNJA_MAILER_*`): without it, "forgot your password" and deleting an account
  (which the server confirms by email) can't work, and whoever runs the server does them instead.
- Back up the `db` and `files` folders.

## Getting the app

GitHub builds it on every push: open **Actions**, the latest *Build* run, and download
**TaskHaven-apk** under *Artifacts*. With the signing key set it holds `TaskHaven-<version>.apk`
(to install directly) and `TaskHaven-<version>.aab` (for Google Play); without it, a debug APK to
try. Publishing a release attaches them to it too.

For the signing key, add these in the repository's **Settings → Secrets and variables → Actions**:

| Secret | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` | Your signing key, from `sh tools/make-keystore.sh`: the text in the `.base64.txt` file, and its password. Google Play needs a signed App Bundle, and every update must be signed with the same key: **keep the `.jks` file and its password backed up.** |

To build it on your own Linux machine instead: `sh tools/build-apk.sh --setup` once (fetches the
Android SDK), then `sh tools/build-apk.sh`.

## Publishing on Google Play

[`store/`](store/) has what the listing needs: the texts (`listing.md`), the answers for the Data
safety form (`data-safety.md`), the 512 px icon, the feature graphic and eight phone screenshots.

- **Settings → Pages**: *Deploy from a branch*, `main`, `/docs` publishes the privacy policy, terms
  and account-deletion page at `https://<you>.github.io/TaskHaven/`. If the address isn't
  `bornaradusin.github.io/TaskHaven`, change `SITE` in [`src/links.ts`](src/links.ts) and the links
  in [`store/listing.md`](store/listing.md).
- **Before publishing**, fill in your name and contact email where `docs/privacy.html`,
  `docs/terms.html` and `docs/delete-account.html` say *[Your name]* and *[your contact email]*
  (the build warns while they're there).
- **Play's reviewers** need to get in: the app's demo works without a server (say so in *App
  access*), or give them an account on a server they can reach.
- The app targets Android 16 (API 36), which Play requires of new apps from 31 August 2026.
- Account deletion is in the app (Settings → Account) and on the web (`docs/delete-account.html`),
  as Play requires.
- A personal developer account made after 13 November 2023 needs a closed test first: at least 12
  testers opted in for 14 days in a row, before the app can go to production.
- Version numbers come from `package.json` (`1.2.3` becomes version code `10203`): raise it for
  every upload.

## Limits

- How many people, projects and files: as many as the server takes. Vikunja's own default file size
  limit is 20 MB.
- What others do (assigning you, commenting) shows in the bell once the app has checked the server;
  it isn't pushed to a closed app.
- Signing in is with a username or email and password (with two-step codes). Signing in through
  another service (OpenID, LDAP-only setups) isn't in the app yet.
- Leaving a project shared with you: only its admins can take people off it (the server's rule).

## Working on it

Vue 3, TypeScript and Vite; Capacitor for Android.

```sh
npm ci
npm run dev                      # in a browser (the demo, or a server that lets http://localhost in)
npm test                         # the logic, and the demo server's sharing rules
npm run build && npm run e2e     # the whole app in a browser, on the demo (Playwright)

# against a real Vikunja server that takes new accounts (each run makes its own):
VIKUNJA_URL=http://127.0.0.1:3456 npm run test:server
VIKUNJA_URL=http://127.0.0.1:3456 npm run e2e:server
npm run android                  # build and copy into android/, then open android/ in Android Studio
```

The CI downloads Vikunja's release binary and runs both server checks on every push.

- `src/data/`: the Vikunja backend, the in-memory server, the demo, and requests on Android.
- `src/logic/`: dates, quick add, repeating, filters. `src/views/` and `src/ui/`: the screens.
- `tools/`: icons, store graphics, phone renders, signing key, building on Linux.

## Licence

GPL-3.0-or-later: see [LICENSE](LICENSE). Vikunja is a separate project (AGPL-3.0); TaskHaven uses
only its public API and contains none of its code.
