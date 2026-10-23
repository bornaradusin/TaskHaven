Skip to content
bornaradusin
TaskHaven
Repository navigation
Code
Issues
Pull requests
Actions
Projects
Wiki
Security and quality
Insights
Settings
Build
build.yml #6
All jobs
Run details
test
failed now in 58s
Search logs
0s
2s
1s
4s
0s
3s
2s
4s
22s
17s
Run npm run e2e
> taskhaven@2.0.0 e2e
> node tests/e2e.mjs
  ok  the first start asks for a server (https over the internet), or the demo
  ok  overview shows current tasks and the last viewed projects
  ok  quick add makes a task with a label, a person and a date
  ok  ticking a task off, and undoing it
  ok  a repeating task comes back with its next date
  ok  the task page: title, priority, due date, labels, comment
  ok  the description editor saves a checklist
  ok  reminders and repeats
  ok  relating two tasks shows on both
  ok  the kanban board: drag a card to Done
  FAIL the kanban board: a new column, renamed, with a limit
       locator.click: Timeout 6000ms exceeded.
  ok  the table: columns and sorting
  ok  the Gantt chart shows bars and dots
  ok  filters on a view
  ok  a new project, a sub-project, edited and archived
  ok  sharing: by username, with a team, and a link
  ok  labels, teams, search, notifications, settings, upcoming, favorites
  ok  a saved filter
  ok  changing the password
  ok  signing out and in again
  ok  deleting the account asks for the password, then the server emails a link
  ok  on a phone: the menu opens and closes, and the task page fits
21 passed, problems:
  the kanban board: a new column, renamed, with a limit: locator.click: Timeout 6000ms exceeded.
Error: Process completed with exit code 1.
0s
0s
Post job cleanup.
/usr/bin/git version
git version 2.55.0
Temporarily overriding HOME='/home/runner/work/_temp/02727607-d9c3-4cf6-8305-da5f684f164f' before making global git config changes
Adding repository directory to the temporary git global config as a safe directory
/usr/bin/git config --global --add safe.directory /home/runner/work/TaskHaven/TaskHaven
/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
http.https://github.com/.extraheader
/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
0s
