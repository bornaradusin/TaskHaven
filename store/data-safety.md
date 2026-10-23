# TaskHaven: Google Play's Data safety form

The answers that match what TaskHaven does (Policy → App content → Data safety). Check them
against the app before you submit: if TaskHaven changes, these change.

TaskHaven sends what people put in it to the Vikunja server *they* choose (theirs, or one run by
someone they know). You, the developer, never receive it. Play counts data sent off the phone as
"collected" even so, so the answers below declare it; it's not "shared" (that's giving it to a
third party, which an app doesn't do by talking to the server the user picked).

> Play's FAQ also exempts data a user sends "directly to their own external drive or cloud storage
> account" when the app's developer never accesses it, which is close to TaskHaven's case. The
> answers here don't lean on that: declaring the data is the safer reading, and it's accurate.

**Does your app collect or share any of the required user data types?** Yes.

**Is all of the user data collected by your app encrypted in transit?** **No.** Servers on the
internet must use https (the app refuses anything else), but a server on the home network may be
plain http, as many home servers are. Play's label will say data isn't encrypted in transit;
that's the honest answer while http at home is allowed.

**Which ways do you provide for users to request that their data is deleted?**
"You provide a way for users to request that their data is deleted": in the app (Settings →
Account → Delete account, which asks the user's server to delete the account), and at
https://bornaradusin.github.io/TaskHaven/delete-account.html

## Data types collected

Nothing is *shared*. Nothing is used for ads or analytics.

| Category | Data type | Collected | Shared | Optional? | Why |
| --- | --- | --- | --- | --- | --- |
| Personal info | Name | Yes | No | Optional (a display name) | App functionality, Account management |
| Personal info | Email address | Yes | No | Required (to make an account) | Account management |
| Personal info | User IDs | Yes | No | Required (the username) | App functionality, Account management |
| Photos and videos | Photos | Yes | No | Optional (only files you attach) | App functionality |
| Files and docs | Files and docs | Yes | No | Optional (only files you attach) | App functionality |
| Messages | Other in-app messages (comments) | Yes | No | Optional | App functionality |
| App activity | Other user-generated content (projects, tasks, labels) | Yes | No | Required | App functionality |

Not collected: location, contacts, financial info, health, calendar (reminders are set on the
phone only), app activity like page views or searches, web browsing, app info and performance
(no crash reporting or analytics), device or other IDs.

For each collected type: "Is this data processed ephemerally?" No. "Is it collected or can users
choose?" as in the "Optional?" column.
