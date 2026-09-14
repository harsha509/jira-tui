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
| `JIRA_BOARD_ID` | Board id (also read from `board.id:` in the jira-cli config); informational for now |

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

Open a new terminal after editing so the variables are exported. If anything required is missing, `jira-tui` prints exactly what is missing and exits.

## Using it

The welcome screen picks a scope (my / team / all open tickets), then the main screen opens with the ticket list on the right.

**Acting on a ticket.** Press `⇧tab` (or `esc` on an empty prompt) to move into the ticket list, `↑↓` to select, then:

| Key | Does |
| --- | --- |
| `enter` | action menu: view / move status / assign / comment / open |
| `v` | view the ticket (description, comments); inside the view `m`, `a`, `c`, `o` act on it |
| `m` | move status — pick from the transitions JIRA allows right now |
| `a` | assign — pick me / unassign / any assignable user (type to filter) |
| `c` | comment — type it in a prompt |
| `o` | open in the browser |
| `esc` | back to the prompt |

`esc` always steps back one level: it closes a picker or prompt, then the ticket view, then clears a typed line, then moves to the ticket list, then returns to the scope picker.

**Typing at the prompt.** A plain line is a ticket number or key (`92`, `ABC-92`) to view, or text to search summaries. Slash commands (type `/` for the palette, `tab` completes) act on the selected ticket when no key is given, and open a picker or prompt for anything else left out:

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
| `/open [key]` | open in the browser |
| `/board` | the current list grouped by status in board column order |
| `/refresh` | reload the current list |
| `/scope` | back to the scope picker |
| `/help`, `/quit` | |

Other keys: `↑↓` at the prompt recalls history; `⇧tab` cycles prompt → tickets → transcript; `ctrl+c` quits.

## Development

```bash
npm install
npm run typecheck
npm test
```

The Homebrew formula lives in [harsha509/homebrew-tap](https://github.com/harsha509/homebrew-tap).

## License

MIT
