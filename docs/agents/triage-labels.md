# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Assignment

In this repo, `ready-for-human` and `needs-info` both mean "waiting on Candice" (`candicesaintclaire`), and every issue carrying either is assigned to her. `.github/workflows/assign-waiting-on-candice.yml` does this automatically whenever either label is added, however it's added. A skill applying the label needs to do nothing more. If a `needs-info` issue is really waiting on someone else (a bug reporter, say), reassign it by hand; the Action only adds assignees, never removes them. If the Action ever looks not to have run, `gh issue edit <number> --add-assignee candicesaintclaire` is the manual equivalent.
