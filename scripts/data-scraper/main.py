from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchElementException, ElementClickInterceptedException, WebDriverException
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import json
import re
import time
import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Union
from difflib import SequenceMatcher
import bisect
import requests

IS_DELTA = True
DELTA_BACKLOG_COUNT = 10

# Resolve the JSON output directory relative to this file so the scraper can be invoked from any CWD.
# Layout: <repo>/scripts/data-scraper/main.py -> parents[2] is the repo root, then src/data.
DATA_DIR = Path(__file__).resolve().parents[2] / "src" / "data"

GAMETORA_DATA_URL = "https://gametora.com/data"
GAMETORA_MANIFESTS_URL = f"{GAMETORA_DATA_URL}/manifests/umamusume.json"
GAMETORA_MANIFEST_DATA_BASE_URL = f"{GAMETORA_DATA_URL}/umamusume"

# Event name patterns that belong to the "After a Race" section.
AFTER_RACE_EVENT_PATTERNS = [
    "Victory! (G1)",
    "Victory! (G2/G3)",
    "Victory! (Pre/OP)",
    "Solid Showing (G1)",
    "Solid Showing (G2/G3)",
    "Solid Showing (Pre/OP)",
    "Defeat (G1)",
    "Defeat (G2/G3)",
    "Defeat (Pre/OP)",
    "Etsuko's Elated Coverage (G1)",
    "Etsuko's Elated Coverage (G2/G3)",
    "Etsuko's Elated Coverage (Pre/OP)",
    "Etsuko's Exhaustive Coverage (G1)",
    "Etsuko's Exhaustive Coverage (G2/G3)",
    "Etsuko's Exhaustive Coverage (Pre/OP)",
]


def load_after_race_events() -> Dict[str, List[str]]:
    """Load "After a Race" events from characters.json.

    These events are identical across all characters, so we only need to read
    them from the first character's data.

    Returns:
        A dictionary of event names to their options.
    """
    after_race_events: Dict[str, List[str]] = {}

    characters_file = str(DATA_DIR / "characters.json")
    if not os.path.exists(characters_file):
        logging.warning('characters.json not found. Cannot load "After a Race" events.')
        return after_race_events

    try:
        with open(characters_file, "r", encoding="utf-8") as f:
            characters_data = json.load(f)

        # Get the first character's data only.
        if not characters_data:
            logging.warning('characters.json is empty. Cannot load "After a Race" events.')
            return after_race_events

        first_character_events = next(iter(characters_data.values()))

        # Extract only events that match the "After a Race" patterns.
        for event_name, options in first_character_events.items():
            for pattern in AFTER_RACE_EVENT_PATTERNS:
                if event_name.startswith(pattern):
                    after_race_events[event_name] = options
                    break

        logging.info(f'Loaded {len(after_race_events)} "After a Race" events from characters.json.')

    except (json.JSONDecodeError, KeyError) as e:
        logging.warning(f'Failed to load "After a Race" events from characters.json: {e}')

    return after_race_events


def create_chromedriver():
    """Creates the Chrome driver for scraping.

    Returns:
        The Chrome driver.
    """
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")  # Use the new headless mode
    chrome_options.add_argument("--disable-gpu")  # Disable GPU hardware acceleration (recommended for containers)
    chrome_options.add_argument("--no-sandbox")  # Bypass OS security model (needed for some environments like Docker)
    chrome_options.add_argument("--window-size=1920,1080")  # Set a default window size for consistent rendering
    driver = webdriver.Chrome(options=chrome_options)
    return driver


def calculate_turn_number(date_string: str) -> int:
    """Calculates the turn number for a race based on its date string.

    This function parses race date strings in the format "Senior Class January, Second Half"
    and converts them to turn numbers using the same logic as the Kotlin GameDate.

    Args:
        date_string: The date string to parse (e.g., "Senior Class January, Second Half").

    Returns:
        The calculated turn number for the race.
    """
    if not date_string or date_string.strip() == "":
        logging.warning("Received empty date string, defaulting to Senior Year Early Jan (turn 49).")
        return 49

    # Handle Pre-Debut dates (though they shouldn't appear in race data).
    if "debut" in date_string.lower():
        logging.warning("Pre-Debut date detected in race data, this shouldn't happen.")
        return 1

    # Define mappings for years and months.
    years = {"Junior Class": 1, "Classic Class": 2, "Senior Class": 3}

    months = {
        "January": 1,
        "Jan": 1,
        "February": 2,
        "Feb": 2,
        "March": 3,
        "Mar": 3,
        "April": 4,
        "Apr": 4,
        "May": 5,
        "June": 6,
        "Jun": 6,
        "July": 7,
        "Jul": 7,
        "August": 8,
        "Aug": 8,
        "September": 9,
        "Sep": 9,
        "October": 10,
        "Oct": 10,
        "November": 11,
        "Nov": 11,
        "December": 12,
        "Dec": 12,
    }

    # Parse the date string.
    # Expected format: "Senior Class January, Second Half"
    parts = date_string.strip().split()
    if len(parts) < 3:
        logging.warning(f"Invalid date string format: {date_string}, defaulting to Senior Year Early Jan (turn 49).")
        return 49

    # Extract year part (first two words).
    year_part = f"{parts[0]} {parts[1]}"
    month_part = parts[2].rstrip(",")  # Remove trailing comma if present.

    # Extract phase part (last two words combined).
    phase_part = f"{parts[-2]} {parts[-1]}"  # "First Half" or "Second Half"

    # Find the best match for year using similarity scoring.
    year = years.get(year_part)
    if year is None:
        best_year_score = 0.0
        best_year = 3  # Default to Senior Year.

        for year_key in years.keys():
            score = SequenceMatcher(None, year_part, year_key).ratio()
            if score > best_year_score:
                best_year_score = score
                best_year = years[year_key]

        logging.info(f"Year not found in mapping, using best match: {year_part} -> {best_year}")
        year = best_year

    # Find the best match for month using similarity scoring.
    month = months.get(month_part)
    if month is None:
        best_month_score = 0.0
        best_month = 1  # Default to January.

        for month_key in months.keys():
            score = SequenceMatcher(None, month_part, month_key).ratio()
            if score > best_month_score:
                best_month_score = score
                best_month = months[month_key]

        logging.info(f"Month not found in mapping, using best match: {month_part} -> {best_month}")
        month = best_month

    # Determine phase (Early = First Half, Late = Second Half).
    phase = "Early" if "First" in phase_part else "Late"

    # Calculate the turn number.
    # Each year has 24 turns (12 months x 2 phases each).
    # Each month has 2 turns (Early and Late).
    turn_number = ((year - 1) * 24) + ((month - 1) * 2) + (1 if phase == "Early" else 2)

    return turn_number


def download_image(url: str, out_fp: str):
    """
    Downloads an image from the given URL and saves it to the specified file path.

    Args:
        url (str): The URL of the image to download.
        out_fp (str): The file path to save the downloaded image to.
    """
    try:
        response = requests.get(url)
        response.raise_for_status()
        with open(out_fp, "wb") as f_out:
            f_out.write(response.content)
    except requests.exceptions.RequestException as exc:
        print(f"An error occurred when downloading image: {exc}")


def fetch_gametora_manifest_data(manifest_name: str) -> dict:
    """Fetches data from GameTora's JSON manifest.

    Args:
        manifest_name (str): The name of the manifest to fetch data from.

    Returns:
        The fetched manifest data JSON as a dictionary.
    """
    response = requests.get(GAMETORA_MANIFESTS_URL, timeout=60)
    response.raise_for_status()
    manifests = response.json()

    manifest_id = manifests[manifest_name]
    manifest_url = f"{GAMETORA_MANIFEST_DATA_BASE_URL}/{manifest_name}.{manifest_id}.json"
    response = requests.get(manifest_url)
    response.raise_for_status()
    manifest_data = response.json()
    return manifest_data


class BaseScraper:
    """Base class for scraping data from the website.

    Args:
        url (str): The URL to scrape.
        output_filename (str): The filename to save the scraped data to.
    """

    def __init__(self, url: str, output_filename: str):
        self.url = url
        self.output_filename = str(DATA_DIR / output_filename)
        self.data = self.load_existing_data()
        self.initial_data_count = len(self.data) if IS_DELTA else 0
        self.cookie_accepted = False

    def safe_click(self, driver: webdriver.Chrome, element: WebElement, retries: int = 3, delay: float = 0.5):
        """Try clicking an element normally and falls back to JS click if blocked by ads/overlays.

        Args:
            driver (webdriver.Chrome): The Chrome driver.
            element (WebElement): The web element to interact with.
            retries (int, optional): How many times to retry if intercepted.
            delay (float, optional): Seconds to wait between retries
        """
        for _ in range(retries):
            try:
                element.click()
                return True
            except ElementClickInterceptedException:
                # Fallback to scrolling + JS click.
                try:
                    driver.execute_script("arguments[0].scrollIntoView(true);", element)
                    driver.execute_script("arguments[0].click();", element)
                    return True
                except WebDriverException as _:
                    # If JS click fails, wait a bit and retry.
                    time.sleep(delay)
        return False

    def load_existing_data(self):
        """Loads existing JSON data from the output file if delta scraping is enabled.

        Returns:
            The loaded data dictionary, or an empty dictionary if the file doesn't exist or delta scraping is disabled.
        """
        if not IS_DELTA:
            return {}

        if not os.path.exists(self.output_filename):
            logging.info(f"Output file {self.output_filename} does not exist. Starting with empty data.")
            return {}

        try:
            with open(self.output_filename, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                logging.info(f"Loaded {len(existing_data)} existing items from {self.output_filename} for delta merge.")
                return existing_data
        except json.JSONDecodeError as e:
            logging.warning(f"Failed to parse existing JSON file {self.output_filename}: {e}. Starting with empty data.")
            return {}
        except Exception as e:
            logging.warning(f"Failed to load existing data from {self.output_filename}: {e}. Starting with empty data.")
            return {}

    def save_data(self):
        """Saves the scraped data to a file."""
        # Sort keys alphabetically to maintain consistent ordering.
        sorted_data = {key: self.data[key] for key in sorted(self.data.keys())}

        with open(self.output_filename, "w", encoding="utf-8") as f:
            json.dump(sorted_data, f, ensure_ascii=False, indent=4)

        if IS_DELTA and self.initial_data_count > 0:
            new_or_updated = len(self.data) - self.initial_data_count
            logging.info(
                f"Saved {len(self.data)} items to {self.output_filename} (delta merge: {self.initial_data_count} existing + {new_or_updated} new/updated)."
            )
        else:
            logging.info(f"Saved {len(self.data)} items to {self.output_filename}.")

    def handle_cookie_consent(self, driver: webdriver.Chrome):
        """Handles the cookie consent.

        Args:
            driver (webdriver.Chrome): The Chrome driver.
        """
        if not self.cookie_accepted:
            try:
                cookie_consent_button = driver.find_element(By.XPATH, "//button[contains(@class, 'legal_cookie_banner_button')]")
                if cookie_consent_button:
                    cookie_consent_button.click()
                    time.sleep(0.5)
                    self.cookie_accepted = True
                    logging.info("Cookie consent accepted.")
            except NoSuchElementException:
                logging.info("No cookie consent button found.")
                self.cookie_accepted = True

    def handle_ad_banner(self, driver: webdriver.Chrome, skip: bool = False):
        """Handles the ad banner.

        Args:
            driver (webdriver.Chrome): The Chrome driver.
            skip (bool, optional): Whether to skip the ad banner. Defaults to False.

        Returns:
            Whether the ad banner was dismissed.
        """
        if not skip:
            try:
                ad_banner_button = driver.find_element(By.XPATH, "//div[contains(@class, 'publift-widget-sticky_footer-button')]")
                if ad_banner_button and ad_banner_button.is_displayed():
                    ad_banner_button.click()
                    time.sleep(0.5)
                    logging.info("Ad banner dismissed.")
                    return True
            except NoSuchElementException:
                logging.info("No ad banner found.")
            return False
        else:
            return True

    def extract_training_event_options(self, tooltip_rows: List[WebElement]):
        """Extracts the training event options from the tooltip rows.

        Args:
            tooltip_rows (List[WebElement]): The tooltip rows.

        Returns:
            The training event options.
        """
        options = []
        for tooltip_row in tooltip_rows:
            event_option_div = tooltip_row.find_element(By.XPATH, ".//div[contains(@class, 'sc-') and contains(@class, '-2 ')]")
            event_result_divs = event_option_div.find_elements(By.XPATH, ".//div")
            text_fragments = [div.text.strip() for div in event_result_divs]

            # Handle events where it offers random outcomes.
            if text_fragments and "Randomly either" in text_fragments[0]:
                option_text = "Randomly either\n----------\n"

                # Group the outcomes by dividers.
                current_group = []
                for fragment in text_fragments[1:]:
                    if fragment == "or":
                        option_text += "\n".join(current_group) + "\n----------\n"
                        current_group = []
                    else:
                        current_group.append(fragment)
                # Add the last group to the option text.
                if current_group:
                    option_text += "\n".join(current_group)
            else:
                # Otherwise, just join the text fragments for regular event outcomes.
                option_text = "\n".join(text_fragments)

            # Replace all instances of "Wisdom" with "Wit" to match the in-game terminology.
            option_text = option_text.replace("Wisdom", "Wit")
            options.append(option_text)
        return options

    def process_training_events(
        self, driver: webdriver.Chrome, item_name: str, data_dict: Dict[str, List[str]], include_after_race_events: bool = False
    ):
        """Processes the training events for the given item.

        Args:
            driver (webdriver.Chrome): The Chrome driver.
            item_name (str): The name of the item.
            data_dict (Dict[str, List[str]]): The data dictionary to modify.
            include_after_race_events (bool): Whether to include 'After a Race' events (only for characters).
        """
        # Find all training events first.
        all_training_events_unfiltered = driver.find_elements(
            By.XPATH, "//button[contains(@class, 'sc-') and contains(@class, '-0 ')]"
        )
        logging.info(f"Found {len(all_training_events_unfiltered)} unfiltered training events for {item_name}.")

        # Find the "Events Without Choices" section header and exclude events from its following grid.
        # The section header is a div with class 'sc-*-0' containing the text "Events Without Choices".
        # The grid following it (sc-*-2) contains training events we want to exclude.
        events_to_exclude = set()
        try:
            # Find the div containing "Events Without Choices" text.
            no_choices_header = driver.find_element(
                By.XPATH, "//div[contains(@class, 'sc-') and contains(@class, '-0 ') and contains(text(), 'Events Without Choices')]"
            )
            # Find the next sibling div which should be the grid containing events without choices.
            no_choices_grid = no_choices_header.find_element(
                By.XPATH, "./following-sibling::div[contains(@class, 'sc-') and contains(@class, '-2 ')][1]"
            )
            # Get all training event buttons within this grid.
            events_without_choices = no_choices_grid.find_elements(
                By.XPATH, ".//button[contains(@class, 'sc-') and contains(@class, '-0 ')]"
            )
            events_to_exclude = set(events_without_choices)
            logging.info(f"Found {len(events_to_exclude)} events without choices to exclude for {item_name}.")
        except NoSuchElementException:
            logging.info(f'No "Events Without Choices" section found for {item_name}. Including all events.')

        # Filter out the events without choices.
        all_training_events = [event for event in all_training_events_unfiltered if event not in events_to_exclude]
        logging.info(f"Found {len(all_training_events)} training events (after filtering) for {item_name}.")

        # Find the "After a Race" section and exclude its events from scraping.
        # These events are identical across all characters, so we copy them from characters.json.
        if include_after_race_events:
            after_race_events = set()
            try:
                after_race_header = driver.find_element(
                    By.XPATH, "//div[contains(@class, 'sc-') and contains(@class, '-0 ') and contains(text(), 'After a Race')]"
                )
                after_race_grid = after_race_header.find_element(
                    By.XPATH, "./following-sibling::div[contains(@class, 'sc-') and contains(@class, '-2 ')][1]"
                )
                after_race_buttons = after_race_grid.find_elements(
                    By.XPATH, ".//button[contains(@class, 'sc-') and contains(@class, '-0 ')]"
                )
                after_race_events = set(after_race_buttons)
                logging.info(f'Found {len(after_race_events)} "After a Race" events to copy for {item_name}.')
            except NoSuchElementException:
                logging.info(f'No "After a Race" section found for {item_name}.')

            # Filter out the "After a Race" events from the list to scrape.
            all_training_events = [event for event in all_training_events if event not in after_race_events]
            logging.info(f'Found {len(all_training_events)} training events (after excluding "After a Race") for {item_name}.')

            # Copy the "After a Race" events from the preloaded cache.
            data_dict.update(self.after_race_events)
            logging.info(f'Copied {len(self.after_race_events)} "After a Race" events for {item_name}.')

        ad_banner_closed = False

        for j, training_event in enumerate(all_training_events):
            self.safe_click(driver, training_event)
            time.sleep(1.0)

            tooltip = driver.find_element(By.XPATH, "//div[@data-tippy-root]")
            try:
                tooltip_title = tooltip.find_element(By.XPATH, ".//div[contains(@class, 'sc-') and contains(@class, '-2 ')]").text
                if tooltip_title in data_dict:
                    logging.info(
                        f"Training event {tooltip_title} ({j + 1}/{len(all_training_events)}) already exists. Overwriting with new data..."
                    )
            except NoSuchElementException:
                logging.warning(f"No tooltip title found for training event ({j + 1}/{len(all_training_events)}).")
                continue

            tooltip_rows = tooltip.find_elements(By.XPATH, ".//div[contains(@class, 'sc-') and contains(@class, '-0 ')]")
            if len(tooltip_rows) == 0:
                logging.warning(f"No options found for training event {tooltip_title} ({j + 1}/{len(all_training_events)}).")
                continue

            logging.info(f"Found {len(tooltip_rows)} options for training event {tooltip_title} ({j + 1}/{len(all_training_events)}).")
            options = self.extract_training_event_options(tooltip_rows)
            data_dict[tooltip_title] = options

            ad_banner_closed = self.handle_ad_banner(driver, ad_banner_closed)

    def _sort_by_value(self, driver: webdriver.Chrome, value_key: str):
        """Sorts the list elements by the given value key.

        Args:
            driver (webdriver.Chrome): The Chrome driver.
            value_key (str): The key to sort by.
        """
        # Click on the "Sort by" dropdown and select the value key.
        sort_by_dropdown = driver.find_element(By.XPATH, "//select[contains(@id, ':r')]")
        sort_by_dropdown.click()
        time.sleep(0.5)
        value_option = sort_by_dropdown.find_element(By.XPATH, f".//option[@value='{value_key}']")
        value_option.click()
        time.sleep(0.5)


class SkillScraper(BaseScraper):
    """Scrapes the skills from the website."""

    def __init__(self):
        super().__init__("https://gametora.com/umamusume/skills", "skills.json")

    def scrape_skill_evaluation_points(self):
        """Scrapes skill Evaluation Points from the umamusume wiki.

        Evaluation Points affect the result rank of a trainee.
        Unsure whether the evaluation points are 1:1 with the rank gained or if they
        are just a factor of the rank calculation.

        We also scrape the evaluation point ratio which is just the ratio
        of evaluation points to the base cost of the skill.

        Returns:
            The skill evaluation points as a dictionary mapping skill ID to evaluation points.
        """
        driver = create_chromedriver()
        driver.get("https://umamusu.wiki/Game:List_of_Skills")
        data = {}

        tables = driver.find_elements(By.TAG_NAME, "table")
        for table in tables:
            tbody = table.find_element(By.TAG_NAME, "tbody")
            rows = tbody.find_elements(By.TAG_NAME, "tr")
            for row in rows:
                cells = row.find_elements(By.TAG_NAME, "td")
                skill_name_anchor = cells[1].find_element(By.TAG_NAME, "a")
                skill_id = skill_name_anchor.get_attribute("title")
                skill_id = int("".join(filter(str.isdigit, skill_id)))
                skill_points = int(cells[3].text.strip())
                if skill_points == 0:
                    continue
                skill_evaluation_points = int(cells[4].text.strip())
                skill_point_ratio = float(cells[5].text.strip())
                data[skill_id] = {
                    "evaluation_points": skill_evaluation_points,
                    "point_ratio": skill_point_ratio,
                }

        driver.quit()
        return data

    def scrape_skill_tier_list(self):
        """Scrapes Game8's skill tier list.

        Game8's tier list is split across four different tables (SS, S, A, and B).
        Since they don't use any unique IDs for the tables, we instead use the headers
        before each table to determine which rank is associated with each table.
        See `h4_tier_map` for the mapping of header to tier.

        There are other tier lists out there but this site seems like it isn't
        going anywhere so it makes it relatively stable for scraping.

        Returns:
            The tier list of skills as a dictionary mapping skill name to tier.
        """
        driver = create_chromedriver()
        driver.get("https://game8.co/games/Umamusume-Pretty-Derby/archives/536805")

        # Game8 renders the tier-list tables client-side after the initial page load,
        # so wait for the first tier table to appear before querying any of them.
        WebDriverWait(driver, 30).until(EC.presence_of_element_located((By.XPATH, "//h4[@id='hs_1']/following-sibling::table[2]")))

        h4_tier_map = {
            "hs_1": 0,  # SS
            "hs_2": 1,  # S
            "hs_3": 2,  # A
            "hs_4": 3,  # B
        }

        res = {}

        for h4_id, tier_name in h4_tier_map.items():
            table = driver.find_element(By.XPATH, f"//h4[@id='{h4_id}']/following-sibling::table[2]")
            tds = table.find_elements(By.TAG_NAME, "td")

            for td in tds:
                divs = td.find_elements(By.TAG_NAME, "div")
                for div in divs:
                    anchor = div.find_elements(By.TAG_NAME, "a")[-1]
                    skill_name = anchor.text.strip()
                    # Make sure we use the same special characters as GameTora.
                    skill_name = skill_name.replace("◯", "○")
                    skill_name = skill_name.replace("◎", "◎")
                    # Get rid of any double spaces.
                    skill_name = skill_name.replace("  ", "")
                    if skill_name in res and res[skill_name] != tier_name:
                        logging.warning(
                            f"Skill is already in tier map with conflicting value: {skill_name} ({tier_name} != {res[skill_name]})"
                        )
                        continue
                    res[skill_name] = tier_name

        driver.quit()

        # They misspelled some skill names so we need to fix them.
        # Pretty much if you run the scraper and it throws an error for a skill,
        # just make sure that the skill isn't misspelled and then
        # update this map.
        rename_map = {
            "Let's Pump Some Iron": "Let's Pump Some Iron!",
            "Fast and Furious": "Fast & Furious",
            "Mile Straightaway ○": "Mile Straightaways ○",
            "Mile Straightaway ◎": "Mile Straightaways ◎",
            "Flowery ☆ Maneuver": "Flowery☆Maneuver",
            "OMG! ☆ The Final Sprint (ﾟ∀ﾟ)": "OMG! (ﾟ∀ﾟ) The Final Sprint! ☆",
        }

        for old_name, new_name in rename_map.items():
            if old_name in res:
                res[new_name] = res.pop(old_name)
            else:
                logging.warning(f"Old name not in rename_map: {old_name}")

        return res

    def get_skill_activation_conditions(self, skill_object: Dict[str, Any], get_preconditions: bool = False) -> str:
        """Gets the activation condition/precondition string for a skill.

        `skill_data` is a very complex and deeply nested JSON object.
        For each skill entry in this JSON, we need to extract the conditions
        and preconditions string values. However, these can be in one of a few places.

        The following is one of the more complex examples from the data:

        {
            "name_en": "Arrows Whistle, Shadows Disperse",
            "condition_groups": [
                {
                    "condition": "is_finalcorner==1",
                    "precondition": "phase>=2&order_rate<=50&overtake_target_time>=2",
                }
            ],
            "gene_version": {
                "condition_groups": [
                    {
                        "condition": "is_finalcorner==1",
                        "precondition": "phase>=2&order_rate<=50&overtake_target_time>=2",
                    }
                ],
            },
            "loc": {
                "en": {     // Global version
                    "condition_groups": [
                        {
                            "condition": "is_finalcorner==1&order_rate<=40&overtake_target_time>=2",
                        }
                    ],
                    "gene_version": {
                        "condition_groups": [
                            {
                                "condition": "is_finalcorner==1&order_rate<=40&overtake_target_time>=2",
                            }
                        ]
                    }
                }
            }
        }

        In this example, we have a unique skill. Since this is a unique skill,
        it has properties called "gene_version". The "gene_version" is the inherited
        version that can be purchased when inherited from legacy umamusume.

        If a skill has a gene_version, then we always want to use that data since
        the non-inherited version can't be purchased.

        However, in these entries we also have the "loc" property. This is the
        localization (i.e. JP, KO, Global). These localizations may be on different
        patches and thus may have different values. So we want to make sure to use
        the Global (en) localization.

        Then within the localization, we can extract our "condition" string.
        Take note that the "precondition" field is not in the localization.
        Not every entry contains all of these structures so we have to combine
        data across the existing fields to get everything we need.

        To do this, we try to get data using the following priority order:
        1) loc -> en -> gene_version -> condition_groups -> condition/precondition
        2) loc -> en -> condition_groups -> condition/precondition
        3) gene_version -> condition_groups -> condition/precondition
        4) condition_groups -> condition/precondition

        To sum up, we just need to get the most accurate data possible for the
        global release by combining the best data we can extract from the entry.
        Not every entry has all these fields so we just take what we can get.

        Args:
            skill_object (Dict[str, Any]) A single entry from skill_data. This is a complex nested dict.
            get_preconditions (bool, optional) Whether to get the "preconditions" entry
                instead of the "conditions" entry. Defaults to False.

        Returns:
            The condition string.
        """
        # Prioritize getting the english version of the condition group since it
        # should be the current global patch data.
        # Always try the gene_version first.
        groups = skill_object.get("loc", {}).get("en", {}).get("gene_version", None)
        if groups is not None:
            groups = skill_object.get("loc", {}).get("en", {}).get("gene_version", {}).get("condition_groups", None)
        else:
            groups = skill_object.get("loc", {}).get("en", {}).get("condition_groups", None)

        # Fall back to main condition_groups field.
        if groups is None:
            if "gene_version" in skill_object:
                groups = skill_object["gene_version"].get("condition_groups", None)
            else:
                groups = skill_object.get("condition_groups", None)

        # Just return now if we still havent found anything.
        if groups is None:
            return ""

        res = []
        for group in groups:
            condition = group.get("precondition" if get_preconditions else "condition", None)
            if condition is not None:
                res.append(condition)

        return "@".join(res)

    def start(self):
        self.data = {}

        # Get supplementary data for later use.
        skill_evaluation_points = self.scrape_skill_evaluation_points()
        skill_to_tier_map = self.scrape_skill_tier_list()
        # Capitalization on the website we use for the tier list may differ.
        # We need to make everything lowercase for proper lookups between sources.
        skill_to_tier_map_lowercase = {k.lower(): k for k in skill_to_tier_map.keys()}

        try:
            skill_data = fetch_gametora_manifest_data("skills")

            skill_id_to_name = {}
            for skill in skill_data:
                try:
                    # If name_en doesnt exist, then the skill isn't in global yet.
                    if "name_en" not in skill:
                        continue

                    skill_id = skill["id"]
                    skill_gene_id = skill_id
                    skill_name_en = skill["name_en"].strip().replace("  ", " ")
                    skill_desc_en = skill["desc_en"]
                    skill_iconid = skill["iconid"]
                    skill_rarity = skill["rarity"]
                    skill_inherited = False
                    skill_cost = skill.get("cost", None)
                    # For inherited unique skills, we actually want the
                    # gene version's ID since the primary ID isn't the one that
                    # we can purchase through inheritance.
                    if "gene_version" in skill:
                        skill_gene_id = skill["gene_version"]["id"]
                        skill_desc_en = skill["gene_version"]["desc_en"]
                        skill_iconid = skill["gene_version"]["iconid"]
                        skill_rarity = skill["gene_version"]["rarity"]
                        skill_inherited = skill["gene_version"].get("inherited", False)
                        skill_cost = skill["gene_version"].get("cost", None)

                    if skill_cost is None:
                        logging.warning(f"Dropping skill with invalid COST: {skill_name_en}")
                        continue

                    # Get the skill activation conditions.
                    skill_condition = self.get_skill_activation_conditions(skill)
                    skill_precondition = self.get_skill_activation_conditions(skill, get_preconditions=True)

                    extra_data = skill_evaluation_points.get(
                        skill_gene_id,
                        {"evaluation_points": 0, "point_ratio": 0.0},
                    )

                    # The tier list doesn't include any of the JP skills so we don't treat
                    # missing skills as errors. These warnings should be reviewed by maintainer
                    # in case any skill names are misspelled.
                    # We can ignore any negative skills since they won't appear in the tier list.
                    tmp_skill_name = skill_to_tier_map_lowercase.get(skill_name_en.lower(), None)
                    bIsNegative = skill_iconid % 10 == 4
                    if tmp_skill_name is None and not bIsNegative:
                        logging.warning(f"Skill Tier Unknown: {skill_name_en}")

                    community_tier = skill_to_tier_map.get(tmp_skill_name, None)

                    # Corrections to invalid GameTora skill data.
                    if skill_name_en.lower() == "indomitable" and skill_id != 200471:
                        # There are multiple entries with the name "Indomitable".
                        # Only the one with id 200471 is valid. Skip others.
                        continue
                    elif skill_id in [1000011, 1000012, 1000013, 1000014, 1000015, 1000016, 1000017]:
                        # These are carnival bonus skill IDs. These aren't currently valid.
                        # Unsure if they ever will be. So we skip them.
                        continue

                    for old_name, old_entry in self.data.items():
                        old_id = old_entry.get("id")
                        if old_id == skill_id:
                            logging.warning(
                                f"Duplicate ID when adding skill: {skill_name_en} ({skill_id}), Previous entry: {old_name} ({old_id})"
                            )

                    tmp = {
                        "id": skill_id,
                        "gene_id": skill_gene_id,
                        "name_en": skill_name_en,
                        "desc_en": skill_desc_en,
                        "icon_id": skill_iconid,
                        "cost": skill_cost,
                        "eval_pt": extra_data["evaluation_points"],
                        "pt_ratio": extra_data["point_ratio"],
                        "rarity": skill_rarity,
                        "condition": skill_condition,
                        "precondition": skill_precondition,
                        "inherited": skill_inherited,
                        "community_tier": community_tier,
                        "versions": sorted(skill.get("versions", [])),
                        "upgrade": None,
                        "downgrade": None,
                    }
                    skill_id_to_name[skill["id"]] = skill_name_en

                    self.data[skill_name_en] = tmp
                except KeyError as exc:
                    if "name_en" in skill:
                        logging.error(f"KeyError when parsing skill ({skill['name_en']}): {exc}")
                    else:
                        logging.error(f"KeyError when parsing skill: {exc}")
                    continue

            # Populate the upgrade/downgrade versions for every skill.
            for skill_name, skill in self.data.items():
                # If skill has no other versions, skip.
                if skill["versions"] == []:
                    continue

                # Now determine the upgrades/downgrades of this skill.
                index = bisect.bisect_left(skill["versions"], skill["id"])
                if index == 0:
                    # This is the highest level of this skill.
                    downgrade_version = skill["versions"][0]
                    if downgrade_version in skill_id_to_name:
                        self.data[skill_name]["downgrade"] = downgrade_version
                elif index == len(skill["versions"]):
                    # This is the lowest level of this skill.
                    upgrade_version = skill["versions"][-1]
                    if upgrade_version in skill_id_to_name:
                        self.data[skill_name]["upgrade"] = upgrade_version
                else:
                    # Skill has both an upgraded and downgraded variant.
                    upgrade_version = skill["versions"][index - 1]
                    if upgrade_version in skill_id_to_name:
                        self.data[skill_name]["upgrade"] = upgrade_version

                    downgrade_version = skill["versions"][index]
                    if downgrade_version in skill_id_to_name:
                        self.data[skill_name]["downgrade"] = downgrade_version

            # Save the skill icons
            icon_ids = set(x["icon_id"] for x in self.data.values())
            for icon_id in icon_ids:
                url = f"https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_{icon_id}.png"
                out_fp = f"../pages/SkillSettings/icons/utx_ico_skill_{icon_id}.png"
                download_image(url, out_fp)

            self.save_data()

        except Exception as exc:
            print("Error:", exc)


class CharacterScraper(BaseScraper):
    """Scrapes the characters from the website.

    Args:
        after_race_events (Dict[str, List[str]]): Preloaded "After a Race" events to copy to each character.
    """

    def __init__(self, after_race_events: Dict[str, List[str]]):
        super().__init__("https://gametora.com/umamusume/characters", "characters.json")
        self.after_race_events = after_race_events

    def start(self):
        """Starts the scraping process."""
        driver = create_chromedriver()
        driver.get(self.url)
        time.sleep(5)

        self.handle_cookie_consent(driver)

        # Sort the characters by release date descending order.
        self._sort_by_value(driver, "implemented")

        # Get all character links.
        try:
            character_grid = driver.find_element(By.XPATH, "//div[contains(@class, 'characters_page_character_list')]")
        except NoSuchElementException:
            # Fallback to general lookup just in case.
            character_grid = driver.find_element(By.XPATH, "//div[contains(@class, 'sc-dc9ce0a6-0')]")
        
        all_character_items = character_grid.find_elements(By.CSS_SELECTOR, "a[href^='/umamusume/characters/']")
        # Filter out hidden elements using Selenium's is_displayed() method.
        character_items = [item for item in all_character_items if item.is_displayed()]

        logging.info(f"Found {len(character_items)} characters.")
        character_links = [item.get_attribute("href") for item in character_items]

        # If this is a delta scrape, scrape the first 10 characters as the list is now sorted by descending release date.
        if IS_DELTA:
            character_links = character_links[:DELTA_BACKLOG_COUNT]
            logging.info(
                f"Scraping the first {DELTA_BACKLOG_COUNT} characters for the delta scrape as the list is now sorted by descending release date."
            )

        # Iterate through each character.
        for i, link in enumerate(character_links):
            logging.info(f"Navigating to {link} ({i + 1}/{len(character_links)})")
            driver.get(link)
            time.sleep(3)

            character_name = driver.find_element(By.XPATH, "//main//h1").text
            character_name = character_name.replace("(Original)", "").strip()
            # Remove any other parentheses that denote different forms of the character like "Wedding" or "Swimsuit".
            character_name = re.sub(r"\s*\(.*?\)", "", character_name).strip()

            # Initialize an empty object to store the following character data if it doesn't exist yet.
            if character_name not in self.data:
                self.data[character_name] = {}

            # Scrape all the Training Events (including "After a Race" events for characters).
            self.process_training_events(driver, character_name, self.data[character_name], include_after_race_events=True)

        self.save_data()
        driver.quit()


class SupportCardScraper(BaseScraper):
    """Scrapes the support cards from the website."""

    def __init__(self):
        super().__init__("https://gametora.com/umamusume/supports", "supports.json")

    def start(self):
        """Starts the scraping process."""
        driver = create_chromedriver()
        driver.get(self.url)
        time.sleep(5)

        self.handle_cookie_consent(driver)

        # Sort the support cards by release date descending order.
        self._sort_by_value(driver, "implemented")

        # Get all support card links.
        support_card_grid = driver.find_element(By.XPATH, "//div[contains(@class, 'sc-dc9ce0a6-0')]")
        all_support_card_items = support_card_grid.find_elements(By.CSS_SELECTOR, "a[href^='/umamusume/supports/']")
        # Filter out hidden elements using Selenium's is_displayed() method.
        filtered_support_card_items = [item for item in all_support_card_items if item.is_displayed()]

        logging.info(f"Found {len(filtered_support_card_items)} support cards.")
        support_card_links = [item.get_attribute("href") for item in filtered_support_card_items]

        # If this is a delta scrape, scrape the first 10 support cards as the list is now sorted by descending release date.
        if IS_DELTA:
            support_card_links = support_card_links[:DELTA_BACKLOG_COUNT]
            logging.info(
                f"Scraping the first {DELTA_BACKLOG_COUNT} support cards for the delta scrape as the list is now sorted by descending release date."
            )

        # Iterate through each support card.
        for i, link in enumerate(support_card_links):
            logging.info(f"Navigating to {link} ({i + 1}/{len(support_card_links)})")
            driver.get(link)
            time.sleep(3)

            support_card_name = driver.find_element(By.XPATH, "//main//h1").text
            support_card_name = support_card_name.replace("Support Card", "").strip()
            # Remove any other parentheses that denote different forms of the support card.
            support_card_name = re.sub(r"\s*\(.*?\)", "", support_card_name).strip()

            # Initialize an empty object to store the following support card data if it doesn't exist yet.
            if support_card_name not in self.data:
                self.data[support_card_name] = {}

            # Extract the rarity from the parentheses.
            rarity_match = re.search(r"\((SSR|SR|R)\)", support_card_name)
            if rarity_match:
                support_card_rarity = rarity_match.group(1)
                support_card_name = support_card_name.replace(f" ({support_card_rarity})", "").strip()
            else:
                # Fallback to a more basic method.
                support_card_rarity = support_card_name.split(" ")[-1].replace(")", "").replace("(", "").strip()

            # Scrape all the Training Events.
            self.process_training_events(driver, support_card_name, self.data[support_card_name])

        self.save_data()
        driver.quit()


class RaceScraper(BaseScraper):
    """Scrapes the races from the website."""

    def __init__(self):
        super().__init__("https://gametora.com/umamusume/races", "races.json")

    def start(self):
        """Starts the scraping process."""
        driver = create_chromedriver()
        driver.get(self.url)
        time.sleep(5)

        self.handle_cookie_consent(driver)

        # Get references to all the races in the list by locating their race banner images.
        race_images = driver.find_elements(By.CSS_SELECTOR, "img[src*='/race_banners/']")

        # Pop the first 2 races (Junior Make Debut and Junior Maiden Race).
        race_images = race_images[2:]

        # Pop the last 7 races (URA Finals, Grand Masters, Twinkle Star Climax).
        race_images = race_images[:-7]

        logging.info(f"Found {len(race_images)} races.")

        ad_banner_closed = False

        # Iterate through each race.
        for i, link in enumerate(race_images):
            ad_banner_closed = self.handle_ad_banner(driver, ad_banner_closed)

            logging.info(f"Opening race ({i + 1}/{len(race_images)})")
            self.safe_click(driver, link)
            time.sleep(0.5)

            # Acquire the elements needed to scrape the race information.
            dialog = driver.find_element(By.XPATH, "//div[@role='dialog']").find_element(
                By.XPATH, ".//div[contains(@class, 'races_det_wrapper')]"
            )
            dialog_infobox = dialog.find_element(By.XPATH, ".//div[contains(@class, 'races_det_infobox')]")
            dialog_schedules = dialog.find_elements(By.XPATH, ".//div[contains(@class, 'races_det_schedule')]")
            for dialog_schedule in dialog_schedules:
                dialog_schedule_items = dialog_schedule.find_elements(By.XPATH, ".//div[contains(@class, 'races_schedule_item')]")

                # Extract all caption-value pairs for the elements.
                captions = dialog_infobox.find_elements(By.XPATH, ".//div[contains(@class, 'races_det_item_caption')]")
                values = dialog_infobox.find_elements(By.XPATH, ".//div[contains(@class, 'races_det_item__')]")
                info_map = {}
                for cap, val in zip(captions, values):
                    info_map[cap.text.strip()] = val.text.strip()

                race_data = {
                    "name": dialog.find_element(By.XPATH, ".//div[contains(@class, 'races_det_header')]").text,
                    "date": dialog_schedule.find_element(By.XPATH, ".//div[contains(@class, 'races_schedule_header')]").text.replace(
                        "\n", " "
                    ),
                    "raceTrack": info_map.get("Racetrack"),
                    "course": info_map.get("Course"),
                    "direction": "Right" if info_map.get("Direction") in ["Clockwise", "Right"] else "Left",
                    "grade": info_map.get("Grade"),
                    "terrain": info_map.get("Terrain"),
                    # The umamusu wiki labels sprint races as "Short", but the in-game UI
                    # uses "Sprint" for both the race distance type and the matching aptitude.
                    # Normalize at scrape time so downstream consumers see one canonical name.
                    "distanceType": "Sprint" if info_map.get("Distance (type)") == "Short" else info_map.get("Distance (type)"),
                    "distanceMeters": int(info_map.get("Distance (meters)")),
                    "fans": int(
                        dialog_schedule_items[-1]
                        .text.replace("Fans gained", "")
                        .replace("for 1st place", "")
                        .replace("See all", "")
                        .strip()
                    ),
                }

                # Calculate turn number based on the race date.
                race_data["turnNumber"] = calculate_turn_number(race_data["date"])

                # Construct the in-game formatted name of the race.
                distance_type_formatted = "Med" if info_map.get("Distance (type)") == "Medium" else race_data["distanceType"]
                race_data["nameFormatted"] = (
                    f"{race_data['raceTrack']} {race_data['terrain']} {race_data['distanceMeters']}m ({distance_type_formatted}) {race_data['direction']}"
                )
                if race_data["course"]:
                    race_data["nameFormatted"] += f" / {race_data['course']}"

                logging.info(f"Race data: {race_data}")

                # Create a unique key that combines race name and date to handle duplicate race names.
                unique_key = f"{race_data['name']} ({race_data['date']})"
                self.data[unique_key] = race_data

            # Close the dialog.
            dialog_close_button = driver.find_element(By.XPATH, "//div[@role='dialog']").find_element(By.CSS_SELECTOR, "img[src='/images/ui/close.png']")
            self.safe_click(driver, dialog_close_button)
            time.sleep(0.5)

        self.save_data()
        driver.quit()


class EpithetScraper(BaseScraper):
    """Scrapes the epithets/nicknames from GameTora.

    Each epithet's row on GameTora is a free-text bullet list - scenario restriction (when
    present), conditions, qualifiers, then the reward. The Smart Race Solver stores these
    bullets verbatim into `bullet_points` and derives every structured property it needs
    from them at runtime: reward kind/amount, scenario gate, and the AND-list of race-win
    matchers the solver evaluates. `matchers` are derived here in the scraper via
    `derive_matchers` so a re-scrape always rebuilds them from current bullet text - no
    hand-curation step is required.
    """

    # Fields owned by the scraper.
    SCRAPED_FIELDS = (
        "name",
        "bullet_points",
        "scenarios",
        "characters",
        "matchers",
    )

    # Regex matching GameTora's `<X> scenario only` bullet. Group 1 captures the scenario.
    _SCENARIO_RESTRICTION_RE = re.compile(r"([A-Za-z][A-Za-z0-9 \-]*?) scenario only", re.IGNORECASE)

    # Regex matching GameTora's character-restriction bullet, e.g. `Yaeno Muteki only`.
    # Anchored so bullets with extra words (e.g. "Win 5 races as a Late Surger only")
    # never qualify. Bullets containing `scenario only` are filtered out by the caller.
    _CHARACTER_RESTRICTION_RE = re.compile(r"^(.+?)\s+only$")

    # //////////////////////////////////////////////////////////////////////////////////////////////////
    # //////////////////////////////////////////////////////////////////////////////////////////////////
    # Bullet -> matcher derivation

    # Number-word lookup so "Win three races..." is treated identically to "Win 3 races...".
    _NUMBER_WORDS = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    }
    # "twice" / "three times" / etc. -> numeric times count for `winRaceTimes`.
    _TIMES_WORDS = {
        "twice": 2, "three times": 3, "four times": 4,
        "five times": 5, "six times": 6, "seven times": 7,
    }

    # Whitelisted descriptor tokens for the `winCount` filter. Anything outside this set
    # disqualifies the bullet so the parser never produces a partially-correct matcher that
    # would over-fire (e.g. "Win 5 G1 races with a Mood level of Bad" - the Mood clause is
    # not representable, so we skip the whole bullet rather than emit a too-broad winCount).
    _TERRAIN_WORDS = {"dirt": "Dirt", "turf": "Turf"}
    _GRADE_WORDS = {"g1": "G1", "g2": "G2", "g3": "G3", "op": "OP"}
    # Includes GameTora's hyphenated forms ("short-distance", "medium-distance",
    # "long-distance"). "Sprint" / "Mile" / "Medium" / "Long" mirror the Kotlin
    # `TrackDistance` enum.
    _DISTANCE_WORDS = {
        "sprint": "Sprint",
        "short-distance": "Sprint",
        "mile": "Mile",
        "mile-length": "Mile",
        "medium": "Medium",
        "medium-distance": "Medium",
        "long": "Long",
        "long-distance": "Long",
    }
    # Distance shorthand: "core" = Mile + Medium, "non-core" = Sprint + Long. Mirrors
    # the in-game grouping used by Standard / Non-Standard Distance Leader.
    _DISTANCE_GROUP_WORDS = {
        "core": ["Mile", "Medium"],
        "non-core": ["Sprint", "Long"],
    }

    # Substrings that, when present in a bullet, mark it as carrying a sub-clause the
    # parser can't represent. Bullets matching any of these are dropped silently.
    # `with` / `that have` are intentionally not blanket-blocked - GameTora uses both
    # for representable filters (e.g. `with 'Junior Stakes' in their name`,
    # `that are held in either Sapporo or Hakodate`). The dedicated sub-parsers handle
    # those shapes before the generic block runs.
    _UNREPRESENTABLE_MARKERS = (
        " with a difference ", " with a length ", " with a mood ", " with at least ",
        " while ", " as a ", " as the ", " as most ",
        " without ", " having ", " before ", " inbetween ", " between ",
        " inherit ", " place higher ", " trigger ", " buy ",
        " activate ", " reach ", " earn ", " have ", " be at ", " complete the career",
        " raise the level", " mood level", " most popular", " single race",
        " parent ", " parents ", " from a parent", " from parents",
    )

    # Bullets that begin with these prefixes never describe a race-win condition.
    _NON_WIN_PREFIXES = (
        "reach ", "earn ", "have ", "be at ", "inherit ", "complete ", "raise ",
        "trigger ", "buy ", "activate ", "place ", "finish ", "without ",
    )

    def __init__(self):
        super().__init__("https://gametora.com/umamusume/nicknames", "epithets.json")

    def start(self):
        """Starts the scraping process."""
        driver = create_chromedriver()
        driver.get(self.url)
        time.sleep(5)

        self.handle_cookie_consent(driver)

        scraped = self._extract_epithets(driver)
        logging.info(f"Scraped {len(scraped)} epithets from {self.url}.")

        # Each scrape regenerates `matchers` from the current bullet text via
        # `derive_matchers`. This keeps the JSON fully automated - GameTora copy
        # changes flow into solver matchers on the next re-scrape, and there's no
        # hand-curation step that can drift. The merge with `self.data` still
        # passes through any extra fields a future schema may carry.
        for name, fresh in scraped.items():
            existing = self.data.get(name, {})
            merged = {}
            merged["name"] = fresh.get("name", existing.get("name", name))
            merged["bullet_points"] = fresh.get("bullet_points", existing.get("bullet_points", []))
            merged["scenarios"] = self.derive_scenarios(merged["bullet_points"])
            merged["characters"] = self.derive_characters(merged["bullet_points"])
            merged["matchers"] = self.derive_matchers(merged["bullet_points"])
            self.data[name] = merged

        self.save_data()
        driver.quit()

    @classmethod
    def derive_scenarios(cls, bullets: List[str]) -> List[str]:
        """Pulls scenario-restriction names out of the bullet list.

        Each `<X> scenario only` bullet contributes the captured scenario name. An empty
        list means the epithet is universally obtainable across every scenario. Mirrors
        `EpithetFilters.scenariosFromBullets` in Kotlin and `scenariosForEpithet` in TS.

        Args:
            bullets: The epithet's `bullet_points` array as scraped from GameTora.

        Returns:
            Distinct scenario names referenced by any restriction bullet, in order.
        """
        out: List[str] = []
        seen: set = set()
        for raw in bullets:
            for m in cls._SCENARIO_RESTRICTION_RE.finditer(raw):
                name = m.group(1).strip()
                if name and name not in seen:
                    seen.add(name)
                    out.append(name)
        return out

    @classmethod
    def derive_characters(cls, bullets: List[str]) -> List[str]:
        """Pulls character-restriction names out of the bullet list.

        Each standalone `<character name> only` bullet contributes the captured name.
        Bullets containing `scenario only` are skipped so the two restriction kinds never
        collide. An empty list means the epithet has no character gate. Mirrors
        `EpithetFilters.charactersFromBullets` in Kotlin and `charactersForEpithet` in TS.

        Args:
            bullets: The epithet's `bullet_points` array as scraped from GameTora.

        Returns:
            Distinct character names referenced by any standalone restriction bullet.
        """
        out: List[str] = []
        seen: set = set()
        for raw in bullets:
            trimmed = raw.strip().rstrip(".")
            if "scenario only" in trimmed.lower():
                continue
            m = cls._CHARACTER_RESTRICTION_RE.fullmatch(trimmed)
            if m is None:
                continue
            name = m.group(1).strip()
            if name and name not in seen:
                seen.add(name)
                out.append(name)
        return out

    @classmethod
    def derive_matchers(cls, bullets: List[str]) -> List[Dict[str, Any]]:
        """Builds the AND-combined `matchers` list for an epithet from its bullet text.

        Each bullet is run through a strict pattern cascade. Bullets that match a known
        race-win shape contribute one (or more) structured matcher entries. Everything
        else is dropped. The conservative approach prevents partially-recognised bullets
        from over-firing - the solver would rather miss a matcher than mis-complete an
        epithet that still has unfulfilled conditions.

        Recognised bullet shapes (case-insensitive):

        - `Get [either] the X[, Y, ... [and|or] Z] epithet[s]` -> `epithetAll` /
          `epithetAnyOf` (the `either` keyword switches to the disjunctive form).
        - `Win any (N|<word>) of [the] A, B, ... [and|or] Z` -> `winAnyOf` with `count=N`.
        - `Win [either] the X or [the] Y` -> `winAnyOf` with `count=1`.
        - `Win [at least|exactly] N <descriptor> races?` where `<descriptor>` is composed
          only of whitelisted terrain / grade / distance / "graded" tokens -> `winCount`
          with the corresponding `filter`. The "country's name" idiom maps to
          `nameContainsCountry: true` for the Globe-Trotter epithet.
        - `Win the X[, Y, ... [and|or] Z]` -> one `winRace` per name, with `atClass` lifted
          from any `(Junior|Classic|Senior)` qualifier.
        - `Win the X (twice|N times)` -> `winRaceTimes`.

        Args:
            bullets: The epithet's `bullet_points` array as scraped from GameTora.

        Returns:
            Ordered list of structured matchers. Empty when no bullet matched any
            recognised shape.
        """
        out: List[Dict[str, Any]] = []
        for raw in bullets:
            b = raw.strip().rstrip(".")
            if not b:
                continue
            lower = b.lower()
            # Skip the reward bullet and the scenario-restriction bullet outright.
            if lower.startswith("reward:"):
                continue
            if "scenario only" in lower:
                continue
            # Skip bullets carrying sub-clauses we can't represent. Emitting a
            # partial matcher here would mark the epithet completable on conditions
            # the user hasn't actually met.
            if any(marker in (" " + lower + " ") for marker in cls._UNREPRESENTABLE_MARKERS):
                continue
            if any(lower.startswith(p) for p in cls._NON_WIN_PREFIXES):
                continue

            matcher = (
                cls._parse_get_epithet(b)
                or cls._parse_win_any_of(b)
                or cls._parse_win_count_at_tracks(b)
                or cls._parse_win_count_name_contains(b)
                or cls._parse_win_count_country_idiom(b)
                or cls._parse_win_count_grade_open(b)
                or cls._parse_win_one_per_distance(b)
                or cls._parse_win_count(b)
                or cls._parse_win_either_or(b)
                or cls._parse_win_races(b)
            )
            if matcher is None:
                continue
            if isinstance(matcher, list):
                for entry in matcher:
                    cls._attach_display_label(entry)
                    out.append(entry)
            else:
                cls._attach_display_label(matcher)
                out.append(matcher)
        return out

    @classmethod
    def _attach_display_label(cls, matcher: Dict[str, Any]) -> None:
        """Stamps `displayLabel` / `displayLabelTemplate` onto `matcher` in place.

        These fields are the canonical condition strings consumed by the React popover, the
        Race History tooltip in `log_viewer.html`, and the Kotlin win log. Synthesizing them
        once at scrape time means no runtime layer needs its own filter -> phrase translation,
        so the three surfaces can no longer drift apart on wording.

        Args:
            matcher: A matcher dict freshly produced by one of the `_parse_*` helpers. The
                relevant key is mutated in place. Dependency matchers
                (`epithetAll`, `epithetAnyOf`) gain neither field.
        """
        t = matcher.get("type")
        if t == "winRace":
            name = matcher.get("name")
            if name:
                matcher["displayLabel"] = f"Win the {name}"
        elif t == "winRaceTimes":
            name = matcher.get("name")
            times = matcher.get("times")
            if name and times is not None:
                matcher["displayLabel"] = f"Win the {name} ({times} times)"
            elif name:
                matcher["displayLabel"] = f"Win the {name}"
        elif t in ("winAnyOf", "winAtLeast"):
            matcher["displayLabelTemplate"] = "Win the {race}"
        elif t == "winCount":
            count = matcher.get("count", 1)
            phrase = cls._describe_filter(matcher.get("filter") or {})
            if count != 1:
                phrase = re.sub(r"race$", "races", phrase)
            matcher["displayLabel"] = f"Win {count} {phrase}"

    @classmethod
    def _describe_filter(cls, f: Dict[str, Any]) -> str:
        """Synthesizes the noun phrase describing a `winCount` matcher's filter clause.

        Field order mirrors the Kotlin / TypeScript convention: grade -> OP+ -> graded -> distanceTypes -> terrain -> nameContainsCountry -> nameContains -> raceTracks -> "race".
        This is the only place in the codebase that turns filter shapes into English; both
        runtimes consume the result via `displayLabel`.

        Args:
            f: The filter dict from a `winCount` matcher.

        Returns:
            A noun phrase like `"G1 Sprint/Mile Turf race"` suitable for prefixing with `"Win N "`.
        """
        parts: List[str] = []
        grade = f.get("grade")
        if grade:
            parts.append(grade)
        if f.get("gradeAtLeastOpen"):
            parts.append("OP+")
        if f.get("gradedOnly"):
            parts.append("graded")
        dts = f.get("distanceTypes") or []
        if dts:
            parts.append("/".join(d[0].upper() + d[1:].lower() for d in dts))
        terrain = f.get("terrain")
        if terrain:
            parts.append(terrain[0].upper() + terrain[1:].lower())
        if f.get("nameContainsCountry"):
            parts.append("country-named")
        nc = f.get("nameContains")
        if nc:
            parts.append(f'"{nc}"-named')
        tracks = f.get("raceTracks") or []
        if tracks:
            parts.append("at " + "/".join(tracks))
        parts.append("race")
        return " ".join(parts)

    @classmethod
    def _parse_get_epithet(cls, b: str) -> Optional[Dict[str, Any]]:
        """Parses `Get [either] the X[, Y[ and|or] Z] epithet[s]` into `epithetAll` / `epithetAnyOf`.

        Args:
            b: The bullet text to match (already stripped of leading/trailing whitespace and trailing period).

        Returns:
            The matcher dict, or None when `b` doesn't match the prefix.
        """
        m = re.match(r"^Get\s+(either\s+)?the\s+(.+?)\s+epithets?$", b, re.IGNORECASE)
        if not m:
            return None
        is_either = bool(m.group(1))
        names = cls._split_name_list(m.group(2))
        if not names:
            return None
        kind = "epithetAnyOf" if is_either else "epithetAll"
        return {"type": kind, "names": [n for n, _ in names]}

    @classmethod
    def _parse_win_any_of(cls, b: str) -> Optional[Dict[str, Any]]:
        """Parses `Win any (N|<word>) of [the] A, B[, ... [and|or] Z]` into `winAtLeast`.

        GameTora's "any N of" phrasing maps to the distinct-race variant - racing the same horse twice doesn't count for two - so
        we emit `EpithetMatcher.WinAtLeast` rather than the looser `EpithetMatcher.WinAnyOf` which counts repeats.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(r"^Win\s+any\s+(\d+|[A-Za-z]+)\s+of\s+(?:the\s+)?(.+)$", b, re.IGNORECASE)
        if not m:
            return None
        count = cls._parse_count_word(m.group(1))
        if count is None:
            return None
        names = cls._split_name_list(m.group(2))
        if not names:
            return None
        return {"type": "winAtLeast", "names": [n for n, _ in names], "count": count}

    @classmethod
    def _parse_win_either_or(cls, b: str) -> Optional[Dict[str, Any]]:
        """Parses `Win [either] the X or [the] Y` into `winAnyOf` with `count=1`.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(r"^Win\s+(?:either\s+)?the\s+(.+?)\s+or\s+(?:the\s+)?(.+)$", b, re.IGNORECASE)
        if not m:
            return None
        # Reject if the right side itself contains another " or " - that's a list and
        # `_split_name_list` would handle it, but only via `_parse_win_any_of` which
        # has already run. Falling through avoids ambiguity.
        if " or " in m.group(2):
            return None
        a, ac_a = cls._strip_class(m.group(1).strip())
        b_name, ac_b = cls._strip_class(m.group(2).strip())
        if not a or not b_name:
            return None
        entry: Dict[str, Any] = {"type": "winAnyOf", "names": [a, b_name], "count": 1}
        if ac_a and ac_a == ac_b:
            entry["atClass"] = ac_a
        return entry

    @classmethod
    def _parse_win_count_name_contains(cls, b: str) -> Optional[Dict[str, Any]]:
        """Recognises `Win N races with 'X' in their name` (Junior Jewel, Umatastic) and produces a `winCount` with `nameContains: "X"`.

        The single-quoted substring may use either ASCII or curly quotes.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(
            r"^Win\s+(\d+|[A-Za-z]+)\s+races?\s+with\s+['‘’\"“”](.+?)['‘’\"“”]\s+in\s+their\s+name$",
            b,
            re.IGNORECASE,
        )
        if not m:
            return None
        count = cls._parse_count_word(m.group(1))
        if count is None:
            return None
        return {"type": "winCount", "count": count, "filter": {"nameContains": m.group(2)}}

    @classmethod
    def _parse_win_count_grade_open(cls, b: str) -> Optional[Dict[str, Any]]:
        """Recognises `Win N races of grade Open or higher` (Pro Racer) and produces a `winCount` with `gradeAtLeastOpen: true`.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(
            r"^Win\s+(\d+|[A-Za-z]+)\s+races?\s+of\s+grade\s+open\s+or\s+higher$",
            b,
            re.IGNORECASE,
        )
        if not m:
            return None
        count = cls._parse_count_word(m.group(1))
        if count is None:
            return None
        return {"type": "winCount", "count": count, "filter": {"gradeAtLeastOpen": True}}

    @classmethod
    def _parse_win_one_per_distance(cls, b: str) -> Optional[List[Dict[str, Any]]]:
        """Recognises `Win one [terrain] D1, D2[, ... and Dn] race` (Dirt Dancer, Turf Tussler).

        Emits a separate `winCount` per distance with `count=1`, each carrying the shared terrain filter when present. Returning a list
        lets `derive_matchers` flatten them into the AND list.

        Args:
            b: The bullet text to match.

        Returns:
            A list of matcher dicts (one per distance), or None when `b` doesn't match the shape.
        """
        m = re.match(r"^Win\s+one\s+(.+?)\s+races?$", b, re.IGNORECASE)
        if not m:
            return None
        descriptor = m.group(1)
        # Normalise " and " / " or " into commas to make tokenisation order-free.
        normalised = re.sub(r"\s+(?:and|or)\s+", ", ", descriptor, flags=re.IGNORECASE)
        tokens = [t.strip() for t in normalised.split(",") if t.strip()]
        # First word may be a terrain ("dirt"/"turf"), shared across the per-distance
        # matchers. The remaining tokens must each map to a single distance type.
        terrain: Optional[str] = None
        if tokens and tokens[0].lower().split()[0] in cls._TERRAIN_WORDS:
            head = tokens[0].lower().split()
            terrain = cls._TERRAIN_WORDS[head[0]]
            # Strip the terrain word out of the first token so the rest of it (e.g.
            # "short-distance" in "dirt short-distance") survives as a distance.
            rest = " ".join(head[1:]).strip()
            if rest:
                tokens[0] = rest
            else:
                tokens.pop(0)
        # Every remaining token must resolve to one distance. If even one fails, we
        # skip the bullet rather than emit a partial set.
        distances: List[str] = []
        for t in tokens:
            d = cls._DISTANCE_WORDS.get(t.lower())
            if d is None:
                return None
            distances.append(d)
        if not distances:
            return None
        out: List[Dict[str, Any]] = []
        for d in distances:
            f: Dict[str, Any] = {"distanceTypes": [d]}
            if terrain:
                f["terrain"] = terrain
            out.append({"type": "winCount", "count": 1, "filter": f})
        return out

    @classmethod
    def _parse_win_count_country_idiom(cls, b: str) -> Optional[Dict[str, Any]]:
        """Recognises GameTora's Globe-Trotter wording, `Win N races which include a country's name in their name`.

        Produces a `winCount` with the `nameContainsCountry` filter - the only filter shape that doesn't fit the token-based
        descriptor parser.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(
            r"^Win\s+(\d+|[A-Za-z]+)\s+races?\s+which\s+include\s+a\s+country['’]?s?\s+name",
            b,
            re.IGNORECASE,
        )
        if not m:
            return None
        count = cls._parse_count_word(m.group(1))
        if count is None:
            return None
        return {"type": "winCount", "count": count, "filter": {"nameContainsCountry": True}}

    @classmethod
    def _parse_win_count_at_tracks(cls, b: str) -> Optional[Dict[str, Any]]:
        """Recognises `Win N <descriptor> races (that are )?held in/at <track list>` and produces a `winCount` with `raceTracks`.

        Any `gradedOnly` flag picked up from the descriptor is preserved. Used by the Hokkaido Hotshot / Kanto Conqueror /
        Tohoku Top Dog / Kokura Constable / West Japan Whiz / Kyushu / Pro Racer epithets, which all describe their
        location filter this way.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(
            r"^Win\s+(?:at\s+least\s+|exactly\s+)?(\d+|[A-Za-z]+)\s+(.+?)\s+races?\s+(?:that\s+are\s+)?held\s+(?:in|at|on)\s+(?:either\s+)?(.+)$",
            b,
            re.IGNORECASE,
        )
        if not m:
            return None
        count = cls._parse_count_word(m.group(1))
        if count is None:
            return None
        descriptor = m.group(2).strip()
        filt = cls._parse_filter(descriptor) or {}
        if filt is None:
            return None
        track_list = cls._split_name_list(m.group(3))
        if not track_list:
            return None
        filt["raceTracks"] = [name for name, _ in track_list]
        return {"type": "winCount", "count": count, "filter": filt}

    @classmethod
    def _parse_win_count(cls, b: str) -> Optional[Dict[str, Any]]:
        """Parses `Win [at least|exactly] N <descriptor> races?` into `winCount`.

        Args:
            b: The bullet text to match.

        Returns:
            The matcher dict, or None when `b` doesn't match the shape.
        """
        m = re.match(
            r"^Win\s+(?:at\s+least\s+|exactly\s+)?(\d+|[A-Za-z]+)\s+(.+?)\s+races?$",
            b,
            re.IGNORECASE,
        )
        if not m:
            return None
        count = cls._parse_count_word(m.group(1))
        if count is None:
            return None
        descriptor = m.group(2).strip()
        # "races which include a country's name in their name" - the only special-case
        # idiom on GameTora that maps to the structured `nameContainsCountry` filter.
        if "country" in descriptor.lower() and "name" in descriptor.lower():
            return {"type": "winCount", "count": count, "filter": {"nameContainsCountry": True}}
        filt = cls._parse_filter(descriptor)
        if filt is None:
            return None
        return {"type": "winCount", "count": count, "filter": filt}

    @classmethod
    def _parse_win_races(cls, b: str) -> Optional[Union[Dict[str, Any], List[Dict[str, Any]]]]:
        """Parses `Win the X[, Y, ... [and] Z] [twice|N times]` into one or more `winRace` entries.

        Returns a single `winRaceTimes` entry when the bullet ends in a repeat qualifier. The leading `the` is required
        so race-count bullets (`Win 3 graded races that are held in either Sapporo or Hakodate`) don't accidentally
        split on their internal `or`.

        Args:
            b: The bullet text to match.

        Returns:
            A single `winRaceTimes` dict, a list of `winRace` dicts, or None when `b` doesn't match the shape.
        """
        # Detect a trailing repeat qualifier: " twice" / " three times" / etc.
        repeat: Optional[int] = None
        body = b
        for phrase, n in cls._TIMES_WORDS.items():
            suffix = f" {phrase}"
            if body.lower().endswith(suffix):
                repeat = n
                body = body[: -len(suffix)].rstrip()
                break

        m = re.match(r"^Win\s+the\s+(.+)$", body, re.IGNORECASE)
        if not m:
            return None
        names = cls._split_name_list(m.group(1))
        if not names:
            return None

        if repeat is not None:
            if len(names) != 1:
                # Ambiguous: "Win the A, B and C twice" - skip rather than guess.
                return None
            name, atclass = names[0]
            entry: Dict[str, Any] = {"type": "winRaceTimes", "name": name, "times": repeat}
            if atclass:
                entry["atClass"] = atclass
            return entry

        out: List[Dict[str, Any]] = []
        for name, atclass in names:
            entry = {"type": "winRace", "name": name}
            if atclass:
                entry["atClass"] = atclass
            out.append(entry)
        return out

    @classmethod
    def _parse_filter(cls, descriptor: str) -> Optional[Dict[str, Any]]:
        """Translates a `winCount` descriptor like `dirt G1` or `non-core distance` into a filter dict.

        Returns None when the descriptor contains a token that doesn't map to a whitelisted filter key - that's the
        safety guard that prevents partial matchers.

        Args:
            descriptor: The descriptor portion of the bullet (between count and `races?`).

        Returns:
            A filter dict, or None when any token in `descriptor` is unrecognised.
        """
        f: Dict[str, Any] = {}
        # The "distance" suffix in "core distance" / "non-core distance" is grammatical
        # filler - drop it so the group token resolves cleanly.
        cleaned = re.sub(r"\bdistance\b", " ", descriptor, flags=re.IGNORECASE)
        for token in cleaned.split():
            tl = token.lower().rstrip(",")
            if not tl:
                continue
            if tl in cls._TERRAIN_WORDS:
                f["terrain"] = cls._TERRAIN_WORDS[tl]
            elif tl in cls._GRADE_WORDS:
                f["grade"] = cls._GRADE_WORDS[tl]
            elif tl in cls._DISTANCE_WORDS:
                f.setdefault("distanceTypes", []).append(cls._DISTANCE_WORDS[tl])
            elif tl in cls._DISTANCE_GROUP_WORDS:
                # "core" / "non-core" expand to a fixed multi-distance set.
                f.setdefault("distanceTypes", []).extend(cls._DISTANCE_GROUP_WORDS[tl])
            elif tl == "graded":
                f["gradedOnly"] = True
            else:
                # Any unknown token disqualifies the entire bullet - bail rather than
                # produce a partially-correct filter that would over-fire.
                return None
        return f

    @classmethod
    def _parse_count_word(cls, raw: str) -> Optional[int]:
        """Returns the integer for `raw` (digit string or English number word).

        Args:
            raw: A digit string (e.g. "3") or English number word (e.g. "three").

        Returns:
            The integer value, or None when `raw` is neither a digit string nor a known number word.
        """
        s = raw.lower().strip()
        if s.isdigit():
            return int(s)
        return cls._NUMBER_WORDS.get(s)

    @classmethod
    def _split_name_list(cls, s: str) -> List[Tuple[str, Optional[str]]]:
        """Splits a comma/`and`/`or`-separated race or epithet list.

        Any `(Junior|Classic|Senior)` class qualifier is stripped into the second tuple element.

        Args:
            s: The list string (e.g. `"Tokyo Yushun (Classic), Arima Kinen and Japan Cup"`).

        Returns:
            A list of `(name, atClass)` tuples in input order; `atClass` is None when no class qualifier was present.
        """
        s = s.strip().rstrip(".")
        # Replace " and " / " or " with commas before splitting so the list reads
        # uniformly. Avoid splitting inside parens (e.g. "Tokyo Yushun (Japanese
        # Derby)") by temporarily masking them.
        masked = re.sub(r"\(([^)]*)\)", lambda m: "(" + m.group(1).replace(",", "\x00").replace(" and ", "\x01").replace(" or ", "\x02") + ")", s)
        # Replace top-level " and "/" or " with commas.
        masked = re.sub(r"\s+(?:and|or)\s+", ", ", masked, flags=re.IGNORECASE)
        parts = [p.strip() for p in masked.split(",") if p.strip()]
        out: List[Tuple[str, Optional[str]]] = []
        for p in parts:
            # Restore masked separators inside parens.
            p = p.replace("\x00", ",").replace("\x01", " and ").replace("\x02", " or ")
            # Drop a leading "the " from items like "the Hanshin Juvenile Fillies".
            p = re.sub(r"^the\s+", "", p, flags=re.IGNORECASE)
            name, atclass = cls._strip_class(p)
            if not name:
                continue
            out.append((name, atclass))
        return out

    @classmethod
    def _strip_class(cls, name: str) -> Tuple[str, Optional[str]]:
        """Splits a trailing `(Junior|Classic|Senior)` qualifier off `name`.

        Other parenthesised suffixes (e.g. `Tokyo Yushun (Japanese Derby)`) are left intact.

        Args:
            name: A race-name candidate that may carry a trailing class qualifier.

        Returns:
            A `(name, atClass)` tuple where `atClass` is the capitalised class name when present, otherwise None.
        """
        m = re.match(r"^(.+?)\s+\((Junior|Classic|Senior)\)$", name, re.IGNORECASE)
        if m:
            return m.group(1).strip(), m.group(2).capitalize()
        return name.strip(), None

    def _extract_epithets(self, driver: webdriver.Chrome) -> Dict[str, Dict[str, Any]]:
        """Extracts epithet rows from the GameTora nicknames page.

        As of 2026-05, each row uses CSS-module classes prefixed `titles_nickname_row`,
        with the name in a `titles_nickname_name` block (containing a `<b>` element) and
        the bullet list in a `titles_nickname_desc` block as a `<ul><li>` list. The reward
        is the last `<li>` and is prefixed with "Reward: " when present. We capture every
        bullet verbatim - downstream parsers strip the "Reward: " prefix and handle
        reward/scenario derivation.

        Args:
            driver: An active Selenium webdriver positioned on the nicknames page.

        Returns:
            Dict keyed by epithet name with `name` and `bullet_points` populated.
        """
        results: Dict[str, Dict[str, Any]] = {}

        # The nicknames list renders as repeated `titles_nickname_row` blocks. Selector substrings
        # may need updating if GameTora reshuffles their CSS modules.
        rows = driver.find_elements(By.XPATH, "//div[contains(@class, 'titles_nickname_row')]")

        for row in rows:
            try:
                name_el = row.find_element(By.XPATH, ".//*[contains(@class, 'titles_nickname_name')]//b")
                name = name_el.text.strip()
                if not name:
                    continue

                bullet_points = self._extract_bullets(row)

                results[name] = {
                    "name": name,
                    "bullet_points": bullet_points,
                }
            except NoSuchElementException as e:
                logging.warning(f"Skipping epithet row due to missing element: {e}")
                continue

        return results

    @staticmethod
    def _extract_bullets(row: WebElement) -> List[str]:
        """Extracts every `<li>` element from a row's `titles_nickname_desc` block.

        Returns the bullets verbatim in GameTora's display order: scenario restriction first
        when present, conditions/qualifiers middle, the "Reward: ..." bullet last. Each
        bullet is normalized for whitespace. The "Reward: " prefix (when present) is
        preserved so downstream parsers can locate the reward bullet by prefix.

        Args:
            row: The nickname row element from GameTora.

        Returns:
            Ordered list of bullet strings as they appear on the page. Empty if the row had
            no bullet-shaped children.
        """
        try:
            elements = row.find_elements(By.XPATH, ".//*[contains(@class, 'titles_nickname_desc')]//li")
        except NoSuchElementException:
            return []
        out: List[str] = []
        for el in elements:
            text = " ".join(el.text.split())
            if not text:
                continue
            out.append(text)
        return out


class CharacterPresetScraper(BaseScraper):
    """Scrapes per-character distance and surface aptitudes for the Smart Race Solver.

    Each character page on GameTora has a "Track aptitude" panel with six grade letters
    (Sprint, Mile, Medium, Long, Turf, Dirt). The Smart Race Solver feeds these into its
    aptitude eligibility filter, so they need to stay in sync with what's in the game.

    Output schema (one entry per character) matches `src/data/characterPresets.json`:

        {
            "<character name>": {
                "name": "<character name>",
                "distanceAptitudes": { "Sprint": "F", "Mile": "C", "Medium": "A", "Long": "C" },
                "surfaceAptitudes": { "Turf": "A", "Dirt": "G" }
            }
        }
    """

    DISTANCE_KEYS = ("Sprint", "Mile", "Medium", "Long")
    SURFACE_KEYS = ("Turf", "Dirt")
    VALID_GRADES = ("S", "A", "B", "C", "D", "E", "F", "G")
    # GameTora labels the sprint distance "Short". The rest of the labels match our output keys directly.
    PAGE_LABEL_TO_KEY = {"Short": "Sprint", "Mile": "Mile", "Medium": "Medium", "Long": "Long", "Turf": "Turf", "Dirt": "Dirt"}

    def __init__(self):
        super().__init__("https://gametora.com/umamusume/characters", "characterPresets.json")

    def _load_released_en_names(self) -> Optional[set]:
        """Fetches the GameTora characters manifest and returns the set of EN-playable names.

        GameTora ships a static JSON dataset at `data/umamusume/characters.<hash>.json`. Each entry has a `playable_en` flag
        indicating whether the character is on the EN/global server. Returns None on any failure so the caller can fall back
        to scraping every character page (the legacy behaviour) without crashing.

        Returns:
            The set of EN-playable character names, or None when the manifest fetch or parse fails.
        """
        try:
            manifest = requests.get(GAMETORA_MANIFESTS_URL, timeout=15).json()
            char_hash = manifest.get("characters")
            if not char_hash:
                return None
            url = f"{GAMETORA_MANIFEST_DATA_BASE_URL}/characters.{char_hash}.json"
            chars = requests.get(url, timeout=20).json()
            return set(c["en_name"] for c in chars if c.get("playable_en") and c.get("en_name"))
        except Exception as e:
            logging.warning(f"Failed to fetch released-EN character list from manifest: {e}")
            return None

    def start(self):
        """Walks every released-EN character page and extracts the aptitude grades."""
        driver = create_chromedriver()
        driver.get(self.url)
        time.sleep(5)

        self.handle_cookie_consent(driver)
        self._sort_by_value(driver, "implemented")

        try:
            character_grid = driver.find_element(By.XPATH, "//div[contains(@class, 'characters_page_character_list')]")
        except NoSuchElementException:
            character_grid = driver.find_element(By.XPATH, "//div[contains(@class, 'sc-dc9ce0a6-0')]")

        all_links = character_grid.find_elements(By.CSS_SELECTOR, "a[href^='/umamusume/characters/']")
        character_links = [item.get_attribute("href") for item in all_links if item.is_displayed()]

        # Filter to only characters that are playable on the EN/global server. Without this,
        # the scraper produces presets for ~150 characters including JP-only / unreleased ones
        # that the user can never actually pick in their game.
        released_en = self._load_released_en_names()
        if released_en is not None:
            logging.info(f"Loaded {len(released_en)} EN-playable character names from manifest.")

        if IS_DELTA:
            character_links = character_links[:DELTA_BACKLOG_COUNT]
            logging.info(f"Delta scrape: limiting to first {DELTA_BACKLOG_COUNT} characters.")

        logging.info(f"Found {len(character_links)} character pages to scan for aptitudes.")

        for i, link in enumerate(character_links):
            logging.info(f"[{i + 1}/{len(character_links)}] Scraping aptitudes from {link}")
            try:
                driver.get(link)
                time.sleep(2)

                name = driver.find_element(By.XPATH, "//main//h1").text
                name = name.replace("(Original)", "").strip()
                name = re.sub(r"\s*\(.*?\)", "", name).strip()
                if not name:
                    continue

                if released_en is not None and name not in released_en:
                    logging.info(f"Skipping {name}: not playable on EN server.")
                    continue

                aptitudes = self._extract_aptitudes(driver)
                if aptitudes is None:
                    logging.warning(f"Skipping {name}: aptitude panel not found.")
                    continue

                self.data[name] = {
                    "name": name,
                    "distanceAptitudes": {k: aptitudes.get(k, "G") for k in self.DISTANCE_KEYS},
                    "surfaceAptitudes": {k: aptitudes.get(k, "G") for k in self.SURFACE_KEYS},
                }
            except NoSuchElementException as e:
                logging.warning(f"Skipping character at {link}: {e}")
                continue

        self.save_data()
        driver.quit()

    def _extract_aptitudes(self, driver: webdriver.Chrome) -> Optional[Dict[str, str]]:
        """Pulls the distance and surface grade letters from the character's aptitude infobox.

        GameTora renders each aptitude as an infobox row whose first child is the label and whose grade is an `<img>`
        alt letter (e.g. "A", "G") inside a "characters_aptitude_rank_icon" element. Running-style rows (Front, Pace,
        Late, End) share the same markup, so they are filtered out by `PAGE_LABEL_TO_KEY`. Class fragments are matched
        by prefix to tolerate the hashed suffixes GameTora appends to its CSS-module class names.

        Args:
            driver: An active Selenium webdriver positioned on a character page.

        Returns:
            Dict mapping each output key to a one-letter grade. Returns `None` when no aptitude rows are found so the
            caller can skip cleanly.
        """
        rows = driver.find_elements(
            By.XPATH,
            "//div[contains(@class, 'characters_infobox_row_split')][.//*[contains(@class, 'characters_aptitude_rank_icon')]]",
        )
        if not rows:
            return None

        out: Dict[str, str] = {}
        for row in rows:
            try:
                label = row.find_element(By.XPATH, "./*[1]").text.strip()
            except NoSuchElementException:
                continue
            key = self.PAGE_LABEL_TO_KEY.get(label)
            if key is None:
                continue
            try:
                icon_img = row.find_element(By.XPATH, ".//*[contains(@class, 'characters_aptitude_rank_icon')]//img")
                grade = (icon_img.get_attribute("alt") or "").strip().upper()
            except NoSuchElementException:
                continue
            if grade in self.VALID_GRADES:
                out[key] = grade
        return out if out else None


if __name__ == "__main__":
    logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
    start_time = time.time()

    skill_scraper = SkillScraper()
    skill_scraper.start()

    after_race_events = load_after_race_events()
    character_scraper = CharacterScraper(after_race_events)
    character_scraper.start()

    support_card_scraper = SupportCardScraper()
    support_card_scraper.start()

    # Races are static so no need to re-scrape every time.
    # race_scraper = RaceScraper()
    # race_scraper.start()

    epithet_scraper = EpithetScraper()
    epithet_scraper.start()

    character_preset_scraper = CharacterPresetScraper()
    character_preset_scraper.start()

    end_time = round(time.time() - start_time, 2)
    logging.info(f"Total time for processing all applications: {end_time} seconds or {round(end_time / 60, 2)} minutes.")
