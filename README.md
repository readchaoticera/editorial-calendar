# Chaotic Era: Editorial Calendar

A public, interactive editorial calendar and idea bank for the Chaotic Era newsletter. It uses the same branding as the [Substack Politics Leaderboard](https://readchaoticera.github.io/SubstackPoliticsLeaderboard/).

It's a static site (no build step): `index.html`, `styles.css`, `app.js`, and the data in `data/ideas.json`.

## Going live (GitHub Pages)

1. Repo **Settings → Pages**.
2. Under **Source**, pick **Deploy from a branch**. Choose the branch that holds these files and the `/ (root)` folder. Save.
3. The site shows up at `https://readchaoticera.github.io/editorial-calendar/` after a minute or so.

The repo has to be public for Pages on a free plan.

## Adding ideas from the page

Anyone can view the calendar. Only you can change it. Click **⚙ Editor** and paste in:

- **Anthropic API key** (optional). With it, Claude cleans up your messy blurb into a working title, an angle, bullet notes, links and a category. It reuses an existing category or makes a new one. Without a key, a simpler built-in cleaner does the job.
- **GitHub token** (optional, but needed to publish). Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) scoped to **only this repository**, with **Contents: Read and write**. Each add, edit or delete is committed to `data/ideas.json`, and the public page updates about a minute later.

Both keys are stored only in your browser's local storage. They never go into the page or the repo. Use **Forget keys** to remove them. Without a GitHub token, new ideas are saved in that browser only. The next time you save a token, the page offers to publish them.

## Data format

`data/ideas.json` holds a list of ideas. Each one looks like this:

```json
{
  "id": "republican-tiktok",
  "status": "upcoming",          // upcoming | drafting | idea | published
  "date": "7/14",                // free text, optional
  "series": "Post-election takes", // optional group label
  "title": "Inside the wild world of Republican TikTok",
  "angle": "Who's building the right's TikTok machine, and how does it work?",
  "notes": ["Interview Eric Wilson, Nathan Brand, Amanda Elliott"],
  "category": "Social Media",
  "links": [],
  "draftLink": "",
  "dataViz": false
}
```

You can also edit this file directly on GitHub. Categories come from whatever values are in the data, so a new category appears as soon as one idea uses it.
