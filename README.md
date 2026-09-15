# jira-tui

A full-screen terminal app for JIRA Cloud. Browse your board, move tickets, assign,
comment and create — without leaving the terminal.

Status: **0.0.1-beta**. Reads are solid; move / assign / comment / create are covered
by tests but still being exercised against real projects.

## Requirements

- Node 22+ (only for the from-source install)
- A JIRA Cloud site and an API token

## Install

**Homebrew (macOS / Linux)**

```bash
brew install harsha509/tap/jira-tui
```

**From source**

```bash
git clone https://github.com/harsha509/jira-tui.git
cd jira-tui
npm install && npm run build
node bin/jira-tui.js
```

## Setup

Create an API token at <https://id.atlassian.com/manage-profile/security/api-tokens>,
then set four values:

| Value | Environment variable |
| --- | --- |
| API token | `JIRA_API_TOKEN` (**required**) |
| Site URL | `JIRA_SERVER` |
| Login email | `JIRA_LOGIN` |
| Project key | `JIRA_PROJECT` |

Add them to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export JIRA_API_TOKEN="<your token>"
export JIRA_SERVER="https://yourcompany.atlassian.net"
export JIRA_LOGIN="you@example.com"
export JIRA_PROJECT="ABC"
```

Open a new terminal afterwards so the variables are exported.

The token is a secret — never commit it, and prefer a keychain over a plain-text file:

```bash
# one-time: security add-generic-password -a you@example.com -s jira-api-token -w '<token>'
export JIRA_API_TOKEN="$(security find-generic-password -a you@example.com -s jira-api-token -w 2>/dev/null)"
```

Everything except the token can also come from an existing
[jira-cli](https://github.com/ankitpokhrel/jira-cli) config at
`~/.config/.jira/.config.yml` (`server:`, `login:`, `project.key:`, `board.id:`),
so if you already use `jira`, only the token is needed.

Optional:

| Variable | Meaning |
| --- | --- |
| `JIRA_TEAM` | Who "team tickets" means: comma-separated emails, or a JQL fragment such as `assignee in ("a@x.com","b@x.com")` |
| `JIRA_BOARD_ID` | Which board's columns to use; defaults to the project's own board |

**Check it:**

```bash
jira-tui doctor
```

It prints every setting and where it came from (with the token masked), then checks
the login, the project and the board.

## Getting started

```bash
jira-tui                  # opens on JIRA_PROJECT
jira-tui --project KEY    # opens on another project
```

Pick a scope on the start page — my tickets, team tickets or all open tickets — and
the main screen opens split in two: filters on the left, tickets on the right.

**Filters (left).** `↑↓` moves, `enter` applies. One filter at a time, marked `✓`: a
scope reloads the list, a status shows the tickets in that board column, and the
actions below create, search, switch project, show the board, help and quit.
Press `→` to move across to the tickets.

**Tickets (right).** `↑↓` selects; the strip underneath shows the selected ticket's
type, priority, status, assignee and age. `enter` opens its action menu, or press a
key directly:

| Key | Does |
| --- | --- |
| `v` | view the ticket (description, comments) |
| `m` | move status — pick from the transitions JIRA allows right now |
| `a` | assign — me / unassign / any assignable user |
| `c` | comment |
| `o` | open in the browser |
| `←` / `esc` | back to the filters |

`esc` always steps back one level. `ctrl+c` quits.

**Typing.** Start typing anywhere to reach the prompt at the bottom. A plain line is a
ticket number or key (`92`, `ABC-92`) to view, or text to search summaries. Type `/`
for the command palette; `tab` completes, `↑↓` recalls history. Commands act on the
selected ticket when no key is given, and ask for anything else left out:

| Command | Does |
| --- | --- |
| `/list mine\|team\|all` | reload the list for a scope |
| `/search <text>` | search summaries (partial words and ticket keys match) |
| `/jql <query>` | run raw JQL |
| `/view [key]` | view a ticket |
| `/move [key] [status]` | change status |
| `/assign [key] [me\|none\|email\|name]` | assign |
| `/comment [key] [text]` | comment |
| `/create [type] [summary]` | create a ticket |
| `/open [key]` | open in the browser |
| `/board` | the current list in the board's columns and order |
| `/project [KEY]` | switch project |
| `/team <emails or JQL>` | set who "team" means for this session |
| `/refresh` | reload the current list |
| `/help`, `/quit` | |

## Development

```bash
npm install
npm run typecheck
npm test
```

## License

MIT
