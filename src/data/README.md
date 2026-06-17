# Game Data

Generated game-data JSON files consumed by the React Native frontend (via `import x from "../../data/X.json"`) and by the Kotlin bot's Android unit tests (which read these paths directly off disk).

To refresh, run the scraper from the repo root:

```bash
python scripts/data-scraper/main.py
```

See [`scripts/data-scraper/README.md`](../../scripts/data-scraper/README.md) for setup, prerequisites, and what each scrape pass does.

## Data Files

- `characters.json`: Training events and options for all characters.
- `races.json`: Race calendar data.
- `skills.json`: Skill IDs, names, costs, and tier rankings.
- `supports.json`: Support card event data.
- `scenarios.json`: Scenario-specific event data (e.g., URA, Unity Cup, Trackblazer). This is updated manually to include special event overrides and logic for each scenario.
- `epithets.json`: Smart Race Solver nickname / epithet definitions. Scraper-owned fields are refreshed; `dependsOn` and `matchers` are hand-curated and preserved across re-scrapes.
- `characterPresets.json`: Smart Race Solver starting aptitudes per character.
- `character_objectives.json`: Per-character mandatory career-objective races for the URA scenario. Produced by the `CharacterObjectivesScraper` in `scripts/data-scraper/main.py`. Consumed by the Smart Race Solver to lock the turns the game forces a mandatory race so it does not schedule optional races or training on those turns.
