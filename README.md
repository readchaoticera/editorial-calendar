# Chaotic Era: Editorial Calendar

A public, interactive editorial calendar and idea bank for the Chaotic Era newsletter. It uses the same branding as the [Substack Politics Leaderboard](https://readchaoticera.github.io/SubstackPoliticsLeaderboard/).

It's a static site (no build step): `index.html`, `styles.css`, `app.js`, and the data in `data/ideas.json`.

## Going live (GitHub Pages)

1. Repo **Settings → Pages**.
2. Under **Source**, pick **Deploy from a branch**. Choose the branch that holds these files and the `/ (root)` folder. Save.
3. The site shows up at `https://readchaoticera.github.io/editorial-calendar/` after a minute or so.

The repo has to be public for Pages on a free plan.

## Adding ideas from any device

Anyone can view the calendar. Only you can change it. Once a device is **connected**, every idea you add, edit or delete is committed to `data/ideas.json` in this repo. That means it's in the table on every device and in every future session.

**First device (one-time setup)**
1. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new). Set **Repository access** to only `readchaoticera/editorial-calendar`, set **Permissions → Contents** to **Read and write**, and pick a long expiration.
2. On the site, click **⚙ Editor → Or enter keys by hand**. Paste the token, and optionally an Anthropic API key so Claude does the cleanup. Click **Save & connect**. The badge turns green: "✓ Connected".

**Every other device (phone, laptop)**
1. On a connected device, open **⚙ Editor → Copy setup link** and send it to yourself privately (AirDrop, Notes, a text to yourself).
2. Open the link on the other device. It connects and removes the keys from the address bar.
3. On iPhone, a home-screen app has its own storage separate from Safari. If you use **Share → Add to Home Screen**, open the app, go to **⚙ Editor**, paste the setup link into **Quick connect**, and tap **Save & connect**.

The setup link contains your keys, so never post it publicly. If a link ever leaks, revoke the GitHub token and the Anthropic key, then make new ones.

If GitHub can't be reached when you add an idea, the idea is kept in that browser. It's sent to the calendar the next time you click **Save & connect**. **Forget keys** disconnects a device; your ideas stay in the calendar.

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
