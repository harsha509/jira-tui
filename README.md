# jira-tui

A full-screen terminal shell for JIRA Cloud, built the way [AppClaw](https://github.com/appclawhq/AppClaw)'s Terminal Studio is: an Ink (React) app with an observable store, a screen router, a slash-command palette with tab completion, a scrolling transcript, and modal pickers.

```
┌ ◆ JIRA ───────────────────────────────────────────────────────────────┐
│ A2A · Sri Harsha · my open tickets                                    │
│ ┌ Transcript ──────────────┐ ┌ Issues ───────────────────────────────┐│
│ │ 12 issues — my open …    │ │ ❯ A2A-92  In Dev   Sri   Save button ││
│ │ A2A-92 → IN Review       │ │   A2A-90  In Dev   —     Recording …  ││
│ └──────────────────────────┘ │   A2A-89  ready …  Faize Chat Agent … ││
│ ┌ ❯ /move 92 "In Dev" ─────┐ │                                       ││
│ └──────────────────────────┘ └───────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
 Main   /help · esc tickets · ⇧tab panes · tab complete · ↑↓ history
```

Status: **0.0.1-beta**. Reads are solid; move / assign / comment / create are covered by tests but still being exercised against real projects.

## Install

**Homebrew (macOS / Linux)**

```bash
brew install harsha509/tap/jira-tui
```

**npm (any OS with Node 22+)**

```bash
npm install -g github:harsha509/jira-tui
```

**From source**

```bash
git clone https://github.com/harsha509/jira-tui.git
cd jira-tui
npm install && npm run build
node bin/jira-tui.js        # or: npm start (runs from source via tsx)
```

## Configuration

jira-tui stores nothing itself. It reads four values, in this order of precedence:

| Value | Environment variable | Fallback |
| --- | --- | --- |
| API token | `JIRA_API_TOKEN` (**required**) | none |
| Site URL | `JIRA_SERVER` | `server:` in `~/.config/.jira/.config.yml` |
| Login email | `JIRA_LOGIN` | `login:` in `~/.config/.jira/.config.yml` |
| Project key | `JIRA_PROJECT` | `project.key:` in `~/.config/.jira/.config.yml` |

The YAML fallback is the config file written by [jira-cli](https://github.com/ankitpokhrel/jira-cli), so if you already use `jira`, only the token is needed.

Optional:

| Variable | Meaning |
| --- | --- |
| `JIRA_TEAM` | Who "team open tickets" means: a JQL fragment such as `assignee in ("a@x.com","b@x.com")`, or plain comma-separated emails |
| `JIRA_BOARD_ID` | Which board's columns to use (also read from `board.id:` in the jira-cli config); defaults to the project's own board |

**Getting a token.** Create one at <https://id.atlassian.com/manage-profile/security/api-tokens>. It is a secret: never commit it, and prefer a keychain over a plain-text file.

**Example `~/.zshrc`** (macOS, token kept in the keychain):

```bash
# one-time: security add-generic-password -a you@example.com -s jira-api-token -w '<token>'
export JIRA_API_TOKEN="$(security find-generic-password -a you@example.com -s jira-api-token -w 2>/dev/null)"
export JIRA_SERVER="https://yourcompany.atlassian.net"
export JIRA_LOGIN="you@example.com"
export JIRA_PROJECT="ABC"
export JIRA_TEAM="you@example.com,teammate@example.com"   # optional
```

Open a new terminal after editing so the variables are exported (`export` matters: a plain `VAR=...` line is invisible to jira-tui).

**Check it:**

```bash
jira-tui doctor
```

prints every setting with where it came from (flag / environment / jira-cli file), masks the token, and then checks the login, the project and the board. If anything required is missing, `jira-tui` itself prints exactly what is missing and exits.

**Which tickets are loaded.** On start jira-tui finds the project's board (the one in `JIRA_BOARD_ID` / jira-cli's `board.id`, else the project's own board) and reads its columns. The ticket list then loads only statuses that are columns on that board, excluding Done-category ones, and `/board` shows the columns in the board's own order, empty columns included. A project without a board falls back to `status != Done`.

**Switching project.** `jira-tui --project KEY` opens on another project; inside the app `/project KEY` switches, and `/project` alone opens a picker of every project you can see (type to filter). The board and list reload for the new project.

**Team without `JIRA_TEAM`.** Choosing "team open tickets" asks for the emails once per session; `/team a@x.com,b@x.com` sets them too.

## Using it

The start page offers **Open my board**, **Open team board** and **Open all tickets**. The main screen is then split in two:

```
Filters (pick once)              Tickets (act here)
── Scope ──                      ❯ A2A-57   To Do   Jatin    UI Bug: no test profile…
  ○ My tickets                     A2A-63   To Do   Jatin    [UI] No indication that…
  ● All open            118        …
── Status ──                     ┌ A2A-57 · Bug · Medium · updated 8h ago ────────┐
❯ ● To Do              104       │ UI Bug :- Need to show if there is no test… │
  ○ In Dev              10       │ To Do · Jatin Rana                           │
  ○ In qa                2       │ enter actions · v view · m move · a assign … │
── Actions ──                    └──────────────────────────────────────────────┘
    Create ticket…
```

**Filters (left).** `↑↓` move the `❯` cursor, `enter` applies: a **scope** reloads the list from JIRA; a **status** (one row per board column, with live counts) narrows the loaded list instantly; the **actions** below create, search, open a ticket by number, switch project, show the board, help, quit. The cursor stays on the filters; press `→` (or `⇧tab`) to move it to the tickets.

**Tickets (right).** `↑↓` select; the strip underneath shows the selected ticket's type, priority, status, assignee and age. `enter` opens the ticket's action menu (view / move status / assign / comment / open in browser), or press a letter directly:

| Key | Does |
| --- | --- |
| `v` | view the ticket (description, comments); inside the view `m`, `a`, `c`, `o` act on it |
| `m` | move status — pick from the transitions JIRA allows right now |
| `a` | assign — pick me / unassign / any assignable user (type to filter) |
| `c` | comment — type it in a prompt |
| `o` | open in the browser |
| `←` / `esc` | back to the filters |

`→` from the filters jumps into the tickets. `esc` always steps back one level: it closes a picker or prompt, then the ticket view, then returns to the filters, then to the start page.

**Typing at the prompt.** Start typing from anywhere (or `/`) to reach the prompt at the bottom-left. A plain line is a ticket number or key (`92`, `ABC-92`) to view, or text to search summaries. Slash commands (type `/` for the palette, `tab` completes) act on the selected ticket when no key is given, and open a picker or prompt for anything else left out:

| Command | Does |
| --- | --- |
| `/list mine\|team\|all` | reload the list for a scope |
| `/jql <query>` | run raw JQL |
| `/search <text>` | search summaries |
| `/ticket [key]` | action menu |
| `/view [key]` | view a ticket |
| `/move [key] [status]` | change status; no status opens the transition picker |
| `/assign [key] [me\|none\|email\|name]` | assign; nobody given opens the user picker |
| `/comment [key] [text]` | comment; no text opens a prompt |
| `/create [type] [summary]` | create a ticket; missing type or summary is asked for |
| `/project [KEY]` | switch project; no key opens a picker |
| `/team <emails or JQL>` | set who "team" means for this session |
| `/open [key]` | open in the browser |
| `/board` | the current list in the board's columns and order |
| `/refresh` | reload the current list |
| `/scope` | back to the scope picker |
| `/help`, `/quit` | |

Other keys: `↑↓` at the prompt recalls history; `⇧tab` cycles filters → tickets → prompt; `p` on the start page switches project; `/log` shows everything that happened this session; `ctrl+c` quits.

## Development

```bash
npm install
npm run typecheck
npm test
```

The Homebrew formula lives in [harsha509/homebrew-tap](https://github.com/harsha509/homebrew-tap).

## License

MIT
